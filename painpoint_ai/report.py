from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .models import RawItem, ScoredPain, StartupIdea


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def write_pains_csv(path: Path, pains: list[ScoredPain]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "is_pain",
        "severity",
        "category",
        "willingness_to_pay",
        "confidence",
        "description",
        "idea_seed",
        "subreddit",
        "source",
        "score",
        "num_comments",
        "title",
        "matched_phrases",
        "url",
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for p in pains:
            row = p.to_dict()
            row["matched_phrases"] = "; ".join(p.item.matched_phrases)
            w.writerow({k: row.get(k, "") for k in fields})


def write_markdown(
    path: Path,
    *,
    query_note: str,
    items: list[RawItem],
    pains: list[ScoredPain],
    ideas: list[StartupIdea],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    true_pains = [p for p in pains if p.is_pain]
    lines = [
        f"# Painpoint AI report",
        f"",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        f"Context: {query_note}",
        f"",
        f"## Summary",
        f"",
        f"- Candidates after phrase filter: **{len(items)}**",
        f"- LLM-confirmed pains: **{len(true_pains)}**",
        f"- Startup ideas: **{len(ideas)}**",
        f"",
        f"## Top startup ideas",
        f"",
    ]
    if not ideas:
        lines.append("_No clustered ideas (not enough confirmed pains)._")
    for i, idea in enumerate(ideas, 1):
        lines += [
            f"### {i}. {idea.title}  (score {idea.score:.0f})",
            f"",
            f"- **Who:** {idea.who}",
            f"- **Problem:** {idea.problem}",
            f"- **Why now:** {idea.why_now}",
            f"- **Categories:** {', '.join(idea.categories) or '—'}",
            f"- **Evidence:** {idea.evidence_count} posts/comments",
        ]
        for u in idea.evidence_urls[:5]:
            lines.append(f"  - {u}")
        lines.append("")
    lines += ["## Confirmed pains", ""]
    for p in sorted(true_pains, key=lambda x: x.severity, reverse=True)[:25]:
        lines += [
            f"- **[{p.severity}/5 | {p.category} | wtp={p.willingness_to_pay}]** "
            f"r/{p.item.subreddit}: {p.description}",
            f"  - {p.item.url}",
        ]
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def write_telegram_digest(
    path: Path, ideas: list[StartupIdea], pains: list[ScoredPain]
) -> str:
    """Short plain-text digest suitable for hermes send --to telegram."""
    true_pains = [p for p in pains if p.is_pain]
    lines = [
        "Painpoint AI digest",
        f"Confirmed pains: {len(true_pains)} | Ideas: {len(ideas)}",
        "",
    ]
    for i, idea in enumerate(ideas[:5], 1):
        lines.append(f"{i}. {idea.title} (score {idea.score:.0f})")
        lines.append(f"   {idea.problem[:160]}")
        if idea.evidence_urls:
            lines.append(f"   {idea.evidence_urls[0]}")
        lines.append("")
    text = "\n".join(lines).strip() + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return text
