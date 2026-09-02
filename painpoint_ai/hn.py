"""Hacker News pain signals via Algolia HN Search API."""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json
import re

from .models import RawItem
from .phrases import match_phrases

HN_API = "https://hn.algolia.com/api/v1/search"
UA = "painpoint-ai/0.2 (research)"

DEFAULT_QUERIES = [
    "I wish there was a tool",
    "looking for a tool",
    "is there a tool that",
    "I'd pay for",
    "frustrated with",
    "manual process spreadsheet",
    "need automation for",
    "alternative to",
    "waste of time SaaS",
    "anyone recommend a tool",
]


def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = (
        text.replace("&quot;", '"')
        .replace("&#x27;", "'")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
    )
    return re.sub(r"\s+", " ", text).strip()


def _get(params: dict[str, Any]) -> dict:
    url = f"{HN_API}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _hit_to_item(hit: dict, kind: str) -> RawItem | None:
    if kind == "comment":
        title = _strip_html(hit.get("story_title") or hit.get("title") or "(HN comment)")[:160]
        body = _strip_html(hit.get("comment_text") or "")
    else:
        title = _strip_html(hit.get("title") or "(HN story)")[:160]
        body = _strip_html(hit.get("story_text") or hit.get("title") or "")
    blob = f"{title}\n{body}"
    phrases = match_phrases(blob)
    if not phrases and len(body) < 20 and len(title) < 20:
        return None
    oid = hit.get("objectID") or hit.get("story_id") or title[:20]
    url = hit.get("url") or (
        f"https://news.ycombinator.com/item?id={oid}" if oid else ""
    )
    return RawItem(
        id=f"hn-{oid}",
        source="comment" if kind == "comment" else "post",
        subreddit="hn",
        title=f"(HN) {title}",
        body=body[:4000],
        score=int(hit.get("points") or hit.get("num_comments") or 0),
        num_comments=int(hit.get("num_comments") or 0),
        url=url,
        created_utc=float(hit.get("created_at_i") or 0),
        author=str(hit.get("author") or ""),
        matched_phrases=phrases or ["hn-query"],
    )


def scan_hn(
    *,
    days: int = 30,
    limit_per_query: int = 12,
    queries: list[str] | None = None,
) -> list[RawItem]:
    after = int(time.time()) - days * 86400
    qs = queries or DEFAULT_QUERIES
    seen: set[str] = set()
    out: list[RawItem] = []
    for q in qs:
        for tags in ("story", "comment"):
            try:
                data = _get(
                    {
                        "query": q,
                        "tags": tags,
                        "hitsPerPage": str(min(limit_per_query, 20)),
                        "numericFilters": f"created_at_i>{after}",
                    }
                )
            except Exception:
                continue
            for hit in data.get("hits") or []:
                item = _hit_to_item(hit, "comment" if tags == "comment" else "story")
                if item and item.id not in seen:
                    seen.add(item.id)
                    out.append(item)
            time.sleep(0.12)
    out.sort(key=lambda x: x.score + x.num_comments * 2, reverse=True)
    return out
