import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoUrl, generate } from './generate.mjs'
import { improvements, isRedesigned } from './improvements.mjs'
import { colorForDate } from './site.mjs'
import { topics } from './topics.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '..', 'output')
const activityLog = path.resolve(__dirname, '..', 'activity.log')

const token = process.env.GH_PAT
const today = new Date().toISOString().slice(0, 10)

// Seeded by the date so the backup run on the same day makes the same plan.
function createRng(seed) {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = createRng(today)
const randInt = (min, max) => min + Math.floor(rng() * (max - min + 1))
const shuffle = (items) => {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function alreadyDoneToday() {
  if (!fs.existsSync(activityLog)) return false
  return fs.readFileSync(activityLog, 'utf8').split('\n').some((line) => line.startsWith(`${today} `))
}

function recordToday(summary) {
  fs.appendFileSync(activityLog, `${today} ${summary}\n`)
  console.log(`Recorded: ${today} ${summary}`)
}

function commitAll(dir, message, identity, paths = '-A') {
  run(`git add ${paths}`, dir)
  run(`git ${identity} commit -q -m "${message.replace(/"/g, '\\"')}"`, dir)
}

function applyImprovements(dir, ctx, count, identity) {
  const ordered = [...improvements.filter((imp) => imp.priority), ...shuffle(improvements.filter((imp) => !imp.priority))]
  let made = 0
  for (const imp of ordered) {
    if (made >= count) break
    if (!imp.apply(dir, ctx)) continue
    commitAll(dir, imp.message, identity)
    made++
  }
  return made
}

function repoContext(name) {
  const match = name.match(/^landing-(.+)-(\d{4}-\d{2}-\d{2})$/)
  const topic = match && topics.find((t) => t.slug === match[1])
  return topic ? { topic, color: colorForDate(new Date(`${match[2]}T00:00:00Z`)) } : null
}

function ghRequest(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  })
}

async function ghFetch(url, options = {}) {
  const res = await ghRequest(url, options)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub API ${res.status} on ${url}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

async function warnIfTokenExpiringSoon(expirationHeader) {
  if (!expirationHeader) return
  const expiresAt = new Date(expirationHeader.replace(' UTC', 'Z').replace(' ', 'T'))
  const daysLeft = Math.floor((expiresAt - Date.now()) / 86400000)
  if (daysLeft > 14) return

  console.log(`::warning::GH_PAT expires in ${daysLeft} day(s) (${expirationHeader}).`)
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo) return

  const title = 'GH_PAT is about to expire — renew it to keep daily pages publishing'
  const open = await ghFetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`)
  if (open.some((issue) => issue.title === title)) return

  await ghFetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      body: [
        `The \`GH_PAT\` token expires on **${expirationHeader}** (${daysLeft} day(s) left).`,
        '',
        '1. Create a new token with the `repo` scope: https://github.com/settings/tokens/new?scopes=repo&description=daily-landing-pages-bot',
        `2. Replace the secret: https://github.com/${repo}/settings/secrets/actions/GH_PAT`,
        '3. Close this issue.',
        '',
        'Until then the daily log commit still keeps your streak alive, but no new landing page repos will be created.',
      ].join('\n'),
    }),
  })
}

async function main() {
  if (!token) {
    console.error('Missing GH_PAT environment variable (a GitHub Personal Access Token with "repo" scope).')
    process.exit(1)
  }

  if (alreadyDoneToday()) {
    console.log(`Already done for ${today}; nothing to do.`)
    return
  }

  const userRes = await ghRequest('https://api.github.com/user')
  if (!userRes.ok) {
    throw new Error(`GH_PAT was rejected (HTTP ${userRes.status}); it has probably expired. Create a new token and update the GH_PAT secret.`)
  }
  const user = await userRes.json()
  const owner = user.login
  await warnIfTokenExpiringSoon(userRes.headers.get('github-authentication-token-expiration'))

  const identity = `-c user.name="${owner}" -c user.email="${user.id}+${owner}@users.noreply.github.com"`
  const ctx = { owner, identity }

  if (rng() < 0.4) {
    await publishNewRepo(ctx, randInt(0, 3))
    return
  }
  const updated = await improveExistingRepos(ctx, randInt(1, 5))
  if (!updated) await publishNewRepo(ctx, randInt(0, 3))
}

async function listLandingRepos() {
  const repos = []
  for (let page = 1; ; page++) {
    const batch = await ghFetch(`https://api.github.com/user/repos?affiliation=owner&per_page=100&page=${page}`)
    repos.push(...batch.filter((r) => r.name.startsWith('landing-') && !r.archived && !r.fork))
    if (batch.length < 100) return repos
  }
}

