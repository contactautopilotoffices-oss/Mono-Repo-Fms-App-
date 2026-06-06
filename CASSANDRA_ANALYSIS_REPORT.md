# Cassandra AI Module — Deep Analysis Report
**Date:** 2026-06-02
**Scope:** `cassandra/` directory — LLM orchestration, SQL generation, Supabase integration

---

## 1. How Cassandra Works (Architecture Overview)

```
Mobile App → FastAPI (/chat/stream) → Query Queue → LLM Orchestrator → Tools → Supabase
                                                    ↓
                                              SQLite (chat sessions)
```

### Key Components:

| Component | File | Purpose |
|-----------|------|---------|
| **API Server** | `orchestrator/api_server.py` | FastAPI endpoints, auth, SSE streaming |
| **LLM Orchestrator** | `llm/orchestrator.py` | Single GPT-4o command center — decides tools, executes, synthesizes |
| **SQL Engine v2** | `tools/sql_engine_v2.py` | Parses LLM-generated SQL, converts to PostgREST API calls |
| **Schema Sync** | `tools/schema_sync.py` | Auto-generates `fms_schema.py` from `database.types.ts` at startup |
| **FK Graph** | `tools/fk_graph.py` + `config/fk_graph.json` | 207 verified relationships for JOIN validation |
| **SQL Guard** | `tools/sql_guard.py` | Security layer — blocks DROP, enforces org_id, whitelists tables |
| **Query Tickets** | `tools/query_tickets.py` | Dedicated ticket query tool (faster than SQL for simple filters) |
| **Create Ticket** | `tools/create_ticket.py` | Creates tickets directly via Supabase REST API |
| **Health Score** | `tools/health_score.py` | Deterministic health computation (avoids SQL parser bugs) |

### Execution Flow:
1. **Auth:** Simple base64 session tokens (not JWT). Validates membership against Supabase.
2. **Queue:** Job queued, worker processes one at a time (`max_workers=1`).
3. **LLM Call 1:** GPT-4o receives system prompt + live schema + context + user message → decides tool calls.
4. **Tool Execution:** Up to 10 tools executed. `sql_query` is the main data-fetching tool.
5. **O→A Recovery:** If all tools return empty, ONE retry with broadened scope.
6. **LLM Call 2 (Synthesis):** Tool results fed back to GPT-4o → final answer.
7. **Sanitization:** Strips UUIDs, SQL leaks, markdown formatting.

---

## 2. How Cassandra Talks to Supabase

### Connection Method: **PostgREST REST API** (not direct PostgreSQL)

Every tool hits Supabase via HTTP:
```
GET https://<supabase>.supabase.co/rest/v1/<table>?select=*&organization_id=eq.<org_id>
Headers: apikey=<service_role>, Authorization=Bearer <service_role>
```

### Data Flow by Tool:

| Tool | Supabase Interaction |
|------|---------------------|
| `sql_query` (SQLEngineV2) | Parses SQL → extracts table → converts to PostgREST params → HTTP GET |
| `query_tickets` | Direct PostgREST call to `/rest/v1/tickets` with filters |
| `create_ticket` | HTTP POST to `/rest/v1/tickets` with JSON body |
| `health_score` | Multiple count=exact HEAD requests to `/rest/v1/tickets` |
| `fetch_context` | Queries `organization_memberships`, `properties` tables |

### Key Supabase Config Resolution (fragile!):
```python
SUPABASE_URL = os.environ.get("FMS_SUPABASE_URL",
               os.environ.get("EXPO_PUBLIC_SUPABASE_URL", ""))
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("AUTH_SUPABASE_SERVICE_ROLE_KEY",
               os.environ.get("FMS_SUPABASE_SERVICE_ROLE_KEY", ""))
```
**Issue:** Falls through to empty string if env vars missing → silent failures.

---

## 3. Does the LLM Hallucinate SQL? — **YES, in specific ways**

