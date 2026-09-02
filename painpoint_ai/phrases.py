"""Complaint / unmet-need phrase bank (keyword prefilter before LLM)."""

from __future__ import annotations

# High-signal B2B / founder pain language. Keep phrases multi-word when possible.
PAIN_PHRASES: list[str] = [
    "i wish there was",
    "i wish i could",
    "why is there no",
    "why isn't there",
    "looking for a tool",
    "looking for an app",
    "looking for software",
    "is there a tool",
    "is there an app",
    "is there a way",
    "does anyone know a",
    "can anyone recommend",
    "anyone else struggling",
    "tired of",
    "sick of",
    "fed up",
    "frustrated with",
    "frustrating",
    "hate manually",
    "manual process",
    "manually doing",
    "waste of time",
    "wastes so much time",
    "takes forever",
    "takes hours",
    "spending hours",
    "too expensive",
    "overpriced",
    "doesn't work",
    "does not work",
    "no good solution",
    "can't find a",
    "cannot find a",
    "struggling with",
    "how do you deal with",
    "how do you handle",
    "painful workflow",
    "bottleneck",
    "repetitive task",
    "need automation",
    "wish there was a tool",
    "i'd pay for",
    "i would pay for",
    "alternative to",
    "better than",
    "switching from",
    "canceling",
    "cancelling",
    "churn",
    "onboarding nightmare",
    "support is useless",
    "broken integration",
    "no api",
    "no webhook",
    "csv hell",
    "copy paste",
    "copy-paste",
    "spreadsheet hell",
    "still using excel",
    "still using sheets",
]

# Soft boosts — alone not enough, but raise score with other signals
SOFT_PHRASES: list[str] = [
    "manual",
    "annoying",
    "frustrated",
    "workaround",
    "hacky",
    "time consuming",
    "time-consuming",
    "inefficient",
    "unreliable",
    "overwhelmed",
]


def match_phrases(text: str) -> list[str]:
    lowered = (text or "").lower()
    hits = [p for p in PAIN_PHRASES if p in lowered]
    if not hits:
        soft = [p for p in SOFT_PHRASES if p in lowered]
        if len(soft) >= 2:
            return soft
    return hits
