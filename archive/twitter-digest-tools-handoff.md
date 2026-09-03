# Handoff: Comparison Test of Local X/Twitter Feed-Dump Tools

## Task for next agent

Build and run a **comparison test** of the candidate tools identified below, for the goal of:
dumping posts from the user's X/Twitter "following" feed locally to Markdown files, on a schedule,
in order to later build an LLM-queryable "second brain" wiki over them.

The user (george@dot-see.com) wants a locally-run tool (not a paid SaaS digest service) that can:
1. Pull the "following" timeline (not "For You"/algorithmic).
2. Persist posts as Markdown (or something trivially convertible to Markdown).
3. Be scriptable/schedulable for repeated dumps (e.g. daily digest use).
4. Ideally integrate with or be queryable by an LLM (for the "second brain" step).

No prior code was written in this session — this was pure research/recommendation. There is no
existing repo, spec, plan, or diff for this task; everything relevant is summarized below.

## Candidates identified (with sources)

### 1. birdclaw — https://github.com/steipete/birdclaw (docs: https://birdclaw.sh)
- Local-first Twitter/X workspace by Peter Steinberger. Stores data in local SQLite under `~/.birdclaw`.
- Install: `brew install steipete/tap/birdclaw` or `npm install -g birdclaw`.
- Live sync via [`xurl`](https://github.com/xdevplatform/xurl) (X's own OAuth CLI) or a private `bird` login — no paid API tier required.
- Key commands:
  - `birdclaw init --demo` — offline demo dataset, good first smoke test.
  - `birdclaw sync timeline --limit 100 --refresh --json` — pulls live home/following feed.
  - `birdclaw sync bookmarks --mode auto --limit 100 --refresh --json`
  - `birdclaw import archive <path-to-twitter-archive.zip>` — ingest official X data export.
  - `birdclaw search tweets "<query>" --limit N --json`
  - `birdclaw serve` — local web app at localhost:3000.
  - A **research** command produces a Markdown digest/brief (grouped quotes, extracted links, follow-up handles) — closest built-in match to "digest."
  - Deterministic **JSONL backup** that round-trips through Git (not raw `.md` per post, but structured and diffable).
  - Optional read-only **MCP server** for direct LLM/agent querying — relevant to the "second brain" goal.
- Open question to verify in testing: does `sync timeline` actually respect "following" (reverse-chronological) vs. algorithmic ranking? Needs a flag check (`--help`) since README quickstart didn't show a following-specific flag distinct from `feed -t following` in the other tool.
- Not yet verified: real-world auth friction with `xurl` (X OAuth app registration may be required), rate limits, whether JSONL backup is the easiest source to convert to per-post Markdown files vs. the SQLite DB directly.

### 2. twitter-cli — https://github.com/jackwener/twitter-cli (PyPI: `twitter-cli`)
- Terminal-first CLI, Python ≥3.10. Install: `uv tool install twitter-cli` or `pipx install twitter-cli`.
- No official API keys needed — auth via **browser cookie extraction** (Arc/Chrome/Edge/Firefox/Brave, auto-detected) or `TWITTER_AUTH_TOKEN` + `TWITTER_CT0` env vars.
- Key commands:
  - `twitter feed -t following --max 50 --output following.json` — explicit following-feed fetch, this is the one with a clear "following" flag.
  - `twitter feed --json` / `--yaml` for structured stdout (YAML is default for non-TTY).
  - `twitter article <id|url> --markdown --output article.md` — only command with **native Markdown export**, but only for X "Articles," not ordinary tweets.
  - `twitter bookmarks`, `twitter search`, `twitter user-posts <handle>`, `twitter list <id>`, etc.
  - Has anti-detection features (TLS fingerprint impersonation via `curl_cffi`, request jitter) — worth noting as a ToS-risk factor, not just a feature.
- Gap: ordinary tweets from `feed` only come out as JSON/YAML, not Markdown — a conversion script (one template + loop) would be needed to produce per-post `.md` files for the wiki step.
- Schema reference: repo has `SCHEMA.md` describing the structured output contract — check this before writing a converter.

### 3. Other tools surfaced but not deeply evaluated (lower priority, browser-extension-based, likely out of scope for local/automatable dumping of the full following feed)
- "X to Obsidian Saver," "Tweet to Obsidian," "tweet.md," "Tweet to Markdown" (Obsidian plugin), "BookmarksBrain" — these are mostly single-tweet or bookmark clippers (manual, one tweet at a time), not full-feed dumpers. Include only as a "why not" footnote in the comparison, not as real contenders.

## ToS / legal caveat (carry into the comparison report)

Both leading candidates authenticate via session cookies or personal X developer credentials rather than
a sanctioned bulk feed-export product. X's ToS technically restricts this kind of scraping/automation.
The comparison test should stay to personal-use volumes (the user's own following feed, low request rate)
and the final report should repeat this caveat rather than omit it.

## Suggested comparison test structure

1. Install both tools in isolated environments (e.g., separate venv/npm global or containers) to avoid conflicts.
2. Run `birdclaw init --demo` and `twitter feed --help` / a to-be-created demo/dry-run first to confirm CLI shapes without hitting the user's real account.
3. If proceeding with the real account (requires user's explicit go-ahead — do not do this unattended), compare:
   - Setup friction (auth flow complexity, dependencies).
   - Whether "following" (reverse-chron) vs. "for you" feed is actually distinguishable and correctly filtered.
   - Native output format vs. amount of glue code needed to reach one-Markdown-file-per-post.
   - Rate-limit/error behavior on repeated runs (for a "daily digest" cron use case).
   - Whether output is naturally chunkable/embeddable for an LLM wiki (frontmatter, stable IDs, dedup across runs).
4. Produce a scorecard (setup effort, Markdown fidelity, following-feed accuracy, automation-friendliness, LLM/agent integration) and a recommendation.

## Suggested skills for the next agent

- **firecrawl-developer-index** — for pulling more passages from these repos' READMEs/issues (e.g., confirming `birdclaw sync timeline` following-vs-algorithmic behavior, or checking open issues about rate limits) before writing the comparison.
- **firecrawl** — if further general web research is needed on X API/ToS constraints or on any newly discovered competing tool.
- **research** — appropriate if the user wants the final comparison captured as a proper Markdown research artifact in a repo rather than just a chat answer.
- **tdd** or **prototype** — if the next step becomes writing the actual conversion script (JSON/SQLite → per-post Markdown) rather than just evaluating the two CLIs as-is.

## Explicitly not done in this session

- No code, scripts, or repo files were created.
- No installation of either tool was attempted.
- No credentials, cookies, or tokens were touched or requested.
