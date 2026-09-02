from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table

from . import appstore, demo_data, hn, llm, playstore, reddit_arctic, report

console = Console(stderr=True)

DEFAULT_SUBS = [
    "SaaS",
    "Entrepreneur",
    "smallbusiness",
    "startups",
    "freelance",
]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="painpoint-ai",
        description="Scrape Reddit + HN + app reviews → LLM classify → startup ideas",
    )
    p.add_argument(
        "--subs",
        default=",".join(DEFAULT_SUBS),
        help="Comma-separated subreddits (default: SaaS-focused set)",
    )
    p.add_argument("--days", type=int, default=45, help="Lookback days")
    p.add_argument("--limit", type=int, default=60, help="Items per subreddit per type")
    p.add_argument(
        "--max-classify",
        type=int,
        default=30,
        help="Max candidates to send to LLM",
    )
    p.add_argument(
        "--source",
        choices=["arctic", "hn", "appstore", "playstore", "both", "all", "demo", "auto"],
        default=os.environ.get("PAINPOINT_SOURCE", "all"),
        help="arctic | hn | appstore | playstore | both(reddit+hn) | all | demo | auto",
    )
    p.add_argument(
        "--apps",
        default="",
        help="Comma-separated App Store names or numeric ids (default preset set)",
    )
    p.add_argument(
        "--keywords",
        default="",
        help="Comma-separated problem keywords (filters + HN queries)",
    )
    p.add_argument("--no-comments", action="store_true")
    p.add_argument(
        "--out",
        type=Path,
        default=Path("output"),
        help="Output directory",
    )
    p.add_argument(
        "--no-llm",
        action="store_true",
        help="Phrase filter only (no OpenAI call)",
    )
    p.add_argument("--json-stdout", action="store_true", help="Print full JSON to stdout")
    return p


def _resolve_apps(apps_arg: str) -> list[tuple[str, int]]:
    if not apps_arg.strip():
        return list(appstore.DEFAULT_APPS)
    out: list[tuple[str, int]] = []
    for part in apps_arg.split(","):
        part = part.strip()
        if not part:
            continue
        if part.isdigit():
            out.append((f"App {part}", int(part)))
            continue
        hits = appstore.search_app(part, limit=1)
        if hits:
            out.append((hits[0]["name"], int(hits[0]["id"])))
        else:
            console.print(f"[yellow]No App Store hit for {part}[/]")
    return out or list(appstore.DEFAULT_APPS)


