import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { topics } from './topics.mjs'
import { colorForDate, dayIndex, renderSite } from './site.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const templateDir = path.join(rootDir, 'template')
const outDir = path.join(rootDir, 'output')

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

export function writeSiteFiles(dir, topic, color) {
  for (const [rel, content] of Object.entries(renderSite(topic, color))) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content)
  }
}

export function demoUrl(owner, repoName) {
  return `https://${owner.toLowerCase()}.github.io/${repoName}/`
}

export function generate({ owner } = {}) {
  const topic = topics[dayIndex() % topics.length]
  const color = colorForDate()
  const dateStr = new Date().toISOString().slice(0, 10)
  const repoName = `landing-${topic.slug}-${dateStr}`

  fs.rmSync(outDir, { recursive: true, force: true })
  copyDir(templateDir, outDir)
  writeSiteFiles(outDir, topic, color)

  const demoLine = owner ? `\n**Live demo:** ${demoUrl(owner, repoName)}\n` : ''
  const readme = `# ${topic.brand}

${topic.subheadline}
${demoLine}
A responsive, accessible single-page marketing site for a fictional ${topic.name.toLowerCase()} business, built with React, Vite and Tailwind CSS.

## Run locally

\`\`\`bash
npm install
npm run dev
\`\`\`
`
  fs.writeFileSync(path.join(outDir, 'README.md'), readme)

  return { repoName, topic, color, dateStr }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { repoName, topic, color } = generate()
  console.log(`Generated ${repoName} (topic: ${topic.name}, theme: ${color}) -> ${outDir}`)
}
