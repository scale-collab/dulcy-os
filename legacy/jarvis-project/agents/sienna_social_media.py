from __future__ import annotations

from typing import Dict, Tuple

from .base_agent import AgentResult, BaseAgent


class SiennaSocialMediaAgent(BaseAgent):
    name = "Sienna"
    role = "Social Media Manager"
    responsibilities = (
        "social posts",
        "content calendar",
        "linkedin/twitter content",
        "repurposing content",
    )
    available_tools_or_existing_capabilities = ("content drafting", "social strategy summaries")
    _KEYWORDS = (
        "linkedin",
        "twitter",
        "social post",
        "social media",
        "content calendar",
        "repurpose content",
    )

    def can_handle(self, task: str, context: Dict[str, object]) -> Tuple[float, str]:
        hits = self._count_keyword_hits(task, self._KEYWORDS)
        if hits == 0:
            return 0.0, "no social/content intent"
        return min(0.92, 0.3 + (0.16 * hits)), "social/content intent match"

    def run(self, task: str, context: Dict[str, object]) -> AgentResult:
        return AgentResult(
            status="handled",
            summary="Social content workflow selected.",
            next_action="draft platform-ready social content",
            artifacts={"execution_mode": "social_content_plan"},
            diagnostics={"task": task},
            agent_name=self.name,
            confidence=0.82,
            user_response=(
                "\nJarvis:\n\n"
                "Routing this through Sienna (social media). "
                "I’ll produce concise post-ready copy and a practical posting plan."
            ),
        )