def collect_items(args: argparse.Namespace) -> tuple[list, str]:
    subs = [s.strip() for s in args.subs.split(",") if s.strip()]
    source = args.source
    if source == "demo":
        return demo_data.demo_items(), "demo fixtures"

    items: list = []
    notes: list[str] = []

    want_arctic = source in ("arctic", "both", "all", "auto")
    want_hn = source in ("hn", "both", "all", "auto")
    want_ios = source in ("appstore", "all", "auto")
    want_play = source in ("playstore", "all")

    if want_arctic:
        try:
            console.print(f"[cyan]Fetching Reddit via Arctic Shift[/] subs={subs} days={args.days}")
            arctic_items = reddit_arctic.scan_subreddits(
                subs,
                limit_per=args.limit,
                days=args.days,
                include_comments=not args.no_comments,
                phrase_filter=True,
            )
            items.extend(arctic_items)
            notes.append(f"arctic={len(arctic_items)}")
        except Exception as e:
            if source == "arctic":
                raise
            console.print(f"[yellow]Arctic failed ({e})[/]")
            notes.append("arctic=fail")

    if want_hn:
        try:
            console.print(f"[cyan]Fetching Hacker News (Algolia)[/] days={args.days}")
            hn_items = hn.scan_hn(days=args.days, limit_per_query=max(8, args.limit // 4))
            items.extend(hn_items)
            notes.append(f"hn={len(hn_items)}")
        except Exception as e:
            if source == "hn":
                raise
            console.print(f"[yellow]HN failed ({e})[/]")
            notes.append("hn=fail")

    if want_ios:
        try:
            apps = _resolve_apps(args.apps)
            console.print(
                f"[cyan]Fetching App Store reviews[/] apps={[a[0] for a in apps[:6]]}…"
            )
            ios_items = appstore.scan_appstore(apps, pages=2, max_per_app=40)
            items.extend(ios_items)
            notes.append(f"appstore={len(ios_items)}")
        except Exception as e:
            if source == "appstore":
                raise
            console.print(f"[yellow]App Store failed ({e})[/]")
            notes.append("appstore=fail")

    if want_play:
        try:
            console.print("[cyan]Fetching Play Store reviews[/]")
            play_items = playstore.scan_playstore(count=40)
            items.extend(play_items)
            notes.append(f"playstore={len(play_items)}")
        except Exception as e:
            if source == "playstore":
                raise
            console.print(f"[yellow]Play Store failed ({e})[/]")
            notes.append("playstore=fail")

    seen: set[str] = set()
    uniq = []
    for it in items:
        if it.id in seen:
            continue
        seen.add(it.id)
        uniq.append(it)

    if not uniq and source in ("auto", "both", "all"):
        console.print("[yellow]No live hits — falling back to demo[/]")
        return demo_data.demo_items(), "demo fixtures (fallback)"

    note = f"sources: {', '.join(notes)} | days={args.days}"
    if want_arctic:
        note += f" | subs={','.join(subs)}"
    return uniq, note


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = report.stamp()

    items, note = collect_items(args)
    console.print(f"[green]Phrase-filtered candidates:[/] {len(items)}")

    # always dump raw candidates
    report.write_json(
        out_dir / f"candidates_{stamp}.json",
        [i.to_dict() for i in items],
    )

    pains = []
    ideas = []
    if args.no_llm:
        console.print("[yellow]Skipping LLM (--no-llm)[/]")
    else:
        client = llm.get_client()
        console.print(
            f"[cyan]Classifying up to {args.max_classify} with model={llm.model_name()}[/]"
        )
        pains = llm.classify_batch(client, items, max_items=args.max_classify)
        true_n = sum(1 for p in pains if p.is_pain)
        console.print(f"[green]Confirmed pains:[/] {true_n}/{len(pains)}")
        if true_n:
            console.print("[cyan]Clustering into startup ideas…[/]")
            ideas = llm.cluster_ideas(client, pains)
            console.print(f"[green]Ideas:[/] {len(ideas)}")

    report.write_pains_csv(out_dir / f"pains_{stamp}.csv", pains)
    report.write_json(
        out_dir / f"pains_{stamp}.json",
        [p.to_dict() for p in pains],
    )
    report.write_json(
        out_dir / f"ideas_{stamp}.json",
        [i.to_dict() for i in ideas],
    )
    md_path = out_dir / f"report_{stamp}.md"
    report.write_markdown(
        md_path, query_note=note, items=items, pains=pains, ideas=ideas
    )
    digest_path = out_dir / f"digest_{stamp}.txt"
    digest = report.write_telegram_digest(digest_path, ideas, pains)

    # console table of ideas
    if ideas:
        table = Table(title="Startup ideas")
        table.add_column("#", style="dim")
        table.add_column("Score")
        table.add_column("Title")
        table.add_column("Who")
        for i, idea in enumerate(ideas, 1):
            table.add_row(
                str(i),
                f"{idea.score:.0f}",
                idea.title[:50],
                idea.who[:30],
            )
        console.print(table)

    console.print(f"[bold]Report:[/] {md_path.resolve()}")
    console.print(f"[bold]Telegram digest:[/] {digest_path.resolve()}")
    console.print(
        "Send with: hermes send --to telegram \"$(cat "
        + str(digest_path)
        + ")\""
    )

    payload = {
        "note": note,
        "candidates": len(items),
        "pains": [p.to_dict() for p in pains if p.is_pain],
        "ideas": [i.to_dict() for i in ideas],
        "paths": {
            "report": str(md_path.resolve()),
            "digest": str(digest_path.resolve()),
        },
    }
    if args.json_stdout:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        # short human summary on stdout for piping
        print(digest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
