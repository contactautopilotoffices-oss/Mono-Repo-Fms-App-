"""
SQL Engine v2 — Schema-Aware with FK Graph and Python-Side JOIN
================================================================

Features:
- FK graph validation for JOINs
- Python-side JOIN for multi-table queries (PostgREST doesn't support JOINs)
- Intelligent query planning (single table vs multi-table)
- Aggregation support via Python computation
- Clarification on empty results
- ROBUST date parsing for LLM-generated SQL
- Proper property scoping (respects explicit property_id in WHERE)
- Increased fetch limits for aggregation queries

Usage:
    from cassandra.tools.sql_engine_v2 import SQLEngineV2

    engine = SQLEngineV2()
    result = engine.execute(
        query="SELECT * FROM electricity_readings JOIN properties ON ...",
        context={"org_id": "...", "property_id": "..."}
    )
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from cassandra.orchestrator import Tool, ToolResult, OrchestratorContext
from cassandra.tools.fk_graph import FKGraph, get_fk_graph
from cassandra.tools.fms_schema import TABLES, VALID_STATUS
from cassandra.tools.sql_guard import SENSITIVE_COLUMNS

logger = logging.getLogger("cassandra.tools.sql_engine_v2")


# Supabase config
SUPABASE_URL = os.environ.get(
    "FMS_SUPABASE_URL",
    os.environ.get("EXPO_PUBLIC_SUPABASE_URL", ""),
)
SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "AUTH_SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("FMS_SUPABASE_SERVICE_ROLE_KEY", ""),
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_ROW_LIMIT = 200
AGGREGATION_ROW_LIMIT = 1000
JOIN_ROW_LIMIT = 1000

# Date columns we know about in the schema
DATE_COLUMNS = {
    "created_at", "updated_at", "reading_date", "entry_date", "revenue_date",
    "done_date", "planned_date", "completion_date", "date", "event_at",
    "check_in_at", "check_out_at", "accepted_at", "assigned_at", "resolved_at",
    "closed_at", "validated_at", "approved_at", "rejected_at", "ordered_at",
    "delivered_at", "cancelled_at", "escalated_at", "verified_at", "generated_at",
    "contract_start_date", "contract_end_date", "effective_from", "effective_to",
    "last_maintenance_date", "next_maintenance_date", "booking_date",
    "cycle_start", "cycle_end", "period_start", "period_end",
    "started_at", "started_at", "last_seen_at", "first_login",
    "last_activity", "session_start", "session_end",
}


class SQLEngineV2:
    """
    SQL Engine v2 with FK-aware JOIN support and robust LLM SQL parsing.

    Execution path:
    1. Parse query for tables, columns, WHERE, ORDER BY, LIMIT
    2. If multi-table: fetch each table separately, JOIN in Python
    3. If single-table: execute via PostgREST with proper params
    4. Compute aggregations in Python (PostgREST GROUP BY is limited)
    """

    def __init__(self):
        self.fk_graph = get_fk_graph()
        self._http_client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        self._http_client = httpx.AsyncClient(timeout=30.0)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._http_client:
            await self._http_client.aclose()

    def execute(self, query: str, context: dict[str, Any]) -> ToolResult:
        """
        Execute a query with FK-aware validation.
        Thread-safe sync wrapper — works whether or not an event loop is running.
        """
        def _run():
            return asyncio.run(self.execute_async(query, context))

        try:
            asyncio.get_running_loop()
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(_run).result(timeout=60)
        except RuntimeError:
            return asyncio.run(self.execute_async(query, context))

    async def execute_async(self, query: str, context: dict[str, Any]) -> ToolResult:
        """
        Async execute with FK validation and robust parsing.
        """
        org_id = context.get("org_id", "")
        property_id = context.get("property_id", "")

        logger.info(f"[SQL_ENGINE_V2] Query: {query[:120]}...")

        # Step 1: Validate FK joins
        if self.fk_graph.needs_join(query):
            is_valid, error = self.fk_graph.validate_sql_joins(query)
            if not is_valid:
                logger.warning(f"[SQL_ENGINE_V2] FK validation failed: {error}")
                return ToolResult(
                    call_id=f"v2_fkfail_{time.time():.0f}",
                    tool_name="sql_query",
                    success=False,
                    error=error,
                )

        # Step 2: Extract entities and plan execution
        tables = self._extract_tables(query)
        needs_join = len(tables) > 1

        if needs_join:
            return await self._execute_with_join(query, context, tables)
        else:
            return await self._execute_single_table(query, context)

    # ========================================================================
    # Query Parsing
    # ========================================================================

    def _extract_tables(self, sql: str) -> list[str]:
        """Extract table names from SQL query."""
        from_pattern = r'FROM\s+(\w+)'
        join_pattern = r'JOIN\s+(\w+)'

        tables = re.findall(from_pattern, sql, re.IGNORECASE)
        tables.extend(re.findall(join_pattern, sql, re.IGNORECASE))

        return list(dict.fromkeys(tables))  # Preserve order, remove duplicates

    def _parse_query(self, sql: str) -> dict[str, Any]:
        """
        Parse simplified SQL into components with comprehensive extraction.

        Returns dict with:
        - table: primary table name
        - tables: all tables involved
        - columns: list of selected columns (or ["*"])
        - select_raw: raw SELECT clause
        - where: WHERE clause string
        - order_by: ORDER BY clause string
        - order_col: column to order by
        - order_dir: asc or desc
        - limit: int limit value
        - is_count: bool
        - is_sum: bool
        - is_distinct: bool
        - group_by: GROUP BY column
        - is_aggregate: bool
        """
        result: dict[str, Any] = {
            "table": "",
            "tables": [],
            "columns": ["*"],
            "select_raw": "",
            "where": "",
            "order_by": "",
            "order_col": "",
            "order_dir": "asc",
            "limit": None,
            "is_count": False,
            "is_sum": False,
            "is_avg": False,
            "is_min": False,
            "is_max": False,
            "is_distinct": False,
            "group_by": "",
            "is_aggregate": False,
        }

        sql_upper = sql.upper()

        # Extract tables
        result["tables"] = self._extract_tables(sql)
        if result["tables"]:
            result["table"] = result["tables"][0]

        # Extract SELECT columns
        select_match = re.search(
            r'SELECT\s+(DISTINCT\s+)?(.+?)\s+FROM\s+',
            sql, re.IGNORECASE | re.DOTALL
        )
        if select_match:
            result["is_distinct"] = bool(select_match.group(1))
            select_body = select_match.group(2).strip()
            result["select_raw"] = select_body
            result["columns"] = self._split_select_columns(select_body)

        # Detect COUNT(*), SUM(col), AVG, etc.
        if re.search(r'\bCOUNT\s*\(\s*\*?\s*\)', sql, re.IGNORECASE):
            result["is_count"] = True
            result["is_aggregate"] = True
        if re.search(r'\bSUM\s*\(', sql, re.IGNORECASE):
            result["is_sum"] = True
            result["is_aggregate"] = True
        if re.search(r'\bAVG\s*\(', sql, re.IGNORECASE):
            result["is_avg"] = True
            result["is_aggregate"] = True
        if re.search(r'\bMIN\s*\(', sql, re.IGNORECASE):
            result["is_min"] = True
            result["is_aggregate"] = True
        if re.search(r'\bMAX\s*\(', sql, re.IGNORECASE):
            result["is_max"] = True
            result["is_aggregate"] = True

        # Extract WHERE
        where_match = re.search(
            r'WHERE\s+(.+?)(?:ORDER\s+BY|LIMIT|GROUP\s+BY|$)',
            sql, re.IGNORECASE | re.DOTALL
        )
        if where_match:
            result["where"] = where_match.group(1).strip()

        # Extract ORDER BY
        order_match = re.search(
            r'ORDER\s+BY\s+([\w.]+)(?:\s+(ASC|DESC))?',
            sql, re.IGNORECASE
        )
        if order_match:
            result["order_by"] = order_match.group(0)
            result["order_col"] = order_match.group(1)
            result["order_dir"] = (order_match.group(2) or "asc").lower()

        # Extract LIMIT
        limit_match = re.search(r'LIMIT\s+(\d+)', sql, re.IGNORECASE)
        if limit_match:
            result["limit"] = int(limit_match.group(1))

        # Extract GROUP BY
        group_match = re.search(r'GROUP\s+BY\s+([\w.]+)', sql, re.IGNORECASE)
        if group_match:
            result["group_by"] = group_match.group(1)
            result["is_aggregate"] = True

        return result

    def _split_select_columns(self, select_body: str) -> list[str]:
        """
        Split a SELECT clause into individual column expressions.
        Handles table.column, aliases, and simple aggregates.
        """
        columns = []
        # Simple split by comma, but be careful with nested parens
        # For now, basic comma split is sufficient for LLM-generated queries
        parts = []
        depth = 0
        current = ""
        for char in select_body:
            if char == '(':
                depth += 1
                current += char
            elif char == ')':
                depth -= 1
                current += char
            elif char == ',' and depth == 0:
                parts.append(current.strip())
                current = ""
            else:
                current += char
        if current.strip():
            parts.append(current.strip())

        for part in parts:
            part = part.strip()
            if not part:
                continue
            # Extract alias if present: "expr AS alias" or "expr alias"
            alias_match = re.search(r'(?:AS\s+)?(\w+)\s*$', part, re.IGNORECASE)
            if alias_match and "(" in part:
                # For aggregates, use the alias or the inner column
                col = alias_match.group(1)
            else:
                col = part
            columns.append(col)
        return columns if columns else ["*"]

    # ========================================================================
    # WHERE Parsing — The heart of the fix
    # ========================================================================

    def _parse_where_to_params(
        self, where: str, context: dict[str, Any]
    ) -> dict[str, str]:
        """
        Convert simplified WHERE clauses to PostgREST query params.

        Handles:
        - property_id, organization_id (with explicit value detection)
        - status filters (single and IN)
        - Date / time range filters (comprehensive)
        - Comparison operators: =, !=, <>, >, >=, <, <=
        - LIKE / ILIKE patterns
        - IS NULL / IS NOT NULL
        - AND / OR compound conditions
        - CURRENT_DATE arithmetic
        - BETWEEN
        - DATE_TRUNC
        """
        params: dict[str, str] = {}
        if not where or not where.strip():
            return params

        where_clean = where.strip()

        # ── Detect explicit property_id in WHERE ─────────────────────────────
        # If the LLM explicitly set property_id = 'specific-uuid', we should
        # NOT override it with the session property_id later.
        explicit_property_id = self._extract_explicit_value(where_clean, "property_id")
        explicit_org_id = self._extract_explicit_value(where_clean, "organization_id")

        # Store these in params as metadata (will be stripped before HTTP call)
        if explicit_property_id:
            params["__explicit_property_id"] = explicit_property_id
        if explicit_org_id:
            params["__explicit_org_id"] = explicit_org_id

        # ── Parse date conditions FIRST (they may be compound) ───────────────
        date_params = self._parse_date_conditions(where_clean, context)
        params.update(date_params)

        # ── Parse compound AND conditions ────────────────────────────────────
        and_params = self._parse_and_conditions(where_clean, context)
        params.update(and_params)

        # ── Parse remaining simple conditions ────────────────────────────────
        simple_params = self._parse_simple_conditions(where_clean, context)
        # Merge without overwriting date_params
        for k, v in simple_params.items():
            if k not in params:
                params[k] = v

        return params

    def _extract_explicit_value(self, where: str, column: str) -> Optional[str]:
        """Extract an explicit UUID/string value assigned to a column in WHERE."""
        # Match: column = 'uuid' or column = "uuid" (but not parameterized $1)
        pattern = rf"\b{re.escape(column)}\s*=\s*['\"]([^'\"]+)['\"]"
        match = re.search(pattern, where, re.IGNORECASE)
        if match:
            val = match.group(1).strip()
            if val and not val.startswith("$"):
                return val
        return None

    def _parse_date_conditions(self, where: str, context: dict[str, Any]) -> dict[str, str]:
        """
        Parse all date-related conditions in the WHERE clause.
        Returns PostgREST params for date filtering.
        """
        params: dict[str, str] = {}
        where_lower = where.lower()

        # Detect which date column is referenced
        date_col = self._detect_date_column(where)
        if not date_col:
            return params

        today = date.today()
        now = datetime.now(timezone.utc)

        # ── Pattern 1: CURRENT_DATE - INTERVAL 'N unit' ──────────────────────
        # Examples: created_at >= CURRENT_DATE - INTERVAL '7 days'
        #           created_at >= NOW() - INTERVAL '1 month'
        interval_pattern = re.compile(
            rf"\b{re.escape(date_col)}\s*(>=|>|<=|<|=)\s*"
            rf"(?:CURRENT_DATE|NOW\(\)|CURRENT_TIMESTAMP)\s*"
            rf"(?:\s*[-+]\s*INTERVAL\s+['\"](\d+)\s*(day|days|week|weeks|month|months|year|years)['\"])",
            re.IGNORECASE,
        )
        for match in interval_pattern.finditer(where):
            op = match.group(1)
            num = int(match.group(2))
            unit = match.group(3).lower().rstrip("s")
            delta = self._compute_interval_delta(num, unit)
            if delta is not None:
                cutoff = today - delta if "CURRENT_DATE" in match.group(0).upper() else (now - delta).date()
                cutoff_str = cutoff.isoformat()
                if op == ">=":
                    params[date_col] = f"gte.{cutoff_str}T00:00:00"
                elif op == ">":
                    params[date_col] = f"gt.{cutoff_str}T00:00:00"
                elif op == "<=":
                    params[date_col] = f"lte.{cutoff_str}T23:59:59"
                elif op == "<":
                    params[date_col] = f"lt.{cutoff_str}T00:00:00"
            return params  # Only handle one date condition per column for now

        # ── Pattern 2: CURRENT_DATE - INTERVAL without CURRENT_DATE prefix ───
        # Example: created_at >= '2026-01-01'::date  (skip, handled below)

        # ── Pattern 3: Date range with >= AND < ──────────────────────────────
        # Example: created_at >= '2026-01-01' AND created_at < '2026-02-01'
        range_match = re.search(
            rf"\b{re.escape(date_col)}\s*>=\s*['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"].*?"
            rf"\b{re.escape(date_col)}\s*<\s*['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"]",
            where, re.IGNORECASE | re.DOTALL,
        )
        if range_match:
            start = range_match.group(1)
            end = range_match.group(2)
            params["and"] = f"({date_col}.gte.{start}T00:00:00,{date_col}.lt.{end}T00:00:00)"
            return params

        # ── Pattern 4: Date range with >= AND <= ─────────────────────────────
        range_match2 = re.search(
            rf"\b{re.escape(date_col)}\s*>=\s*['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"].*?"
            rf"\b{re.escape(date_col)}\s*<=\s*['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"]",
            where, re.IGNORECASE | re.DOTALL,
        )
        if range_match2:
            start = range_match2.group(1)
            end = range_match2.group(2)
            params["and"] = f"({date_col}.gte.{start}T00:00:00,{date_col}.lte.{end}T23:59:59)"
            return params

        # ── Pattern 5: BETWEEN ───────────────────────────────────────────────
        # Example: created_at BETWEEN '2026-01-01' AND '2026-01-31'
        between_match = re.search(
            rf"\b{re.escape(date_col)}\s+BETWEEN\s+['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"]\s+AND\s+['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"]",
            where, re.IGNORECASE,
        )
        if between_match:
            start = between_match.group(1)
            end = between_match.group(2)
            params["and"] = f"({date_col}.gte.{start}T00:00:00,{date_col}.lte.{end}T23:59:59)"
            return params

        # ── Pattern 6: DATE_TRUNC ────────────────────────────────────────────
        # Example: DATE_TRUNC('month', created_at) = '2026-01-01'
        trunc_match = re.search(
            rf"DATE_TRUNC\s*\(\s*['\"](\w+)['\"]\s*,\s*{re.escape(date_col)}\s*\)\s*=\s*['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"]",
            where, re.IGNORECASE,
        )
        if trunc_match:
            trunc_unit = trunc_match.group(1).lower()
            trunc_date = trunc_match.group(2)
            start_dt = datetime.strptime(trunc_date, "%Y-%m-%d").date()
            end_dt = self._date_trunc_end(start_dt, trunc_unit)
            if end_dt:
                params["and"] = (
                    f"({date_col}.gte.{start_dt.isoformat()}T00:00:00,"
                    f"{date_col}.lt.{end_dt.isoformat()}T00:00:00)"
                )
            else:
                params[date_col] = f"gte.{start_dt.isoformat()}T00:00:00"
            return params

        # ── Pattern 7: EXTRACT(MONTH FROM created_at) = N ────────────────────
        extract_match = re.search(
            rf"EXTRACT\s*\(\s*(?:MONTH|YEAR|DAY)\s+FROM\s+{re.escape(date_col)}\s*\)\s*=\s*(\d+)",
            where, re.IGNORECASE,
        )
        if extract_match:
            val = int(extract_match.group(1))
            if "month" in where_lower:
                year = today.year
                # Try to infer year from context or query
                year_match = re.search(r"(\d{4})", where)
                if year_match:
                    year = int(year_match.group(1))
                start = date(year, val, 1)
                if val == 12:
                    end = date(year + 1, 1, 1)
                else:
                    end = date(year, val + 1, 1)
                params["and"] = (
                    f"({date_col}.gte.{start.isoformat()}T00:00:00,"
                    f"{date_col}.lt.{end.isoformat()}T00:00:00)"
                )
                return params
            elif "year" in where_lower:
                start = date(val, 1, 1)
                end = date(val + 1, 1, 1)
                params["and"] = (
                    f"({date_col}.gte.{start.isoformat()}T00:00:00,"
                    f"{date_col}.lt.{end.isoformat()}T00:00:00)"
                )
                return params

        # ── Pattern 8: Cast ::date ───────────────────────────────────────────
        # Example: created_at::date = '2026-01-01'
        cast_match = re.search(
            rf"\b{re.escape(date_col)}\s*::\s*date\s*=\s*['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"]",
            where, re.IGNORECASE,
        )
        if cast_match:
            d = cast_match.group(1)
            params["and"] = (
                f"({date_col}.gte.{d}T00:00:00,"
                f"{date_col}.lt.{d}T23:59:59)"
            )
            return params

        # ── Pattern 9: Keywords (already handled in v1, kept for compatibility) ─
        if re.search(r"\byesterday\b", where, re.IGNORECASE):
            yesterday = (today - timedelta(days=1)).isoformat()
            params[date_col] = f"gte.{yesterday}T00:00:00"
            return params

        if re.search(r"\btoday\b|\bCURRENT_DATE\b(?!\s*[-+])", where, re.IGNORECASE):
            params[date_col] = f"gte.{today.isoformat()}T00:00:00"
            return params

        if m := re.search(r"INTERVAL\s+['\"](\d+)\s+day", where, re.IGNORECASE):
            cutoff = (today - timedelta(days=int(m.group(1)))).isoformat()
            params[date_col] = f"gte.{cutoff}T00:00:00"
            return params

        if re.search(r"this\s+week", where, re.IGNORECASE):
            start_of_week = (today - timedelta(days=today.weekday())).isoformat()
            params[date_col] = f"gte.{start_of_week}T00:00:00"
            return params

        if re.search(r"this\s+month", where, re.IGNORECASE):
            start_of_month = today.replace(day=1).isoformat()
            params[date_col] = f"gte.{start_of_month}T00:00:00"
            return params

        if re.search(r"last\s+month", where, re.IGNORECASE):
            if today.month == 1:
                start_last = date(today.year - 1, 12, 1)
                end_last = date(today.year, 1, 1)
            else:
                start_last = date(today.year, today.month - 1, 1)
                end_last = date(today.year, today.month, 1)
            params["and"] = (
                f"({date_col}.gte.{start_last.isoformat()}T00:00:00,"
                f"{date_col}.lt.{end_last.isoformat()}T00:00:00)"
            )
            return params

        if re.search(r"last\s+week", where, re.IGNORECASE):
            start_last_week = today - timedelta(days=today.weekday() + 7)
            end_last_week = start_last_week + timedelta(days=7)
            params["and"] = (
                f"({date_col}.gte.{start_last_week.isoformat()}T00:00:00,"
                f"{date_col}.lt.{end_last_week.isoformat()}T00:00:00)"
            )
            return params

        # ── Pattern 10: Single explicit ISO date with operator ───────────────
        single_date_match = re.search(
            rf"\b{re.escape(date_col)}\s*(>=|>|<=|<|=)\s*['\"](\d{{4}}-\d{{2}}-\d{{2}})['\"]",
            where, re.IGNORECASE,
        )
        if single_date_match:
            op = single_date_match.group(1)
            d = single_date_match.group(2)
            if op == ">=":
                params[date_col] = f"gte.{d}T00:00:00"
            elif op == ">":
                params[date_col] = f"gt.{d}T00:00:00"
            elif op == "<=":
                params[date_col] = f"lte.{d}T23:59:59"
            elif op == "<":
                params[date_col] = f"lt.{d}T00:00:00"
            elif op == "=":
                params["and"] = (
                    f"({date_col}.gte.{d}T00:00:00,"
                    f"{date_col}.lte.{d}T23:59:59)"
                )
            return params

        return params

    def _detect_date_column(self, where: str) -> Optional[str]:
        """Detect which date column is referenced in the WHERE clause."""
        where_lower = where.lower()
        # Check known date columns first
        for col in DATE_COLUMNS:
            if col.lower() in where_lower:
                return col
        # Generic fallback
        if "date" in where_lower:
            generic_match = re.search(r'\b(\w*date\w*)\b', where_lower)
            if generic_match:
                return generic_match.group(1)
        return None

    def _compute_interval_delta(self, num: int, unit: str) -> Optional[timedelta]:
        """Compute a timedelta from interval components."""
        unit = unit.lower().rstrip("s")
        if unit == "day":
            return timedelta(days=num)
        if unit == "week":
            return timedelta(weeks=num)
        if unit == "month":
            # Approximate with 30 days
            return timedelta(days=num * 30)
        if unit == "year":
            return timedelta(days=num * 365)
        return None

    def _date_trunc_end(self, start: date, unit: str) -> Optional[date]:
        """Compute the end boundary for a DATE_TRUNC equality."""
        unit = unit.lower()
        if unit == "day":
            return start + timedelta(days=1)
        if unit == "week":
            return start + timedelta(weeks=1)
        if unit == "month":
            if start.month == 12:
                return date(start.year + 1, 1, 1)
            return date(start.year, start.month + 1, 1)
        if unit == "year":
            return date(start.year + 1, 1, 1)
        if unit == "hour":
            return None  # Can't represent with date
        return None

    def _parse_and_conditions(self, where: str, context: dict[str, Any]) -> dict[str, str]:
        """
        Parse top-level AND conditions into PostgREST 'and' operator.
        Handles: status IN, priority filters, non-date comparisons.
        """
        params: dict[str, str] = {}
        where_lower = where.lower()

        # We only build an 'and' param if we find multiple simple conditions
        # that aren't already handled by date parsing.
        conditions: list[str] = []

        # Status IN
        in_match = re.search(r"status\s+IN\s*\(([^)]+)\)", where, re.IGNORECASE)
        if in_match:
            statuses = re.findall(r"'([^']+)'", in_match.group(1))
            if statuses:
                conditions.append(f"status.in.({','.join(statuses)})")

        # Single status
        status_match = re.search(r"status\s*=\s*'([^']+)'", where, re.IGNORECASE)
        if status_match:
            conditions.append(f"status.eq.{status_match.group(1)}")

        # Single priority
        priority_match = re.search(r"priority\s*=\s*'([^']+)'", where, re.IGNORECASE)
        if priority_match:
            conditions.append(f"priority.eq.{priority_match.group(1)}")

        # Non-date comparisons for other columns
        # Match patterns like: column op 'value' or column op number
        # But skip date columns and already-handled columns
        comp_pattern = re.compile(
            r"\b(\w+)\s*(=|!=|<>|>=|<=|>|<)\s*('[^']*'|\d+(?:\.\d+)?|true|false)\b",
            re.IGNORECASE,
        )
        handled_cols = {"status", "priority", "organization_id", "property_id"}
        date_col = self._detect_date_column(where)
        if date_col:
            handled_cols.add(date_col.lower())

        for match in comp_pattern.finditer(where):
            col = match.group(1).lower()
            if col in handled_cols:
                continue
            op = match.group(2)
            val = match.group(3).strip("'\"")
            # Map SQL operators to PostgREST
            p_op = {"=": "eq", "!=": "neq", "<>": "neq", ">": "gt", ">=": "gte", "<": "lt", "<=": "lte"}.get(op, "eq")
            conditions.append(f"{col}.{p_op}.{val}")

        # IS NULL / IS NOT NULL
        null_pattern = re.compile(r"\b(\w+)\s+IS\s+(NOT\s+)?NULL\b", re.IGNORECASE)
        for match in null_pattern.finditer(where):
            col = match.group(1).lower()
            is_not = bool(match.group(2))
            if is_not:
                conditions.append(f"{col}.not.is.null")
            else:
                conditions.append(f"{col}.is.null")

        # LIKE / ILIKE
        like_pattern = re.compile(r"\b(\w+)\s+(NOT\s+)?(LIKE|ILIKE)\s+'([^']+)'", re.IGNORECASE)
        for match in like_pattern.finditer(where):
            col = match.group(1).lower()
            is_not = bool(match.group(2))
            op = match.group(3).lower()
            val = match.group(4)
            # Convert SQL % wildcard to PostgREST *
            val = val.replace("%", "*")
            if is_not:
                conditions.append(f"{col}.not.{op}.{val}")
            else:
                conditions.append(f"{col}.{op}.{val}")

        if conditions:
            # If we already have an 'and' from date parsing, merge them
            if "and" in params:
                existing = params["and"][1:-1]  # Remove outer parens
                params["and"] = f"({existing},{','.join(conditions)})"
            else:
                params["and"] = f"({','.join(conditions)})"

        return params

    def _parse_simple_conditions(self, where: str, context: dict[str, Any]) -> dict[str, str]:
        """Parse simple conditions not caught by other parsers."""
        params: dict[str, str] = {}
        return params


    # ========================================================================
    # Single-Table Execution
    # ========================================================================

    async def _execute_single_table(
        self, query: str, context: dict[str, Any]
    ) -> ToolResult:
        """
        Execute single-table query via PostgREST.

        COUNT/DISTINCT queries use PostgREST count=exact (Content-Range header).
        Aggregation queries (GROUP BY, SUM) fetch up to 1000 rows.
        Regular queries fetch up to 200 rows.
        """
        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=30.0)

        parsed = self._parse_query(query)
        table = parsed.get("table", "")
        if not table:
            return ToolResult(
                call_id=f"v2_notable_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error="Could not determine table name from query",
            )

        url = f"{SUPABASE_URL}/rest/v1/{table}"
        base_headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Accept": "application/json",
        }

        # ── Build filter params ───────────────────────────────────────────────
        params: dict = {}

        # Organization scope (non-negotiable)
        org_id = context.get("org_id", "")
        if org_id:
            params["organization_id"] = f"eq.{org_id}"

        # Property scope (respect explicit property_id in WHERE)
        property_id = context.get("property_id", "")
        table_schema = TABLES.get(table, {})
        table_cols = table_schema.get("columns", [])

        # Parse WHERE first to detect explicit values
        where_params: dict = {}
        if parsed.get("where"):
            where_params = self._parse_where_to_params(parsed["where"], context)

        # Check if explicit property_id was in WHERE
        explicit_property_id = where_params.pop("__explicit_property_id", None)
        explicit_org_id = where_params.pop("__explicit_org_id", None)

        # Property filter injection
        if "property_id" in table_cols:
            q_lower = query.lower()
            is_org_wide = any(kw in q_lower for kw in (
                "all properties", "org-wide", "orgwide", "across properties",
                "every property", "all_props", "org wide"
            ))

            if is_org_wide:
                # Skip property filter for org-wide queries
                pass
            elif explicit_property_id:
                # LLM explicitly set a property_id — RESPECT IT
                params["property_id"] = f"eq.{explicit_property_id}"
            elif property_id:
                # Fall back to session property_id
                params["property_id"] = f"eq.{property_id}"

        # Merge WHERE params (but don't clobber org/property scope)
        where_params.pop("organization_id", None)
        # Don't let WHERE property_id override our explicit one
        if "property_id" in params and "property_id" in where_params:
            where_params.pop("property_id", None)
        params.update(where_params)

        # ── SELECT columns ────────────────────────────────────────────────────
        if parsed.get("columns") and parsed["columns"] != ["*"]:
            # Build PostgREST select string
            # Filter out table prefixes for single-table queries
            clean_cols = []
            for col in parsed["columns"]:
                if "." in col:
                    clean_cols.append(col.split(".")[-1])
                elif "(" not in col:  # Skip aggregates — we'll compute them in Python
                    clean_cols.append(col)
            if clean_cols:
                params["select"] = ",".join(clean_cols)
            else:
                params["select"] = "*"
        else:
            params["select"] = "*"

        # ── ORDER BY ──────────────────────────────────────────────────────────
        if parsed.get("order_col"):
            order_col = parsed["order_col"]
            if "." in order_col:
                order_col = order_col.split(".")[-1]
            params["order"] = f"{order_col}.{parsed.get('order_dir', 'asc')}"

        # ── Determine row limit ───────────────────────────────────────────────
        is_count = parsed.get("is_count", False)
        is_aggregate = parsed.get("is_aggregate", False)
        is_distinct = parsed.get("is_distinct", False)

        if is_count and not parsed.get("group_by"):
            # Pure count — use count=exact, ZERO rows fetched
            count_headers = {
                **base_headers,
                "Prefer": "count=exact",
                "Range-Unit": "items",
                "Range": "0-0",
            }
            count_params = {k: v for k, v in params.items() if k != "select"}
            count_params["select"] = "id"
            try:
                resp = await self._http_client.get(url, headers=count_headers, params=count_params)
                resp.raise_for_status()
                cr = resp.headers.get("content-range", "*/0")
                total = int(cr.split("/")[-1])
                logger.info(f"[SQL_ENGINE_V2] count=exact: {table} → {total}")
                return ToolResult(
                    call_id=f"v2_count_{time.time():.0f}",
                    tool_name="sql_query",
                    success=True,
                    result=[{"total_count": total, "table": table}],
                )
            except Exception as e:
                logger.error(f"[SQL_ENGINE_V2] count=exact failed: {e}")
                return ToolResult(
                    call_id=f"v2_count_err_{time.time():.0f}",
                    tool_name="sql_query",
                    success=False,
                    error=f"COUNT query failed: {e}",
                )

        # Regular fetch — use appropriate limit
        if is_aggregate or is_distinct:
            row_limit = AGGREGATION_ROW_LIMIT
        else:
            row_limit = DEFAULT_ROW_LIMIT

        if parsed.get("limit"):
            row_limit = min(parsed["limit"], row_limit)

        params["limit"] = str(row_limit)

        try:
            resp = await self._http_client.get(url, headers=base_headers, params=params)
            resp.raise_for_status()
            data = resp.json()

            # Rows fetched hit the cap exactly → aggregation below may be computed
            # over a truncated slice, not the full matching set. Flag it rather
            # than silently returning a number that looks exact but isn't.
            possibly_truncated = is_aggregate and len(data) >= row_limit

            # Post-processing: aggregations
            if parsed.get("is_sum"):
                data = self._compute_sum(data, query)
            elif parsed.get("is_avg"):
                data = self._compute_avg(data, query)
            elif parsed.get("is_min"):
                data = self._compute_min_max(data, query, "min")
            elif parsed.get("is_max"):
                data = self._compute_min_max(data, query, "max")
            elif is_distinct:
                data = self._compute_distinct(data, query)
            elif parsed.get("group_by"):
                data = self._compute_count(data, query)

            if possibly_truncated and isinstance(data, list):
                for row in data:
                    if isinstance(row, dict):
                        row["_warning"] = (
                            f"Computed over the first {row_limit} matching rows only — "
                            "there may be more. Narrow the date range or scope for an exact figure."
                        )

            logger.info(
                f"[SQL_ENGINE_V2] fetch: {table} → {len(data)} rows "
                f"(limit={row_limit}, aggregate={is_aggregate}, truncated={possibly_truncated})"
            )
            return ToolResult(
                call_id=f"v2_single_{time.time():.0f}",
                tool_name="sql_query",
                success=True,
                result=data,
            )
        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            logger.error(f"[SQL_ENGINE_V2] fetch failed: {error_msg}")
            return ToolResult(
                call_id=f"v2_http_err_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=error_msg,
            )
        except Exception as e:
            logger.error(f"[SQL_ENGINE_V2] Error: {e}")
            return ToolResult(
                call_id=f"v2_err_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=str(e),
            )

    # ========================================================================
    # Multi-Table JOIN Execution
    # ========================================================================

    async def _fetch_table_for_join(
        self,
        table: str,
        context: dict[str, Any],
        where: str,
        where_lower: str,
        explicit_property_id: Optional[str],
        headers: dict[str, str],
    ) -> list[dict]:
        """Fetch one table's rows for a JOIN, with org/property/WHERE scoping applied."""
        org_id = context.get("org_id", "")
        property_id = context.get("property_id", "")

        url = f"{SUPABASE_URL}/rest/v1/{table}"
        params: dict[str, str] = {"select": "*", "limit": str(JOIN_ROW_LIMIT)}

        cols = TABLES.get(table, {}).get("columns", [])
        if "organization_id" in cols and org_id:
            params["organization_id"] = f"eq.{org_id}"

        if "property_id" in cols:
            is_org_wide = any(kw in where_lower for kw in (
                "all properties", "org-wide", "orgwide", "across properties"
            ))
            if not is_org_wide:
                if explicit_property_id:
                    params["property_id"] = f"eq.{explicit_property_id}"
                elif property_id:
                    params["property_id"] = f"eq.{property_id}"

        where_params = self._parse_where_to_params(where, context)
        where_params.pop("__explicit_property_id", None)
        where_params.pop("__explicit_org_id", None)
        where_params.pop("organization_id", None)
        if "property_id" in params:
            where_params.pop("property_id", None)
        params.update(where_params)

        resp = await self._http_client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json()

    def _project_columns(self, rows: list[dict], columns: list[str]) -> list[dict]:
        """Apply a requested SELECT column list to already-joined rows.

        Joined rows may have colliding column names suffixed with '_right'
        (see _python_join) — try the bare name first, then the suffixed one,
        so an explicit SELECT list doesn't silently return nothing for a
        right-table column that collided with a left-table one.
        """
        projected = []
        for row in rows:
            new_row: dict[str, Any] = {}
            for col in columns:
                key = col.split(".")[-1] if "." in col else col
                if key in row:
                    new_row[key] = row[key]
                elif f"{key}_right" in row:
                    new_row[key] = row[f"{key}_right"]
            projected.append(new_row)
        return projected

    async def _execute_with_join(
        self,
        query: str,
        context: dict[str, Any],
        tables: list[str],
    ) -> ToolResult:
        """
        Execute a multi-table query via Python-side JOIN with improved filtering.

        1. Fetch every table referenced in the query (org_id + property_id
           filters applied where the table has those columns).
        2. Chain-join them: start from tables[0], then fold in each remaining
           table via whichever FK link connects it to ANY table already in
           the chain (not just its immediate neighbor). This is what lets a
           3+ table JOIN actually include every table — the previous
           implementation only ever joined the first FK-linked pair it found
           and silently dropped the rest.
        """
        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=60.0)

        parsed = self._parse_query(query)
        where = parsed.get("where", "")
        where_lower = where.lower()
        explicit_property_id = self._extract_explicit_value(where, "property_id")

        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Accept": "application/json",
        }

        try:
            fetched: dict[str, list[dict]] = {}
            for t in tables:
                fetched[t] = await self._fetch_table_for_join(
                    t, context, where, where_lower, explicit_property_id, headers
                )

            joined = fetched[tables[0]]
            joined_so_far = [tables[0]]
            pending = list(tables[1:])

            # Fold in every remaining table, linking to ANY table already
            # merged so far — not just the previous one. Iterate until no
            # more tables can be linked (handles hub/star schemas where
            # e.g. tickets->properties and tickets->users but not
            # properties->users).
            while pending:
                progressed = False
                for t in list(pending):
                    hint = None
                    for already in joined_so_far:
                        hint = self.fk_graph.get_join_hint(already, t)
                        if hint:
                            break
                    if not hint:
                        continue
                    match = re.search(r"Use\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)", hint)
                    if not match:
                        continue
                    h_left_table, h_left_col, h_right_table, h_right_col = match.groups()
                    if h_left_table == t:
                        # Hint direction is t -> already_merged_table; flip so
                        # the already-merged `joined` list stays the left side.
                        left_key, right_key = h_right_col, h_left_col
                    else:
                        left_key, right_key = h_left_col, h_right_col
                    logger.info(f"[SQL_ENGINE_V2] JOIN: folding in {t} via {left_key}={right_key}")
                    joined = self._python_join(joined, fetched[t], left_key, right_key)
                    joined_so_far.append(t)
                    pending.remove(t)
                    progressed = True
                if not progressed:
                    logger.warning(
                        f"[SQL_ENGINE_V2] JOIN: no FK path found to include tables {pending} "
                        f"— returning partial join of {joined_so_far}"
                    )
                    break

            if len(joined_so_far) < 2:
                return ToolResult(
                    call_id=f"v2_nofk_{time.time():.0f}",
                    tool_name="sql_query",
                    success=False,
                    error=f"No FK relationship found between tables: {tables}. Cannot JOIN.",
                )

            # Apply ORDER BY if present
            if parsed.get("order_col"):
                order_col = parsed["order_col"]
                if "." in order_col:
                    order_col = order_col.split(".")[-1]
                reverse = parsed.get("order_dir", "asc").lower() == "desc"
                try:
                    joined.sort(key=lambda r: r.get(order_col, "") or "", reverse=reverse)
                except Exception:
                    pass  # Sort failed, keep original order

            # Apply the requested SELECT column list, if not SELECT *
            if parsed.get("columns") and parsed["columns"] != ["*"]:
                projectable = [c for c in parsed["columns"] if "(" not in c]
                if projectable:
                    joined = self._project_columns(joined, projectable)

            # Apply LIMIT after join
            if parsed.get("limit"):
                joined = joined[:parsed["limit"]]

            dropped = [t for t in tables if t not in joined_so_far]
            if dropped:
                for row in joined:
                    if isinstance(row, dict):
                        row["_warning"] = (
                            f"Could not link table(s) {dropped} into this JOIN — no FK path found. "
                            "Results only include: " + ", ".join(joined_so_far)
                        )

            logger.info(f"[SQL_ENGINE_V2] JOIN result: {len(joined)} rows across {joined_so_far}")

            return ToolResult(
                call_id=f"v2_join_{time.time():.0f}",
                tool_name="sql_query",
                success=True,
                result=joined,
            )

        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            return ToolResult(
                call_id=f"v2_join_http_err_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=error_msg,
            )
        except Exception as e:
            logger.error(f"[SQL_ENGINE_V2] JOIN error: {e}")
            return ToolResult(
                call_id=f"v2_join_err_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=str(e),
            )

    def _python_join(
        self,
        left: list[dict],
        right: list[dict],
        left_key: str,
        right_key: str,
    ) -> list[dict]:
        """
        Perform a simple LEFT JOIN in Python.

        Args:
            left: List of dicts from left table
            right: List of dicts from right table
            left_key: Column to join on from left table
            right_key: Column to join on from right table

        Returns:
            List of merged dicts (left join behavior)
        """
        # Build lookup index for right table
        right_index: dict[str, dict] = {}
        for row in right:
            key_val = row.get(right_key)
            if key_val is not None:
                right_index[str(key_val)] = row

        # Merge
        results = []
        for left_row in left:
            key_val = left_row.get(left_key)
            merged = {**left_row}
            if key_val is not None and str(key_val) in right_index:
                right_row = right_index[str(key_val)]
                for col, val in right_row.items():
                    # Prefix right table columns to avoid collision
                    prefixed_col = f"{col}_right" if col in merged else col
                    merged[prefixed_col] = val
            results.append(merged)

        return results

    # ========================================================================
    # Aggregation Helpers
    # ========================================================================

    def _compute_count(self, data: list[dict], query: str) -> list[dict]:
        """Compute COUNT from raw data (Python-side — PostgREST returns raw rows)."""
        group_match = re.search(r"GROUP\s+BY\s+([\w.]+)", query, re.IGNORECASE)
        if group_match:
            group_col = group_match.group(1)
            if "." in group_col:
                group_col = group_col.split(".")[-1]
            counts: dict[str, int] = {}
            for row in data:
                key = str(row.get(group_col, "unknown"))
                counts[key] = counts.get(key, 0) + 1
            return [
                {"group": k, "count": v}
                for k, v in sorted(counts.items(), key=lambda x: -x[1])
            ]
        else:
            return [{"total_count": len(data)}]

    def _compute_sum(self, data: list[dict], query: str) -> list[dict]:
        """Compute SUM(column) from raw data."""
        m = re.search(r"SUM\s*\(\s*([\w.]+)\s*\)", query, re.IGNORECASE)
        if not m:
            return [{"sum": None, "note": "could not parse SUM column"}]
        col = m.group(1)
        if "." in col:
            col = col.split(".")[-1]

        group_match = re.search(r"GROUP\s+BY\s+([\w.]+)", query, re.IGNORECASE)
        if group_match:
            group_col = group_match.group(1)
            if "." in group_col:
                group_col = group_col.split(".")[-1]
            sums: dict[str, float] = {}
            for row in data:
                key = str(row.get(group_col, "unknown"))
                try:
                    sums[key] = sums.get(key, 0.0) + float(row.get(col, 0) or 0)
                except (TypeError, ValueError):
                    pass
            return [
                {"group": k, "sum": round(v, 2)}
                for k, v in sorted(sums.items(), key=lambda x: -x[1])
            ]
        else:
            total = sum(
                float(row.get(col, 0) or 0)
                for row in data
                if row.get(col) is not None
            )
            return [
                {
                    "total_sum": round(total, 2),
                    "column": col,
                    "row_count": len(data),
                }
            ]

    def _compute_avg(self, data: list[dict], query: str) -> list[dict]:
        """Compute AVG(column) from raw data, optionally grouped."""
        m = re.search(r"AVG\s*\(\s*([\w.]+)\s*\)", query, re.IGNORECASE)
        if not m:
            return [{"avg": None, "note": "could not parse AVG column"}]
        col = m.group(1)
        if "." in col:
            col = col.split(".")[-1]

        group_match = re.search(r"GROUP\s+BY\s+([\w.]+)", query, re.IGNORECASE)
        if group_match:
            group_col = group_match.group(1)
            if "." in group_col:
                group_col = group_col.split(".")[-1]
            sums: dict[str, float] = {}
            counts: dict[str, int] = {}
            for row in data:
                val = row.get(col)
                if val is None:
                    continue
                try:
                    fval = float(val)
                except (TypeError, ValueError):
                    continue
                key = str(row.get(group_col, "unknown"))
                sums[key] = sums.get(key, 0.0) + fval
                counts[key] = counts.get(key, 0) + 1
            return [
                {"group": k, "avg": round(sums[k] / counts[k], 2), "count": counts[k]}
                for k in sorted(sums, key=lambda k: -(sums[k] / counts[k]))
            ]
        else:
            values: list[float] = []
            for row in data:
                val = row.get(col)
                if val is None:
                    continue
                try:
                    values.append(float(val))
                except (TypeError, ValueError):
                    continue
            if not values:
                return [{"avg": None, "column": col, "row_count": 0}]
            return [
                {
                    "avg": round(sum(values) / len(values), 2),
                    "column": col,
                    "row_count": len(values),
                }
            ]

    def _compute_min_max(self, data: list[dict], query: str, func: str) -> list[dict]:
        """Compute MIN(column) or MAX(column) from raw data, optionally grouped."""
        m = re.search(rf"{func.upper()}\s*\(\s*([\w.]+)\s*\)", query, re.IGNORECASE)
        if not m:
            return [{func: None, "note": f"could not parse {func.upper()} column"}]
        col = m.group(1)
        if "." in col:
            col = col.split(".")[-1]
        picker = min if func == "min" else max

        def _numeric(v: Any) -> Optional[float]:
            try:
                return float(v)
            except (TypeError, ValueError):
                return None

        group_match = re.search(r"GROUP\s+BY\s+([\w.]+)", query, re.IGNORECASE)
        if group_match:
            group_col = group_match.group(1)
            if "." in group_col:
                group_col = group_col.split(".")[-1]
            buckets: dict[str, list[float]] = {}
            for row in data:
                val = _numeric(row.get(col))
                if val is None:
                    continue
                key = str(row.get(group_col, "unknown"))
                buckets.setdefault(key, []).append(val)
            return [{"group": k, func: picker(vs)} for k, vs in buckets.items()]
        else:
            values = [v for v in (_numeric(row.get(col)) for row in data) if v is not None]
            if not values:
                return [{func: None, "column": col, "row_count": 0}]
            return [{func: picker(values), "column": col, "row_count": len(values)}]

    def _compute_distinct(self, data: list[dict], query: str) -> list[dict]:
        """Compute DISTINCT values from raw data."""
        distinct_match = re.search(r"DISTINCT\s+([\w.]+)", query, re.IGNORECASE)
        if distinct_match:
            col = distinct_match.group(1)
            if "." in col:
                col = col.split(".")[-1]
            unique_vals = sorted(
                {row.get(col) for row in data if row.get(col) is not None}
            )
            return [
                {
                    "distinct_count": len(unique_vals),
                    "column": col,
                    "values": unique_vals[:100],
                }
            ]
        return [{"distinct_count": 0, "note": "could not parse DISTINCT column"}]

    # ========================================================================
    # JOIN Query Generator
    # ========================================================================

    def generate_join_query(
        self,
        left_table: str,
        right_table: str,
        context: dict[str, Any],
    ) -> Optional[str]:
        """
        Generate a valid JOIN query for two tables.

        Returns None if no FK relationship exists.
        """
        hint = self.fk_graph.get_join_hint(left_table, right_table)
        if not hint:
            return None

        org_id = context.get("org_id", "")
        property_id = context.get("property_id", "")

        # Parse hint
        match = re.search(r"Use\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)", hint)
        if not match:
            return None

        left_t, left_c, right_t, right_c = match.groups()

        query = f"""
SELECT *
FROM {left_t}
JOIN {right_t} ON {left_t}.{left_c} = {right_t}.{right_c}
WHERE {left_t}.organization_id = '{org_id}'
LIMIT 100
""".strip()

        if property_id:
            query = query.replace("LIMIT 100", f"AND {left_t}.property_id = '{property_id}'\nLIMIT 100")

        return query


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------

