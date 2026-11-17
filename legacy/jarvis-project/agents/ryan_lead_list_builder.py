from __future__ import annotations

from typing import Dict, Tuple

from .base_agent import AgentResult, BaseAgent


class RyanLeadListBuilderAgent(BaseAgent):
    name = "Ryan"
    role = "Lead List Builder"
    responsibilities = (
        "icp interpretation",
        "discolike workflow",
        "company/contact qa",
        "query refinement",
        "scaling recommendations",
    )
    available_tools_or_existing_capabilities = (
        "discolike commands",
        "campaign build workflow",
        "lead-list qa diagnostics",
    )
    _KEYWORDS = (
        "find companies",
        "similar companies",
        "companies like",
        "discover companies",
        "prospects",
        "lead list",
        "discolike",
        "forever leads",
        "icp",
        "build sample",
        "company qa",
        "contact qa",
        "scale list",
        "validate first 100",
        "find companies like",
        "generate contacts",
        "refine discolike",
    )
    _LEAD_STAGE_HINTS = (
        "sample",
        "company qa",
        "contact qa",
        "lead list",
        "discolike",
        "contacts",
        "scale",
    )

    def can_handle(self, task: str, context: Dict[str, object]) -> Tuple[float, str]:
        normalized = self._normalize(task)
        hits = self._count_keyword_hits(task, self._KEYWORDS)
        score = min(0.97, 0.34 + (0.14 * hits)) if hits else 0.0
        if any(
            token in normalized
            for token in (
                "find companies",
                "companies like",
                "similar companies",
                "discover companies",
                "prospects",
                "discolike",
                "forever leads",
            )
        ):
            score = max(score, 0.88)

        workflow = self._normalize(context.get("active_workflow_type"))
        stage = self._normalize(context.get("current_stage"))
        if workflow == "campaign_build" and any(token in stage for token in self._LEAD_STAGE_HINTS):
            score = max(score, 0.9)

        if score <= 0:
            return 0.0, "no lead-list intent"
        return score, "lead-list/discolike workflow match"

    def run(self, task: str, context: Dict[str, object]) -> AgentResult:
        normalized = self._normalize(task)
        delegate_handler = "discolike"
        if any(token in normalized for token in ("campaign build", "show campaign", "workflow")):
            delegate_handler = "campaign_build"
        return AgentResult(
            status="delegate",
            summary="Routing to lead-list workflow.",
            next_action=f"run {delegate_handler} handler",
            artifacts={
                "delegate_handler": delegate_handler,
                "delegate_input": task,
                "fallback_handler": "campaign_build" if delegate_handler != "campaign_build" else "discolike",
            },
            agent_name=self.name,
            confidence=0.86,
        )
