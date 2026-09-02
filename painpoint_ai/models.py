from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class RawItem:
    id: str
    source: str  # post | comment
    subreddit: str
    title: str
    body: str
    score: int
    num_comments: int
    url: str
    created_utc: float
    author: str = ""
    matched_phrases: list[str] = field(default_factory=list)

    @property
    def text_blob(self) -> str:
        if self.source == "comment":
            return f"{self.title}\n{self.body}".strip()
        return f"{self.title}\n{self.body}".strip()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ScoredPain:
    item: RawItem
    is_pain: bool
    description: str
    category: str
    severity: int  # 1-5
    willingness_to_pay: str  # low|medium|high|unknown
    idea_seed: str
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        d = self.item.to_dict()
        d.update(
            {
                "is_pain": self.is_pain,
                "description": self.description,
                "category": self.category,
                "severity": self.severity,
                "willingness_to_pay": self.willingness_to_pay,
                "idea_seed": self.idea_seed,
                "confidence": self.confidence,
            }
        )
        return d


@dataclass
class StartupIdea:
    title: str
    problem: str
    who: str
    why_now: str
    evidence_count: int
    evidence_urls: list[str]
    categories: list[str]
    score: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
