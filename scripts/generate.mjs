import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { topics } from './topics.mjs'
import { themes } from './themes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const templateDir = path.join(rootDir, 'template')
const outDir = path.join(rootDir, 'output')

function dayIndex(date = new Date()) {
  const epoch = Date.UTC(2024, 0, 1)
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.floor((today - epoch) / 86400000)
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function renderApp(topic, color) {
  const featureCards = topic.features
    .map(
      (f) => `
        <div className="p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-lg mb-2">${f.title}</h3>
          <p className="text-slate-600">${f.desc}</p>
        </div>`,
    )
    .join('\n')

  return `export default function App() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <span className="font-bold text-xl">${topic.brand}</span>
        <a href="#cta" className="bg-${color}-600 text-white px-4 py-2 rounded-lg hover:bg-${color}-700 transition">
          ${topic.ctaShort}
        </a>
      </nav>

      <header className="max-w-4xl mx-auto text-center px-6 py-24">
        <p className="uppercase tracking-wide text-${color}-600 font-semibold mb-4">${topic.eyebrow}</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold mb-6">${topic.headline}</h1>
        <p className="text-lg text-slate-600 mb-10">${topic.subheadline}</p>
        <a href="#cta" className="inline-block bg-${color}-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-${color}-700 transition">
          ${topic.ctaPrimary}
        </a>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-16 grid sm:grid-cols-3 gap-8">${featureCards}
      </section>

      <section id="cta" className="bg-${color}-600 text-white text-center px-6 py-20">
        <h2 className="text-3xl font-bold mb-4">${topic.ctaHeadline}</h2>
        <p className="mb-8 text-${color}-100">${topic.ctaSub}</p>
        <a href="#" className="inline-block bg-white text-${color}-700 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-slate-100 transition">
          ${topic.ctaPrimary}
        </a>
      </section>

      <footer className="text-center py-8 text-slate-400 text-sm">
        © ${new Date().getFullYear()} ${topic.brand}. All rights reserved.
      </footer>
    </div>
  )
}
`
}

export function generate() {
  const idx = dayIndex()
  const topic = topics[idx % topics.length]
  const color = themes[idx % themes.length]
  const dateStr = new Date().toISOString().slice(0, 10)

  fs.rmSync(outDir, { recursive: true, force: true })
  copyDir(templateDir, outDir)

  const indexHtmlPath = path.join(outDir, 'index.html')
  fs.writeFileSync(indexHtmlPath, fs.readFileSync(indexHtmlPath, 'utf8').replace('{{TITLE}}', topic.brand))

  fs.writeFileSync(path.join(outDir, 'src', 'App.jsx'), renderApp(topic, color))

  const repoName = `landing-${topic.slug}-${dateStr}`
  const readme = `# ${topic.brand}

A single-page landing site (React + Vite + Tailwind CSS) for **${topic.name}**.

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
