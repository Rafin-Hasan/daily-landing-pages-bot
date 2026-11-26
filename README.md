# daily-landing-pages-bot

Every day, this repo's GitHub Actions workflow does one of two things,
chosen from the date:

- **~40% of days:** publishes a new single-page React + Tailwind CSS landing
  page for a fictional business to a **brand-new repo** (e.g.
  `landing-online-fitness-coaching-2026-08-26`).
- **Other days:** works on existing `landing-*` repos: redesigns ones still on
  the old layout, then adds smaller improvements (README sections, license,
  `.gitignore`).

The number of commits varies from day to day. Every redesigned or new site is
built and published to GitHub Pages, and the repo's website link points at the
live demo. Each day's result is logged in `activity.log`.

There's no live AI call involved — content comes from a rotating pool of 30
topics in [`scripts/topics.mjs`](scripts/topics.mjs) and 12 color themes in
[`scripts/themes.mjs`](scripts/themes.mjs), picked deterministically from the
date, so it runs unattended in CI. Topics won't repeat for ~30 days; color
pairings vary on a different cycle so the same topic doesn't always get the
same theme.

## How it works

1. `scripts/site.mjs` renders the page design (`index.html`, `src/App.jsx`,
   `src/index.css`, `tailwind.config.js`) for a topic and color.
2. `scripts/generate.mjs` copies [`template/`](template/) (Vite + React
   config) into `output/` and writes the rendered site into it.
3. `scripts/improvements.mjs` lists the changes that can be made to an
   existing repo, one commit each, starting with the redesign.
4. `scripts/publish.mjs` picks the day's plan, creates or updates repos, and
   deploys redesigned sites to each repo's `gh-pages` branch.
5. `.github/workflows/daily.yml` runs it at 13:00 UTC with a 20:00 UTC backup
   (repeat runs on the same day do nothing), then commits `activity.log`.

## One-time setup

1. **Create this repo on GitHub** and push this code to it (see below —
   ask me to do this once you're ready, or do it yourself with `gh repo
   create` / the GitHub web UI).

2. **Create a Personal Access Token** the workflow will use to create new
   repos and push to them:
   - Go to https://github.com/settings/tokens
   - Classic token → scope: `repo` (this covers creating and pushing to
     both public and private repos)
   - Copy the token value — GitHub only shows it once.

3. **Add it as a repo secret**, not anywhere in code:
   - In this repo: Settings → Secrets and variables → Actions → New
     repository secret
   - Name: `GH_PAT`
   - Value: the token from step 2

4. That's it. The workflow runs daily at 13:00 UTC. To change the time,
   edit the `cron` line in `.github/workflows/daily.yml` (cron is always
   UTC, so convert from your local time).

## Running it manually

- **From GitHub**: Actions tab → "Daily Landing Page" → "Run workflow".
- **From your machine** (needs Node 18+ and the token as an env var):

  ```bash
  GH_PAT=ghp_xxx node scripts/publish.mjs
  ```

- **To preview a day's page without publishing**, just run the generator
  and open it locally:

  ```bash
  node scripts/generate.mjs
  cd output
  npm install
  npm run dev
  ```

## Customizing

- Add more topics any time in `scripts/topics.mjs` — no other file needs to
  change.
- Add/remove color themes in `scripts/themes.mjs` (must be valid Tailwind
  color names with a full 50–900 scale, e.g. `blue`, `emerald`, `rose`).
- Edit the JSX layout in `renderApp()` inside `scripts/site.mjs` to change
  the page structure itself.
- New repos are created as **public**; change `private: false` to `true` in
  `scripts/publish.mjs` if you'd rather they be private.
