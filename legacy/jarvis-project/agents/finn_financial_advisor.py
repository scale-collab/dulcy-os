from __future__ import annotations

from typing import Dict, Tuple

from .base_agent import AgentResult, BaseAgent


class FinnFinancialAdvisorAgent(BaseAgent):
    name = "Finn"
    role = "Financial Advisor"
    responsibilities = (
        "cash flow",
        "opex",
        "pricing",
        "budgeting",
        "forecasts",
    )
    available_tools_or_existing_capabilities = ("financial summaries",)
    _KEYWORDS = (
        "opex",
        "cash flow",
        "profit",
        "margin",
        "budget",
        "forecast",
        "pricing",
        "finance",
    )

    def can_handle(self, task: str, context: Dict[str, object]) -> Tuple[float, str]:
        hits = self._count_keyword_hits(task, self._KEYWORDS)
        if hits == 0:
            return 0.0, "no finance intent"
        return min(0.9, 0.3 + (0.15 * hits)), "financial intent match"

    def run(self, task: str, context: Dict[str, object]) -> AgentResult:
        return AgentResult(
            status="handled",
            summary="Financial workflow selected.",
            next_action="prepare finance summary from connected systems",
            artifacts={"execution_mode": "finance_plan"},
            diagnostics={"task": task},
            agent_name=self.name,
            confidence=0.78,
            user_response=(
                "\nJarvis:\n\n"
                "Routing this through Finn (finance). "
                "I’ll prepare a concise financial summary and call out required data pulls."
            ),
        )

