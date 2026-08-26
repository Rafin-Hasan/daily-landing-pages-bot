# daily-landing-pages-bot

Every day, this repo's GitHub Actions workflow generates a new single-page
React + Tailwind CSS landing page for a different fictional business, and
publishes it to a **brand-new GitHub repo** under your account (e.g.
`landing-online-fitness-coaching-2026-08-26`).

There's no live AI call involved — content comes from a rotating pool of 30
topics in [`scripts/topics.mjs`](scripts/topics.mjs) and 12 color themes in
[`scripts/themes.mjs`](scripts/themes.mjs), picked deterministically from the
date, so it runs unattended in CI. Topics won't repeat for ~30 days; color
pairings vary on a different cycle so the same topic doesn't always get the
same theme.

## How it works

1. `scripts/generate.mjs` picks today's topic + color, copies
   [`template/`](template/) (a minimal Vite + React + Tailwind app) into
   `output/`, and renders `output/src/App.jsx` with that topic's copy.
2. `scripts/publish.mjs` calls the GitHub API to create a new public repo
   named `landing-<topic-slug>-<date>`, then `git init` + `git push`s the
   generated site into it.
3. `.github/workflows/daily.yml` runs step 2 on a daily cron schedule (and
   can also be triggered manually).

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
- Edit the JSX layout in `renderApp()` inside `scripts/generate.mjs` to
  change the page structure itself.
- New repos are created as **public**; change `private: false` to `true` in
  `scripts/publish.mjs` if you'd rather they be private.
