"""
Fetch Context Tool — User/Org/Property Context Snapshot
=========================================================

Returns the REAL membership context (org, role, current property, and the
full list of properties the user can access) from OrchestratorContext.

There is no semantic memory / RAG store wired up anywhere in this deployment
(cassandra/rag/ is an empty placeholder package, no vector DB credentials
exist in any env file). This tool previously returned three hardcoded fake
"memory" records (vendor contact, shift schedule, ticket history) regardless
of the query — data that had nothing to do with the actual org and could be
presented to the user as if it were real. It now returns only what is
actually known and true: the caller's real org/role/property scope.

Module: 4.1
Status: ACTIVE
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from cassandra.orchestrator import (
    Tool,
    ToolResult,
    OrchestratorContext,
)

# ---------------------------------------------------------------------------
# Fetch Context Tool
# ---------------------------------------------------------------------------

class FetchContextTool(Tool):
    """
    Tool for retrieving the caller's real membership/scope context.

    Arguments:
        query: str — unused for now (kept for API compatibility / future RAG)
        scope: str — Scope filter: "property", "organization", "user", "all"
        limit: int — Maximum properties to return (default 5)

    Returns:
        ToolResult with real org_id, role, current property_id, and the
        properties the user can access (name/code/city + id).
    """

    name = "fetch_context"
    description = (
        "Fetch the current user's real organization, role, current property, "
        "and the full list of properties they can access. Use this for "
        "'my properties/org/role' questions. Does NOT search ticket history or "
        "past conversations — use sql_query or query_tickets for that."
    )

    def __init__(self, rag_store: Optional[Any] = None):
        """
        Args:
            rag_store: reserved for a future semantic-memory integration.
                       No implementation exists yet — passing this has no effect.
        """
        self.rag_store = rag_store
        self.logger = logging.getLogger("cassandra.tools.fetch_context")

    def execute(
        self,
        arguments: dict[str, Any],
        context: OrchestratorContext,
    ) -> ToolResult:
        call_id = f"fetch_context_{context.turn_count}"
        include_properties: bool = arguments.get("include_properties", True)
        include_role: bool = arguments.get("include_role", True)

        result: dict[str, Any] = {
            "org_id": context.org_id,
            "current_property_id": context.property_id or None,
        }

        if include_role:
            result["user_id"] = context.user_id
            result["role"] = context.role

        if include_properties:
            property_metadata = getattr(context, "property_metadata", None) or {}
            allowed_property_ids = getattr(context, "allowed_property_ids", None) or []

            properties = []
            for pid in allowed_property_ids or list(property_metadata.keys()):
                meta = property_metadata.get(pid, {})
                properties.append({
                    "id": pid,
                    "name": meta.get("name", ""),
                    "code": meta.get("code", ""),
                    "city": meta.get("city", ""),
                })
            result["properties"] = properties
            result["property_count"] = len(properties)

        return ToolResult(
            call_id=call_id,
            tool_name=self.name,
            success=True,
            result=result,
        )
