from __future__ import annotations

from typing import Dict, Tuple

from .base_agent import AgentResult, BaseAgent


class ElleExecutiveAssistantAgent(BaseAgent):
    name = "Elle"
    role = "Executive Assistant"
    responsibilities = (
        "calendar scheduling",
        "reminders",
        "admin follow-ups",
        "task tracking",
    )
    available_tools_or_existing_capabilities = ("calendar commands", "workflow commands")
    _KEYWORDS = (
        "schedule",
        "calendar",
        "remind",
        "meeting invite",
        "google meet",
        "follow up",
        "admin task",
        "task reminder",
    )

    def can_handle(self, task: str, context: Dict[str, object]) -> Tuple[float, str]:
        hits = self._count_keyword_hits(task, self._KEYWORDS)
        if hits == 0:
            return 0.0, "no executive-assistant intent"
        return min(0.92, 0.32 + (0.14 * hits)), "calendar/admin intent match"

    def run(self, task: str, context: Dict[str, object]) -> AgentResult:
        return AgentResult(
            status="delegate",
            summary="Routing to calendar/admin workflow.",
            next_action="run calendar handler",
            artifacts={
                "delegate_handler": "calendar",
                "delegate_input": task,
                "fallback_handler": "workflow",
            },
            agent_name=self.name,
            confidence=0.82,
        )

