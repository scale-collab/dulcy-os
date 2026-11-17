from __future__ import annotations

from typing import Any, Dict, Tuple

from .base_agent import AgentResult, BaseAgent


class AvaCustomerSuccessAgent(BaseAgent):
    name = "Ava"
    role = "Customer Success Manager / Support"
    responsibilities = (
        "client slack updates",
        "client broadcasts",
        "support responses",
        "onboarding explanations",
    )
    available_tools_or_existing_capabilities = (
        "communication_commands",
        "slack drafting",
        "broadcast preview/send flows",
    )
    _KEYWORDS = (
        "send message",
        "send a message",
        "slack message",
        "notify",
        "announcement",
        "broadcast",
        "client communication",
        "channel",
        "client channels",
        "client broadcast",
        "announce",
        "update clients",
        "support",
        "onboarding",
        "write back",
        "reply to",
    )

    def can_handle(self, task: str, context: Dict[str, Any]) -> Tuple[float, str]:
        normalized = self._normalize(task)
        hits = self._count_keyword_hits(task, self._KEYWORDS)
        score = min(0.97, 0.34 + (0.16 * hits)) if hits else 0.0
        if "slack" in normalized and any(
            token in normalized for token in ("send", "message", "notify", "announcement", "broadcast")
        ):
            score = max(score, 0.86)
        if self._normalize(context.get("active_draft_type")) == "slack":
            score = max(score, 0.72)
        reason = "communication intent match" if score > 0 else "no communication intent"
        return score, reason

    def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        return AgentResult(
            status="delegate",
            summary="Routing to client communication workflow.",
            next_action="run communication handler",
            artifacts={
                "delegate_handler": "communication",
                "delegate_input": task,
            },
            agent_name=self.name,
            confidence=0.8,
            user_response=None,
        )