def execute_sql(query: str, context: dict[str, Any]) -> ToolResult:
    """Execute a SQL query using SQL Engine v2."""
    engine = SQLEngineV2()
    return engine.execute(query, context)


# ---------------------------------------------------------------------------
# Tool Wrapper — matches cassandra.orchestrator.Tool interface
# ---------------------------------------------------------------------------

class SQLEngineV2Tool(Tool):
    """
    Tool adapter that wraps SQLEngineV2 for the LLM orchestrator.

    The orchestrator calls: tool.execute(arguments: dict, ctx: OrchestratorContext)
    This adapter bridges to SQLEngineV2's execute(query: str, context: dict).

    Features vs v1:
    - FK graph validation (fails fast on invalid JOINs)
    - Python-side JOIN for multi-table queries (PostgREST is single-table only)
    - Async execution with thread-safe sync wrapper
    - ROBUST date parsing (handles CURRENT_DATE, INTERVAL, BETWEEN, DATE_TRUNC)
    - Respects explicit property_id in WHERE clauses
    - Increased row limits for aggregation queries
    """

    name = "sql_query"
    description = (
        "Execute a SQL SELECT query against the FMS database with FK-aware JOIN support. "
        "Supports: single-table queries, multi-table JOINs (Python-side merge), "
        "COUNT, SUM, GROUP BY, DISTINCT, date ranges, and status/priority filters."
    )

    def __init__(self):
        self._engine = SQLEngineV2()

    def execute(self, arguments: dict[str, Any], ctx: Any) -> ToolResult:
        """
        Execute the sql_query tool.

        Args:
            arguments: {"query": "SELECT ...", "params": {...}}  — params ignored (inline values)
            ctx: OrchestratorContext (or mock with .org_id, .user_id, .property_id, .role)

        Returns:
            ToolResult with data rows or error message
        """
        query = arguments.get("query", "").strip()
        if not query:
            return ToolResult(
                call_id=f"v2tool_noq_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error="No query provided to sql_query tool.",
            )

        blocked_cols = [c for c in SENSITIVE_COLUMNS if re.search(rf"\b{re.escape(c)}\b", query, re.IGNORECASE)]
        if blocked_cols:
            return ToolResult(
                call_id=f"v2tool_sensitive_{time.time():.0f}",
                tool_name="sql_query",
                success=False,
                error=f"SENSITIVE_COLUMNS: Cannot query {blocked_cols} — these require explicit role authorization.",
            )

        # Build context dict from OrchestratorContext (or mock)
        context: dict[str, Any] = {
            "org_id": getattr(ctx, "org_id", ""),
            "user_id": getattr(ctx, "user_id", ""),
            "property_id": getattr(ctx, "property_id", ""),
            "role": getattr(ctx, "role", "tenant"),
        }

        logger.info(f"[SQLEngineV2Tool] Executing: {query[:120]}...")
        result = self._engine.execute(query, context)

        # Normalise call_id if somehow missing (defensive)
        if not getattr(result, "call_id", None):
            result.call_id = f"v2tool_{time.time():.0f}"

        return result
