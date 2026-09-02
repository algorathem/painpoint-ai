"""Offline fixture items so the pipeline runs without Reddit network."""

from __future__ import annotations

import time

from .models import RawItem
from .phrases import match_phrases

_SAMPLES = [
    (
        "SaaS",
        "post",
        "Tired of manually reconciling Stripe + NetSuite every month",
        "We spend 12 hours every close copying CSVs. Looking for a tool that syncs "
        "refunds and disputes without breaking our GL. I'd pay for something reliable.",
        140,
        32,
    ),
    (
        "Entrepreneur",
        "post",
        "I wish there was a simple way to track competitor pricing changes",
        "Checking 8 competitor sites weekly is a nightmare. Spreadsheet hell. "
        "Is there a tool that alerts on price drops for B2B SaaS pages?",
        88,
        41,
    ),
    (
        "smallbusiness",
        "comment",
        "(comment) still using excel for inventory",
        "Frustrated with our POS — inventory counts never match. How do you handle "
        "multi-location stock without hiring a full-time ops person?",
        22,
        0,
    ),
    (
        "startups",
        "post",
        "Customer support is drowning us after launch",
        "Same 15 questions every day in Intercom. Need automation for tier-1 but "
        "everything we tried hallucinates or sounds robotic. Anyone else struggling?",
        210,
        67,
    ),
    (
        "devops",
        "post",
        "Why is there no good cost anomaly alert for multi-cloud?",
        "AWS Budgets is useless for our K8s spike patterns. Looking for an app that "
        "explains *why* spend jumped, not just that it did.",
        95,
        28,
    ),
    (
        "sales",
        "post",
        "CRM hygiene is a waste of time",
        "Reps hate manually logging calls. We need automation that writes notes from "
        "Gong without wrecking Salesforce validation rules.",
        73,
        19,
    ),
    (
        "SaaS",
        "post",
        "Just shipped our v1 (not a pain)",
        "Excited to share our new landing page redesign!",
        5,
        1,
    ),
]


def demo_items() -> list[RawItem]:
    now = time.time()
    items: list[RawItem] = []
    for i, (sub, src, title, body, score, ncom) in enumerate(_SAMPLES):
        blob = f"{title}\n{body}"
        items.append(
            RawItem(
                id=f"demo{i}",
                source=src,
                subreddit=sub,
                title=title,
                body=body,
                score=score,
                num_comments=ncom,
                url=f"https://www.reddit.com/r/{sub}/comments/demo{i}/",
                created_utc=now - i * 86400,
                author="demo_user",
                matched_phrases=match_phrases(blob),
            )
        )
    return [x for x in items if x.matched_phrases]
