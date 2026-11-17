from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class AgentResult:
    status: str
    summary: str
    next_action: Optional[str] = None
    requires_approval: bool = False
    artifacts: Dict[str, Any] = field(default_factory=dict)
    diagnostics: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    agent_name: str = ""
    confidence: float = 0.0
    user_response: Optional[str] = None


class BaseAgent:
    name: str = "base"
    role: str = "Base Agent"
    responsibilities: Tuple[str, ...] = tuple()
    available_tools_or_existing_capabilities: Tuple[str, ...] = tuple()

    def can_handle(self, task: str, context: Dict[str, Any]) -> Tuple[float, str]:
        return 0.0, "no capability match"

    def run(self, task: str, context: Dict[str, Any]) -> AgentResult:
        return AgentResult(
            status="not_handled",
            summary="No action executed.",
            next_action="fallback",
            agent_name=self.name,
            confidence=0.0,
        )

    @staticmethod
    def _normalize(value: Any) -> str:
        return str(value or "").strip().lower()

    @staticmethod
    def _count_keyword_hits(text: str, keywords: Tuple[str, ...]) -> int:
        normalized = BaseAgent._normalize(text)
        return sum(1 for keyword in keywords if keyword in normalized)

