"""Google Play reviews via google-play-scraper (CLI / server side only)."""

from __future__ import annotations

from .models import RawItem
from .phrases import match_phrases

# package id → display name
DEFAULT_PACKAGES: list[tuple[str, str]] = [
    ("com.spotify.music", "Spotify"),
    ("com.instagram.android", "Instagram"),
    ("com.canva.editor", "Canva"),
    ("com.notion.id", "Notion"),
    ("com.asana.app", "Asana"),
    ("com.trello", "Trello"),
    ("com.openai.chatgpt", "ChatGPT"),
]


def scan_playstore(
    packages: list[tuple[str, str]] | None = None,
    *,
    count: int = 40,
    lang: str = "en",
    country: str = "us",
) -> list[RawItem]:
    try:
        from google_play_scraper import Sort, reviews
    except ImportError as e:
        raise RuntimeError(
            "google-play-scraper not installed. "
            "pip install google-play-scraper"
        ) from e

    packages = packages or DEFAULT_PACKAGES
    out: list[RawItem] = []
    seen: set[str] = set()
    for pkg, name in packages:
        try:
            rows, _ = reviews(
                pkg,
                lang=lang,
                country=country,
                sort=Sort.NEWEST,
                count=count,
            )
        except Exception:
            continue
        # prefer low scores
        rows = sorted(rows, key=lambda r: (int(r.get("score") or 5), -len(r.get("content") or "")))
        for r in rows:
            score = int(r.get("score") or 5)
            content = (r.get("content") or "").strip()
            title = (r.get("title") or content[:60] or "review").strip()
            blob = f"{title}\n{content}"
            phrases = match_phrases(blob)
            if score >= 4 and not phrases:
                continue
            if score >= 5 and len(content) < 80:
                continue
            if len(content) < 12:
                continue
            rid = str(r.get("reviewId") or f"{pkg}-{len(out)}")
            iid = f"play-{pkg}-{rid}"
            if iid in seen:
                continue
            seen.add(iid)
            out.append(
                RawItem(
                    id=iid,
                    source="post",
                    subreddit=f"playstore/{name.lower().replace(' ', '-')}",
                    title=f"(Play · {name} · {score}★) {title[:80]}",
                    body=content[:4000],
                    score=score,
                    num_comments=int(r.get("thumbsUpCount") or 0),
                    url=f"https://play.google.com/store/apps/details?id={pkg}&hl={lang}",
                    created_utc=0.0,
                    author=str(r.get("userName") or ""),
                    matched_phrases=phrases or [f"{score}-star review"],
                )
            )
    return out
