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

async function ghFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub API ${res.status} on ${url}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

async function main() {
  if (!token) {
    console.error('Missing GH_PAT environment variable (a GitHub Personal Access Token with "repo" scope).')
    process.exit(1)
  }

  const { repoName, topic, color } = generate()

  const user = await ghFetch('https://api.github.com/user')
  const owner = user.login

  console.log(`Creating repo ${owner}/${repoName} (topic: ${topic.name}, theme: ${color})`)

  await ghFetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: repoName,
      description: `Auto-generated single-page landing site — ${topic.name} (React + Tailwind CSS)`,
      private: false,
      auto_init: false,
    }),
  })

  run('git init', outDir)
  run('git checkout -b main', outDir)
  run('git add .', outDir)
  run(
    `git -c user.name="daily-landing-pages-bot" -c user.email="actions@users.noreply.github.com" commit -m "Generate ${topic.name} landing page"`,
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