### Root Cause: GPT-4o generates PostgreSQL syntax, but the "SQL Engine" is NOT a real SQL engine

The `sql_engine_v2.py` does **NOT** execute SQL against a real database. It:
1. Parses the SQL with regex to find `FROM table`, `WHERE conditions`, `JOIN`s
2. Converts them to PostgREST HTTP parameters
3. Handles aggregations (SUM, COUNT, GROUP BY) in **Python** on fetched rows

This means:
- ✅ **Simple queries work:** `SELECT * FROM tickets WHERE status = 'open'`
- ❌ **Complex SQL fails:** Subqueries, CTEs, window functions, `HAVING`, `EXISTS`
- ❌ **Postgres functions fail:** `NOW()`, `CURRENT_DATE`, `DATE_TRUNC`, `INTERVAL` arithmetic
- ❌ **JOINs are fake:** Multi-table queries fetch each table separately (up to 1000 rows) and merge in Python with a simple dict lookup

### Specific Hallucination Patterns:

#### Pattern A: Date Arithmetic in SQL
```sql
-- LLM generates this (valid Postgres):
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'

-- SQL Engine v2 parses this into:
params[date_col] = "gte.2026-05-26T00:00:00"  -- (today is 2026-06-02)
```
**BUT WAIT:** The `_parse_where_to_params` method does NOT parse `CURRENT_DATE - INTERVAL` syntax. It only handles:
- Explicit ISO dates (`>= '2026-05-01'`)
- Keywords: `yesterday`, `today`, `this week`, `this month`
- `INTERVAL 'N day'` pattern (but not `CURRENT_DATE - INTERVAL`)

**Result:** If the LLM writes `CURRENT_DATE - INTERVAL '7 days'`, the date filter is **silently dropped** → query returns ALL rows → wrong answer.

#### Pattern B: Multi-Table JOINs
The system prompt says:
> "The system will JOIN them in Python — you don't need to write SQL JOINs"

But the LLM often generates:
```sql
SELECT t.*, p.name 
FROM tickets t 
JOIN properties p ON t.property_id = p.id 
WHERE t.organization_id = '...'
```

The SQL Engine v2:
1. Extracts tables: `[tickets, properties]`
2. Finds FK hint: `tickets.property_id = properties.id`
3. Fetches BOTH tables (up to 1000 rows each, with only `org_id` filter)
4. Python-side merge

**Problems:**
- Fetches 1000 rows from each table (could be massive for large orgs)
- No `property_id` filter on the JOIN fetch unless explicitly in the SQL
- LEFT JOIN behavior — keeps unmatched rows
- No `SELECT t.*, p.name` projection — always returns `SELECT *`

#### Pattern C: COUNT with GROUP BY
```sql
SELECT status, COUNT(*) FROM tickets GROUP BY status
```
The SQL Engine:
1. Fetches up to 200 raw rows from PostgREST
2. Runs `_compute_count()` in Python: `counts[key] = counts.get(key, 0) + 1`

**Problem:** If there are 500 tickets, it only fetches 200 and counts from that subset → **undercounts**.

#### Pattern D: `DISTINCT` Values
```sql
SELECT DISTINCT priority FROM tickets
```
Fetches 200 rows, extracts unique `priority` values from those 200 rows.
**Problem:** If there are 50 distinct priorities but only 200 rows fetched, might miss some if they're not in the first 200.

---

## 4. Is SQL Properly Created? — **Partially, with 6 critical bugs**

### Bug 1: SQL Guard is NOT Actually Used

The `SQLGuard` class (`tools/sql_guard.py`) is imported and well-designed:
- Blocks DROP, TRUNCATE, ALTER
- Enforces `organization_id` in WHERE
- Whitelists tables from schema

**BUT:** Looking through the entire codebase, `SQLGuard.validate()` is **never called** by `sql_engine_v2.py`. The guard is dead code.

