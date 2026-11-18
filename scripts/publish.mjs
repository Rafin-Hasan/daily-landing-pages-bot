import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from './generate.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '..', 'output')

const token = process.env.GH_PAT

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit' })
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

  const { repoName, topic, color } = generate()

  const userRes = await ghRequest('https://api.github.com/user')
  if (!userRes.ok) {
    throw new Error(`GH_PAT was rejected (HTTP ${userRes.status}); it has probably expired. Create a new token and update the GH_PAT secret.`)
  }
  const user = await userRes.json()
  const owner = user.login
  await warnIfTokenExpiringSoon(userRes.headers.get('github-authentication-token-expiration'))

  const existing = await ghRequest(`https://api.github.com/repos/${owner}/${repoName}`)
  if (existing.ok) {
    console.log(`Already published today: https://github.com/${owner}/${repoName}`)
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
  run('git add .', outDir)
  run(
    `git -c user.name="${owner}" -c user.email="${user.id}+${owner}@users.noreply.github.com" commit -m "Generate ${topic.name} landing page"`,
    outDir,
  )
  run(`git remote add origin https://x-access-token:${token}@github.com/${owner}/${repoName}.git`, outDir)
  run('git push -u origin main', outDir)

  console.log(`Published: https://github.com/${owner}/${repoName}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
