"""OpenAI-compatible LLM client (uses Hermes ~/.hermes/.env by default)."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from openai import OpenAI

from .models import RawItem, ScoredPain, StartupIdea

SYSTEM_CLASSIFY = """You are a B2B SaaS opportunity analyst.
Given a Reddit post or comment, decide if it describes a real, specific pain
that a software product could address (not pure venting, not off-topic).

Return STRICT JSON only:
{
  "is_pain": boolean,
  "description": "one sentence pain summary",
  "category": "one of: workflow, automation, integration, reporting, sales, support, compliance, finance, hr, devops, marketing, other",
  "severity": 1-5,
  "willingness_to_pay": "low|medium|high|unknown",
  "idea_seed": "short product idea name/angle if is_pain else empty",
  "confidence": 0.0-1.0
}
If not a useful product pain, set is_pain=false and empty strings.
"""

SYSTEM_CLUSTER = """You cluster Reddit pain points into startup / SaaS product ideas.
Return STRICT JSON:
{
  "ideas": [
    {
      "title": "product name angle",
      "problem": "one paragraph problem statement",
      "who": "buyer persona",
      "why_now": "timing hook",
      "evidence_ids": ["id1","id2"],
      "categories": ["workflow"],
      "score": 0-100
    }
  ]
}
Max 8 ideas. Prefer repeated themes with multiple evidence_ids.
Only use evidence ids provided. No markdown.
"""


def _load_dotenv_files() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    # project .env first, then Hermes home
    load_dotenv(Path.cwd() / ".env", override=False)
    hermes = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")) / ".env"
    if hermes.exists():
        load_dotenv(hermes, override=False)


def get_client() -> OpenAI:
    _load_dotenv_files()
    base = os.environ.get("OPENAI_BASE_URL") or os.environ.get("LINTWARE_BASE_URL")
    key = os.environ.get("OPENAI_API_KEY") or os.environ.get("LINTWARE_API_KEY")
    if not key:
        raise RuntimeError(
            "Missing OPENAI_API_KEY (or LINTWARE_API_KEY). "
            "Put it in .env or ~/.hermes/.env"
        )
    kwargs: dict[str, Any] = {"api_key": key}
    if base:
        kwargs["base_url"] = base
    return OpenAI(**kwargs)


def model_name() -> str:
    return os.environ.get("PAINPOINT_MODEL") or os.environ.get(
        "HERMES_MODEL", "grok-4.5"
    )


def _parse_json(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            raise
        return json.loads(m.group(0))


def classify_item(client: OpenAI, item: RawItem) -> ScoredPain:
    user = (
        f"type={item.source}\nsubreddit=r/{item.subreddit}\n"
        f"score={item.score} comments={item.num_comments}\n"
        f"matched_phrases={item.matched_phrases}\n"
        f"url={item.url}\n\n"
        f"TITLE: {item.title}\n\nBODY:\n{item.body[:3000]}"
    )
    resp = client.chat.completions.create(
        model=model_name(),
        temperature=0.2,
        max_tokens=400,
        messages=[
            {"role": "system", "content": SYSTEM_CLASSIFY},
            {"role": "user", "content": user},
        ],
    )
    raw = resp.choices[0].message.content or "{}"
    data = _parse_json(raw)
    return ScoredPain(
        item=item,
        is_pain=bool(data.get("is_pain")),
        description=str(data.get("description") or ""),
        category=str(data.get("category") or "other"),
        severity=int(data.get("severity") or 0),
        willingness_to_pay=str(data.get("willingness_to_pay") or "unknown"),
        idea_seed=str(data.get("idea_seed") or ""),
        confidence=float(data.get("confidence") or 0.0),
    )


def classify_batch(
    client: OpenAI,
    items: list[RawItem],
    *,
    max_items: int = 40,
) -> list[ScoredPain]:
    out: list[ScoredPain] = []
    for item in items[:max_items]:
        try:
            out.append(classify_item(client, item))
        except Exception as e:
            out.append(
                ScoredPain(
                    item=item,
                    is_pain=False,
                    description=f"classify_error: {type(e).__name__}",
                    category="other",
                    severity=0,
                    willingness_to_pay="unknown",
                    idea_seed="",
                    confidence=0.0,
                )
            )
    return out


def cluster_ideas(
    client: OpenAI, pains: list[ScoredPain], *, max_ideas: int = 8
) -> list[StartupIdea]:
    pains = [p for p in pains if p.is_pain]
    if not pains:
        return []
    lines = []
    id_map = {}
    for i, p in enumerate(pains[:50]):
        eid = p.item.id or f"e{i}"
        id_map[eid] = p
        lines.append(
            f"- id={eid} | r/{p.item.subreddit} | sev={p.severity} | "
            f"cat={p.category} | wtp={p.willingness_to_pay} | "
            f"{p.description} | seed={p.idea_seed} | url={p.item.url}"
        )
    user = f"Evidence list:\n" + "\n".join(lines) + f"\n\nReturn up to {max_ideas} ideas."
    resp = client.chat.completions.create(
        model=model_name(),
        temperature=0.3,
        max_tokens=2000,
        messages=[
            {"role": "system", "content": SYSTEM_CLUSTER},
            {"role": "user", "content": user},
        ],
    )
    data = _parse_json(resp.choices[0].message.content or "{}")
    ideas: list[StartupIdea] = []
    for row in data.get("ideas") or []:
        eids = list(row.get("evidence_ids") or [])
        urls = []
        for eid in eids:
            if eid in id_map:
                urls.append(id_map[eid].item.url)
        ideas.append(
            StartupIdea(
                title=str(row.get("title") or "Untitled"),
                problem=str(row.get("problem") or ""),
                who=str(row.get("who") or ""),
                why_now=str(row.get("why_now") or ""),
                evidence_count=len(eids),
                evidence_urls=urls[:8],
                categories=list(row.get("categories") or []),
                score=float(row.get("score") or 0),
            )
        )
    ideas.sort(key=lambda x: x.score, reverse=True)
    return ideas[:max_ideas]
