from __future__ import annotations

from typing import Dict, Tuple

from .base_agent import AgentResult, BaseAgent


class ScoutResearchAgent(BaseAgent):
    name = "Scout"
    role = "Research Agent"
    responsibilities = (
        "market research",
        "icp research",
        "competitor research",
        "offer research",
    )
    available_tools_or_existing_capabilities = ("research summaries",)
    _KEYWORDS = (
        "research",
        "competitor",
        "market",
        "analyze market",
        "icp research",
        "offer research",
        "find trends",
    )

    def can_handle(self, task: str, context: Dict[str, object]) -> Tuple[float, str]:
        hits = self._count_keyword_hits(task, self._KEYWORDS)
        if hits == 0:
            return 0.0, "no research intent"
        return min(0.9, 0.28 + (0.16 * hits)), "research intent match"

    def run(self, task: str, context: Dict[str, object]) -> AgentResult:
        return AgentResult(
            status="handled",
            summary="Research workflow selected.",
            next_action="gather sources and produce strategic summary",
            artifacts={"execution_mode": "research_plan"},
            diagnostics={"task": task},
            agent_name=self.name,
            confidence=0.8,
            user_response=(
                "\nJarvis:\n\n"
                "Routing this through Scout (research). "
                "I’ll gather the relevant market/competitor context and return a concise summary."
            ),
        )