// Builds the site and publishes it to the repo's gh-pages branch. Returns false (with a
// warning) instead of throwing, so a missing Pages permission never blocks the daily commits.
async function deployToPages(dir, owner, repoName, identity) {
  try {
    run('npm install --no-audit --no-fund --loglevel=error', dir)
    run(`npx vite build --base=/${repoName}/`, dir)
    const dist = path.join(dir, 'dist')
    fs.writeFileSync(path.join(dist, '.nojekyll'), '')
    run('git init -q', dist)
    run('git checkout -q -b gh-pages', dist)
    commitAll(dist, 'Deploy site to GitHub Pages', identity)
    run(`git push -q -f https://x-access-token:${token}@github.com/${owner}/${repoName}.git gh-pages`, dist)

    const pages = await ghRequest(`https://api.github.com/repos/${owner}/${repoName}/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: { branch: 'gh-pages', path: '/' } }),
    })
    if (!pages.ok && pages.status !== 409) {
      throw new Error(`enabling GitHub Pages returned HTTP ${pages.status}: ${await pages.text()}`)
    }

    const url = demoUrl(owner, repoName)
    await ghFetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homepage: url }),
    })
    console.log(`Live demo: ${url}`)
    return true
  } catch (err) {
    console.log(`::warning::Could not publish the live demo for ${repoName}: ${err.message}`)
    return false
  }
}

function addDemoLink(dir, url, identity) {
  const file = path.join(dir, 'README.md')
  const md = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (!md || md.includes('github.io')) return 0
  fs.writeFileSync(file, md.replace(/^(# [^\n]*\n)/, `$1\n**Live demo:** ${url}\n`))
  commitAll(dir, 'Add live demo link to README', identity, 'README.md')
  run('git push -q origin HEAD', dir)
  return 1
}

async function improveExistingRepos({ owner, identity }, target) {
  const repos = await listLandingRepos()
  // Repos without a live demo haven't been redesigned/deployed yet, so they go first.
  const candidates = [...shuffle(repos.filter((r) => !r.homepage)), ...shuffle(repos.filter((r) => r.homepage))].slice(0, 12)
  const touched = []
  let made = 0

  for (const repo of candidates) {
    if (made >= target) break
    const context = repoContext(repo.name)
    if (!context) continue

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-'))
    run(`git clone -q https://x-access-token:${token}@github.com/${owner}/${repo.name}.git .`, dir)
    let count = applyImprovements(dir, { ...context, owner }, target - made, identity)
    if (count > 0) run('git push -q origin HEAD', dir)
    if (!repo.homepage && isRedesigned(dir) && (await deployToPages(dir, owner, repo.name, identity))) {
      count += 1 + addDemoLink(dir, demoUrl(owner, repo.name), identity)
    }
    if (count > 0) {
      console.log(`Improved https://github.com/${owner}/${repo.name} (${count} commits)`)
      touched.push(repo.name)
      made += count
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }

  if (made === 0) {
    console.log('No existing repo had improvements left; publishing a new one instead.')
    return false
  }
  recordToday(`updated ${touched.join(', ')} (${made} commits)`)
  return true
}

async function publishNewRepo({ owner, identity }, extraCommits) {
  const { repoName, topic, color } = generate({ owner })

  const existing = await ghRequest(`https://api.github.com/repos/${owner}/${repoName}`)
  if (existing.ok) {
    console.log(`Already published today: https://github.com/${owner}/${repoName}`)
    recordToday(`new ${repoName} (already existed)`)
    return
  }

  console.log(`Creating repo ${owner}/${repoName} (topic: ${topic.name}, theme: ${color})`)

  await ghFetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: repoName,
      description: `${topic.name} — a single-page landing site (React + Tailwind CSS)`,
      private: false,
      auto_init: false,
    }),
  })

  run('git init', outDir)
  run('git checkout -b main', outDir)
  commitAll(outDir, `Generate ${topic.name} landing page`, identity)
  const extra = applyImprovements(outDir, { topic, color, owner }, extraCommits, identity)
  run(`git remote add origin https://x-access-token:${token}@github.com/${owner}/${repoName}.git`, outDir)
  run('git push -q -u origin main', outDir)
  console.log(`Published: https://github.com/${owner}/${repoName}`)

  const deployed = (await deployToPages(outDir, owner, repoName, identity)) ? 1 : 0
  recordToday(`new ${repoName} (${1 + extra + deployed} commits)`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