**Impact:** The LLM could generate `DELETE FROM tickets` and it would be parsed/executed. (Fortunately, the tool description says "SELECT only" and PostgREST rejects DELETE anyway.)

### Bug 2: `query_tickets` Tool Has Wrong Status Handling

In `query_tickets.py`:
```python
STATUS_ALIAS = {
    "open": None,  # "open" means query all active → use status_list below
    "in_progress": "in_progress",
    "resolved": "resolved",
}
```
When `status="open"` is passed, it queries `status=in.(open,assigned,in_progress,waitlist)`.

**Problem:** What if user asks for literally `status="open"` (newly raised, not yet assigned)? The tool over-expands it to all active statuses. The system prompt also tells the LLM to use `sql_query` for counts, which avoids this, but it's inconsistent.

### Bug 3: `sql_engine_v2` Property Scope Injection is Fragile

```python
# In _execute_single_table:
if property_id and "property_id" in table_cols:
    q_lower = query.lower()
    if not any(kw in q_lower for kw in ("all properties", "org-wide", ...)):
        params["property_id"] = f"eq.{property_id}"
```

**Problem:** If the LLM writes:
```sql
SELECT * FROM tickets WHERE organization_id = 'x' AND property_id = 'y'
```
The explicit `property_id` in WHERE is parsed by `_parse_where_to_params`:
```python
if "property_id" in where.lower():
    prop_id = context.get("property_id", "")
    if prop_id:
        params["property_id"] = f"eq.{prop_id}"
```
This **overwrites** the LLM's explicit `property_id` with the **session's** `property_id`.

**Impact:** If an admin asks about a different property by name, the query might get scoped to their current session property instead. (Though the system prompt has property name resolution instructions.)

### Bug 4: Schema Sync Only Reads from `database.types.ts`

`schema_sync.py` parses `saas_mobile_app/types/database.types.ts`.

**Problem:** If `database.types.ts` is stale (not regenerated from Supabase), the schema is wrong. The LLM will use wrong column names → SQL Engine won't find them → queries fail.

**Also:** The TypeScript parser regex is brittle:
```python
pattern = re.compile(r"([a-zA-Z_][a-zA-Z0-9_]*):\s*\{\[\s\n\]*Row:\s*\{([^}]+)\}", re.MULTILINE)
```
This assumes `Row: { ... }` is on one nesting level without nested objects. If the TypeScript has nested types, parsing fails silently.

### Bug 5: `sql_engine_v2` LIMIT Logic is Broken for Aggregations

```python
limit_match = re.search(r'LIMIT\s+(\d+)', query, re.IGNORECASE)
params["limit"] = str(min(int(limit_match.group(1)), 200)) if limit_match else "200"
```

For `COUNT(*)` queries, the code correctly uses `count=exact` + `Range: 0-0`.
But for `GROUP BY` queries, it fetches 200 rows and computes groups in Python.

**Impact:** "How many tickets per status this month?" — if there are 500 tickets, fetches 200, counts from 200 → wrong answer.

### Bug 6: `_execute_with_join` Fetches 1000 Rows with Minimal Filtering

```python
left_params = {"select": "*", "limit": "1000"}
if "organization_id" in left_cols:
    left_params["organization_id"] = f"eq.{org_id}" if org_id else ""
```

**Problems:**
- No `property_id` filtering even when the query is property-specific
- `limit=1000` per table → could be 2000 rows total for large orgs
- No date filtering → fetches ALL historical data
- No pagination
- Python merge is O(n*m) in worst case

---

## 5. Why Cassandra Gives Wrong Answers — Summary

