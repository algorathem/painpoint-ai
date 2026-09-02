"""Apple App Store customer reviews via public iTunes RSS (no key)."""

from __future__ import annotations

import json
import re
import time
from typing import Any
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from .models import RawItem
from .phrases import match_phrases

UA = "painpoint-ai/0.3 (research)"
# Common SaaS / productivity apps (US store trackIds)
DEFAULT_APPS: list[tuple[str, int]] = [
    ("Slack", 618783545),
    ("Notion", 1232780281),
    ("Figma", 1152747299),
    ("Canva", 897446215),
    ("ChatGPT", 6448311069),
    ("Microsoft Teams", 1113153706),
    ("Asana", 489969512),
    ("Trello", 461504587),
]


def _get_json(url: str) -> Any:
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", "replace").lstrip("\n")
        return json.loads(raw)


def search_app(term: str, *, country: str = "us", limit: int = 5) -> list[dict]:
    url = (
        "https://itunes.apple.com/search?"
        + urlencode(
            {
                "term": term,
                "entity": "software",
                "limit": str(limit),
                "country": country,
            }
        )
    )
    data = _get_json(url)
    out = []
    for r in data.get("results") or []:
        tid = r.get("trackId")
        if not tid:
            continue
        out.append(
            {
                "id": int(tid),
                "name": r.get("trackName") or term,
                "bundle": r.get("bundleId") or "",
                "url": r.get("trackViewUrl") or "",
            }
        )
    return out


def fetch_reviews(
    app_id: int,
    *,
    country: str = "us",
    pages: int = 2,
) -> list[dict]:
    rows: list[dict] = []
    for page in range(1, max(1, pages) + 1):
        url = (
            f"https://itunes.apple.com/{country}/rss/customerreviews/"
            f"page={page}/id={app_id}/sortBy=mostRecent/json"
        )
        try:
            data = _get_json(url)
        except Exception:
            break
        entries = (data.get("feed") or {}).get("entry") or []
        if isinstance(entries, dict):
            entries = [entries]
        for e in entries:
            if "im:rating" not in e:
                continue  # skip non-review entries if any
            rating = int((e.get("im:rating") or {}).get("label") or 0)
            title = (e.get("title") or {}).get("label") or ""
            content = (e.get("content") or {}).get("label") or ""
            author = ((e.get("author") or {}).get("name") or {}).get("label") or ""
            rid = (e.get("id") or {}).get("label") or f"{app_id}-{len(rows)}"
            link = ""
            ln = e.get("link")
            if isinstance(ln, dict):
                link = (ln.get("attributes") or {}).get("href") or ""
            elif isinstance(ln, list) and ln:
                link = (ln[0].get("attributes") or {}).get("href") or ""
            rows.append(
                {
                    "id": str(rid),
                    "rating": rating,
                    "title": title,
                    "content": content,
                    "author": author,
                    "url": link
                    or f"https://apps.apple.com/{country}/app/id{app_id}?see-all=reviews",
                }
            )
        time.sleep(0.2)
    return rows


def _to_item(app_name: str, app_id: int, rev: dict) -> RawItem | None:
    rating = int(rev.get("rating") or 0)
    title = (rev.get("title") or "").strip()
    content = (rev.get("content") or "").strip()
    blob = f"{title}\n{content}"
    # Prefer critical reviews; keep 4★ if strong pain language
    phrases = match_phrases(blob)
    if rating >= 4 and not phrases:
        return None
    if rating >= 5 and len(content) < 80:
        return None
    if len(content) < 12 and len(title) < 8:
        return None
    sev_hint = 5 - min(5, max(1, rating))  # 1★ → 4, 3★ → 2
    return RawItem(
        id=f"ios-{app_id}-{rev.get('id')}",
        source="post",
        subreddit=f"appstore/{_slug(app_name)}",
        title=f"(App Store · {app_name} · {rating}★) {title or content[:60]}",
        body=content[:4000],
        score=rating,  # store rating in score field for ranking nuance
        num_comments=0,
        url=str(rev.get("url") or ""),
        created_utc=0.0,
        author=str(rev.get("author") or ""),
        matched_phrases=phrases or [f"{rating}-star review"],
    )


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "app"


def scan_appstore(
    apps: list[tuple[str, int]] | None = None,
    *,
    country: str = "us",
    pages: int = 2,
    max_per_app: int = 40,
) -> list[RawItem]:
    apps = apps or DEFAULT_APPS
    out: list[RawItem] = []
    seen: set[str] = set()
    for name, app_id in apps:
        revs = fetch_reviews(app_id, country=country, pages=pages)
        # sort: lowest rating first, then longer content
        revs.sort(key=lambda r: (int(r.get("rating") or 5), -len(r.get("content") or "")))
        n = 0
        for rev in revs:
            item = _to_item(name, app_id, rev)
            if not item or item.id in seen:
                continue
            seen.add(item.id)
            out.append(item)
            n += 1
            if n >= max_per_app:
                break
        time.sleep(0.25)
    return out
