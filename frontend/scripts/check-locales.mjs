// Checks the locale files: every language has the same files and keys, placeholders match, and every t('...') key used in src exists.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../src/i18n/locales/', import.meta.url).pathname
const languages = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory())
const problems = []

const flatten = (node, prefix = '') =>
  Object.entries(node).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v]] : flatten(v, `${prefix}${k}.`)))

const data = {}
for (const lang of languages) {
  data[lang] = new Map()
  for (const file of readdirSync(join(root, lang)).filter((f) => f.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '')
    try {
      for (const [k, v] of flatten(JSON.parse(readFileSync(join(root, lang, file), 'utf8')))) data[lang].set(`${ns}.${k}`, v)
    } catch (e) {
      problems.push(`${lang}/${file}: invalid JSON (${e.message})`)
    }
  }
}

const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
for (const key of data.en.keys()) {
  for (const lang of languages.filter((l) => l !== 'en')) {
    if (!data[lang].has(key)) problems.push(`${lang}: missing ${key}`)
    else if (vars(data[lang].get(key)) !== vars(data.en.get(key))) problems.push(`${lang}: placeholders differ in ${key}`)
    else if (!data[lang].get(key).trim()) problems.push(`${lang}: empty ${key}`)
  }
}
for (const lang of languages.filter((l) => l !== 'en')) for (const key of data[lang].keys()) if (!data.en.has(key)) problems.push(`${lang}: extra ${key} (not in en)`)

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? (f === 'locales' ? [] : walk(join(dir, f))) : /\.(tsx?|jsx?)$/.test(f) ? [join(dir, f)] : []))
const src = new URL('../src/', import.meta.url).pathname
for (const file of walk(src)) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/\b(?:t|translate|translateIn)\(\s*(?:[a-z]+,\s*)?['"`]([\w.-]+)['"`]/g)) {
    if (!data.en.has(m[1]) && ![...data.en.keys()].some((k) => k.startsWith(`${m[1]}.`))) problems.push(`${file.replace(src, 'src/')}: unknown key ${m[1]}`)
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} locale problem(s)`)
  process.exit(1)
}
console.log(`Locales OK: ${languages.join(', ')} · ${data.en.size} keys`)