| Issue | Severity | When It Happens |
|-------|----------|-----------------|
| LLM generates Postgres syntax that the "SQL engine" can't parse | **HIGH** | Any date arithmetic, complex WHERE, subqueries |
| Aggregations computed on partial data (200-row limit) | **HIGH** | COUNT/GROUP BY on tables with >200 rows |
| JOINs fetch unfiltered 1000-row chunks | **MEDIUM** | Multi-table queries on large datasets |
| Property scope silently overridden | **MEDIUM** | Admin queries across properties |
| `query_tickets` expands "open" to all active statuses | **LOW** | When using query_tickets instead of sql_query |
| SQL Guard is dead code | **LOW** | Security risk, but PostgREST blocks writes |
| Schema may be stale | **MEDIUM** | If database.types.ts not regenerated |

---

## 6. Recommendations

### Immediate Fixes (High Impact, Low Effort)

1. **Fix date parsing in `sql_engine_v2._parse_where_to_params`:**
   - Add regex for `CURRENT_DATE - INTERVAL 'N days'`
   - Add regex for `BETWEEN ... AND ...`
   - Parse `DATE_TRUNC` patterns

2. **Raise the fetch limit for aggregations:**
   - For `COUNT(*)` queries: already correct with `count=exact`
   - For `GROUP BY`: fetch 1000 rows instead of 200, or use PostgREST `count=exact` per group

3. **Fix property_id override bug:**
   - In `_parse_where_to_params`, if the WHERE already has `property_id = 'specific_uuid'`, don't overwrite it with session property_id

4. **Enable SQL Guard:**
   - Call `SQLGuard.validate(query)` in `SQLEngineV2Tool.execute()` before running

### Medium-Term Improvements

5. **Replace regex SQL parser with a proper SQL parser** (e.g., `sqlparse`) or **stop pretending it's SQL**:
   - Instead of `sql_query` tool that takes a SQL string, create structured tools:
     - `count_rows(table, filters)`
     - `list_rows(table, filters, order, limit)`
     - `aggregate(table, group_by, agg_func, filters)`
   - This removes the LLM's ability to hallucinate SQL syntax entirely

6. **For JOINs, use PostgREST embedded resources** instead of Python-side merge:
   ```
   GET /rest/v1/tickets?select=*,properties(name)
   ```
   This is native PostgREST syntax and handles the JOIN server-side.

7. **Add query result caching** with TTL to reduce repeated expensive queries.

### Architecture-Level Fix

8. **Consider switching from PostgREST to direct PostgreSQL connection** (e.g., `psycopg` or `asyncpg`) for the SQL engine:
   - Real SQL execution
   - Real JOINs
   - Real aggregations with `GROUP BY`
   - Proper `EXPLAIN` for query optimization
   - The SQL Guard becomes actually meaningful
   - **Trade-off:** Need to manage connection pooling and keep RLS in mind

---

## 7. File-by-File Health Score

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| `orchestrator/api_server.py` | 870 | ✅ Good | Auth is simple but works; CORS `*` is loose |
| `llm/orchestrator.py` | 1034 | ✅ Good | O→A recovery is smart; tool chaining works |
| `llm/openai_client.py` | 914 | ✅ Good | System prompt is thorough; schema block is live |
| `tools/sql_engine_v2.py` | 679 | ⚠️ **Buggy** | 6 critical bugs identified above |
| `tools/sql_guard.py` | 297 | ⚠️ **Dead code** | Never called |
| `tools/fms_schema.py` | 719 | ✅ Good | Auto-synced from TS types |
| `tools/schema_sync.py` | 331 | ⚠️ **Fragile** | Regex parser may miss nested types |
| `tools/fk_graph.py` | 376 | ✅ Good | 207 relationships loaded correctly |
| `tools/query_tickets.py` | 363 | ⚠️ **Status bug** | "open" over-expanded |
| `tools/create_ticket.py` | 217 | ✅ Good | Clean, direct Supabase insert |
| `tools/health_score.py` | 213 | ✅ Good | Deterministic, correct |
| `config/fk_graph.json` | 207 rels | ✅ Good | Comprehensive, verified |

---

*Report generated by analyzing 12 core files + logs + FK graph configuration.*
