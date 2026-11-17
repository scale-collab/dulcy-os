from __future__ import annotations

from typing import Dict, Tuple

from .base_agent import AgentResult, BaseAgent


class DevDeveloperAgent(BaseAgent):
    name = "Dev"
    role = "Developer"
    responsibilities = (
        "jarvis bugs",
        "refactors",
        "tests",
        "repo architecture",
    )
    available_tools_or_existing_capabilities = (
        "developer plans",
        "debug routing",
        "smoke-test guidance",
    )
    _KEYWORDS = (
        "bug",
        "fix",
        "refactor",
        "test",
        "failing",
        "stack trace",
        "compile",
        "implementation",
        "routing issue",
    )
    _STRONG_TECH_KEYWORDS = (
        "bug",
        "error",
        "fix",
        "refactor",
        "debug",
        "implementation",
        "architecture",
        "code",
        "stack trace",
    )
    _COMMUNICATION_TERMS = (
        "slack message",
        "send message",
        "announcement",
        "broadcast",
        "client communication",
        "channel",
    )

    def can_handle(self, task: str, context: Dict[str, object]) -> Tuple[float, str]:
        normalized = self._normalize(task)
        if any(term in normalized for term in self._COMMUNICATION_TERMS):
            return 0.0, "communication intent should route to customer-success"

        hits = self._count_keyword_hits(task, self._KEYWORDS)
        if hits == 0:
            return 0.0, "no engineering intent"
        strong_hits = self._count_keyword_hits(task, self._STRONG_TECH_KEYWORDS)
        if strong_hits == 0 and "test" in normalized:
            return 0.18, "weak technical signal (test-only)"
        return min(0.96, 0.28 + (0.13 * strong_hits) + (0.05 * hits)), "engineering/debug intent match"

    def run(self, task: str, context: Dict[str, object]) -> AgentResult:
        return AgentResult(
            status="handled",
            summary="Developer workflow selected.",
            next_action="inspect logs and run focused smoke tests",
            artifacts={"execution_mode": "developer_plan"},
            diagnostics={"task": task},
            agent_name=self.name,
            confidence=0.86,
            user_response=(
                "\nJarvis:\n\n"
                "Routing this through Dev (engineering). "
                "I will inspect the implementation path, patch the issue, and run focused smoke tests."
            ),
        )
