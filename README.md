# Painpoint AI

Reddit pain signals → phrase filter → optional LLM classify → **SaaS / startup idea briefs**.

## Live UI

Static frontend with **multi-select subreddits** (presets + custom):

- After GitHub Pages deploy: `https://algorathem.github.io/painpoint-ai/`
- Or open `web/index.html` locally (any static server)

The browser talks to **Arctic Shift** directly (CORS open). Optional OpenAI-compatible API key is stored in **localStorage only** (BYOK).

## What is Arctic Shift?

[Arctic Shift](https://arctic-shift.photon-reddit.com/) is a community archive of **public Reddit data** with a free search HTTP API (Photon / Arctic Shift project). This app uses it because:

- Live `reddit.com/*.json` often returns **403** to scripts/browsers
- No Reddit app credentials required for basic research scans
- Good enough for idea discovery (not a full firehose)

It is **not** the official Reddit API. Be polite with rate limits; don’t bulk-redistribute archives.

## Is the official Reddit API free?

**Yes, with limits.**

| Path | Cost | Notes |
|------|------|--------|
| OAuth app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) | Free tier | Client id/secret; rate-limited; follow [Data API Terms](https://redditinc.com/policies/data-api-terms) |
| High-volume / commercial | May require paid access | Reddit tightened free commercial scraping |
| Unauthenticated JSON scrape | Unreliable / discouraged | Often blocked |

Prefer **OAuth** or **Arctic Shift** over HTML scraping.

## Why subreddit selection matters

Pain density varies wildly by community. The UI (and CLI `--subs`) lets you pick e.g. `SaaS,startups` vs `climate,ESG` so scans stay on-domain.

## CLI (local, Hermes-friendly)

```bash
cd painpoint-ai
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# uses ~/.hermes/.env OPENAI_* if present
python -m painpoint_ai --source demo
python -m painpoint_ai --source auto --subs SaaS,Entrepreneur,startups --days 30 --max-classify 25
```

Hermes cron runner: `~/.hermes/scripts/painpoint_ai_digest.py` → Telegram.

## Deploy

### GitHub Pages (default in this repo)

Push to `main` → workflow `.github/workflows/pages.yml` publishes `web/`.

```bash
gh repo sync  # or git push
# enable Pages: Settings → Pages → GitHub Actions (first time may need UI click)
```

### Netlify

```bash
# CLI (when node works): netlify deploy --dir=web --prod
# Or: Netlify UI → import repo → publish directory = web (see netlify.toml)
```

### Cloudflare Pages

- Connect repo
- Build command: empty
- Output directory: `web`

## Privacy / compliance

- Read-only research; no Reddit posting/voting
- BYOK LLM keys never touch our backend (there is no app backend)
- Respect Arctic Shift + Reddit rate limits and terms

## License

MIT
