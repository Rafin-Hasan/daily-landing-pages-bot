import fs from 'node:fs'
import path from 'node:path'
import { writeSiteFiles } from './generate.mjs'

// Each improvement becomes one commit. apply() returns false when it is already
// applied (or the file doesn't have the expected shape), so it is safe to retry.

function read(dir, rel) {
  const file = path.join(dir, rel)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

function editFile(dir, rel, transform) {
  const before = read(dir, rel)
  if (before === null) return false
  const after = transform(before)
  if (!after || after === before) return false
  fs.writeFileSync(path.join(dir, rel), after)
  return true
}

function addFile(dir, rel, content) {
  if (read(dir, rel) !== null) return false
  fs.writeFileSync(path.join(dir, rel), content)
  return true
}

export function isRedesigned(dir) {
  return (read(dir, 'src/App.jsx') ?? '').includes('id="testimonials"')
}

export const improvements = [
  {
    id: 'redesign',
    priority: true,
    message: 'Redesign landing page with refreshed layout and typography',
    apply: (dir, { topic, color }) => {
      if (isRedesigned(dir)) return false
      writeSiteFiles(dir, topic, color)
      return true
    },
  },
  {
    id: 'gitignore',
    message: 'Add .gitignore',
    apply: (dir) => addFile(dir, '.gitignore', 'node_modules\ndist\n.DS_Store\n*.log\n'),
  },
  {
    id: 'readme-cleanup',
    message: 'Tidy README intro',
    apply: (dir) =>
      editFile(dir, 'README.md', (md) =>
        md
          .replace('Auto-generated single-page landing site', 'A single-page landing site')
          .replace(/\n*Generated automatically on [^\n]*\n?/, '\n'),
      ),
  },
  {
    id: 'readme-features',
    message: 'Document features in README',
    apply: (dir, { topic }) =>
      editFile(dir, 'README.md', (md) => {
        if (md.includes('## Features')) return null
        const list = topic.features.map((f) => `- **${f.title}** — ${f.desc}`).join('\n')
        const extras = [
          '- Fully responsive layout from mobile to desktop',
          '- Keyboard-accessible navigation, visible focus states and reduced-motion support',
          '- Email signup with inline confirmation',
        ].join('\n')
        return `${md.trimEnd()}\n\n## Features\n\n${list}\n${extras}\n`
      }),
  },
  {
    id: 'readme-build',
    message: 'Add production build instructions to README',
    apply: (dir) =>
      editFile(dir, 'README.md', (md) => {
        if (md.includes('## Build')) return null
        return `${md.trimEnd()}\n\n## Build for production\n\n\`\`\`bash\nnpm run build\nnpm run preview\n\`\`\`\n\nThe optimized site is written to \`dist/\`.\n`
      }),
  },
  {
    id: 'license',
    message: 'Add MIT license',
    apply: (dir, { owner }) =>
      addFile(
        dir,
        'LICENSE',
        `MIT License

Copyright (c) ${new Date().getUTCFullYear()} ${owner}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
      ),
  },
]
