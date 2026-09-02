"""Fetch public Reddit history via Arctic Shift (no Reddit OAuth required)."""

from __future__ import annotations

import time
from typing import Iterable

import httpx

from .models import RawItem
from .phrases import match_phrases

BASE = "https://arctic-shift.photon-reddit.com"
UA = "macos:painpoint-ai:0.1.0 (personal research; contact: inspectlab.app)"


def _client() -> httpx.Client:
    return httpx.Client(
        base_url=BASE,
        timeout=45.0,
        headers={"User-Agent": UA, "Accept": "application/json"},
    )


def _permalink(p: dict) -> str:
    pl = p.get("permalink") or ""
    if pl.startswith("http"):
        return pl
    if pl:
        return f"https://www.reddit.com{pl}"
    return p.get("url") or ""


def fetch_posts(
    subreddit: str,
    *,
    limit: int = 100,
    days: int = 30,
    selftext_contains: str | None = None,
) -> list[dict]:
    now = int(time.time())
    after = now - days * 86400
    params: dict = {
        "subreddit": subreddit,
        "limit": min(limit, 100),
        "after": after,
        "before": now,
    }
    # text filter is optional; Arctic can timeout on heavy queries
    if selftext_contains:
        params["selftext"] = selftext_contains
    with _client() as c:
        for attempt in range(4):
            r = c.get("/api/posts/search", params=params)
            if r.status_code == 200:
                return list(r.json().get("data") or [])
            if r.status_code in (422, 429, 503):
                time.sleep(1.5 * (attempt + 1))
                continue
            r.raise_for_status()
        return []


def fetch_comments(
    subreddit: str,
    *,
    limit: int = 100,
    days: int = 30,
) -> list[dict]:
    now = int(time.time())
    after = now - days * 86400
    params = {
        "subreddit": subreddit,
        "limit": min(limit, 100),
        "after": after,
        "before": now,
    }
    with _client() as c:
        for attempt in range(4):
            r = c.get("/api/comments/search", params=params)
            if r.status_code == 200:
                return list(r.json().get("data") or [])
            if r.status_code in (422, 429, 503):
                time.sleep(1.5 * (attempt + 1))
                continue
            r.raise_for_status()
        return []


def to_items(
    posts: Iterable[dict],
    comments: Iterable[dict],
    *,
    phrase_filter: bool = True,
) -> list[RawItem]:
    items: list[RawItem] = []
    for p in posts:
        title = (p.get("title") or "").strip()
        body = (p.get("selftext") or "").strip()
        if body in ("[removed]", "[deleted]"):
            body = ""
        blob = f"{title}\n{body}"
        phrases = match_phrases(blob)
        if phrase_filter and not phrases:
            continue
        items.append(
            RawItem(
                id=str(p.get("id") or p.get("name") or title[:40]),
                source="post",
                subreddit=str(p.get("subreddit") or ""),
                title=title,
                body=body[:4000],
                score=int(p.get("score") or 0),
                num_comments=int(p.get("num_comments") or 0),
                url=_permalink(p),
                created_utc=float(p.get("created_utc") or 0),
                author=str(p.get("author") or ""),
                matched_phrases=phrases,
            )
        )
    for c in comments:
        body = (c.get("body") or "").strip()
        if not body or body in ("[removed]", "[deleted]"):
            continue
        phrases = match_phrases(body)
        if phrase_filter and not phrases:
            continue
        link_id = str(c.get("link_id") or "").replace("t3_", "")
        sub = str(c.get("subreddit") or "")
        cid = str(c.get("id") or "")
        url = f"https://www.reddit.com/r/{sub}/comments/{link_id}/_/{cid}/" if link_id else ""
        items.append(
            RawItem(
                id=cid or body[:40],
                source="comment",
                subreddit=sub,
                title=f"(comment) {body[:80]}",
                body=body[:4000],
                score=int(c.get("score") or 0),
                num_comments=0,
                url=url,
                created_utc=float(c.get("created_utc") or 0),
                author=str(c.get("author") or ""),
                matched_phrases=phrases,
            )
        )
    # de-dupe
    seen: set[str] = set()
    out: list[RawItem] = []
    for it in items:
        if it.id in seen:
            continue
        seen.add(it.id)
        out.append(it)
    out.sort(key=lambda x: (x.score + x.num_comments * 2), reverse=True)
    return out


def scan_subreddits(
    subreddits: list[str],
    *,
    limit_per: int = 80,
    days: int = 45,
    include_comments: bool = True,
    phrase_filter: bool = True,
) -> list[RawItem]:
    all_items: list[RawItem] = []
    for sub in subreddits:
        sub = sub.lstrip("r/").strip()
        if not sub:
            continue
        posts = fetch_posts(sub, limit=limit_per, days=days)
        time.sleep(0.4)
        comments: list[dict] = []
        if include_comments:
            comments = fetch_comments(sub, limit=limit_per, days=days)
            time.sleep(0.4)
        all_items.extend(
            to_items(posts, comments, phrase_filter=phrase_filter)
        )
    return all_items
