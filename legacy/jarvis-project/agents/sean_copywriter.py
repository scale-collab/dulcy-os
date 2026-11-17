from __future__ import annotations

from typing import Dict, Tuple

from .base_agent import AgentResult, BaseAgent


class SeanCopywriterAgent(BaseAgent):
    name = "Sean"
    role = "Cold Email Copywriter"
    responsibilities = (
        "campaign angles",
        "cold email scripts",
        "follow-ups",
        "subject lines",
        "spintax",
    )
    available_tools_or_existing_capabilities = ("campaign build copy commands", "spintax helpers")
    _KEYWORDS = (
        "cold email copy",
        "write cold email",
        "email copy",
        "campaign copy",
        "follow up email",
        "subject lines",
        "subject line",
        "follow-up sequence",
        "spintax",
        "write copy",
        "campaign angle",
        "email script",
        "email sequence",
    )

    def can_handle(self, task: str, context: Dict[str, object]) -> Tuple[float, str]:
        normalized = self._normalize(task)
        hits = self._count_keyword_hits(task, self._KEYWORDS)
        score = min(0.97, 0.34 + (0.14 * hits)) if hits else 0.0
        if any(
            token in normalized
            for token in (
                "write cold email",
                "cold email copy",
                "email copy",
                "campaign copy",
                "follow up email",
                "subject lines",
                "spintax",
                "email sequence",
            )
        ):
            score = max(score, 0.88)
        stage = self._normalize(context.get("current_stage"))
        if stage and any(token in stage for token in ("copy", "spintax", "sequence")):
            score = max(score, 0.88)
        if score <= 0:
            return 0.0, "no copywriting intent"
        return score, "copywriting/spintax intent match"

    def run(self, task: str, context: Dict[str, object]) -> AgentResult:
        return AgentResult(
            status="delegate",
            summary="Routing to campaign copy workflow.",
            next_action="run campaign build copy command",
            artifacts={
                "delegate_handler": "campaign_build",
                "delegate_input": task,
            },
            agent_name=self.name,
            confidence=0.84,
        )
