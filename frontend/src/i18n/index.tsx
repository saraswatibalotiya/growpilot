import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export const UI_LANGUAGES = ['en', 'hi', 'mr'] as const
export type UiLanguage = (typeof UI_LANGUAGES)[number]

const STORAGE_KEY = 'growpilot.uiLanguage'

type Tree = { [key: string]: string | Tree }
export type Vars = Record<string, string | number>

/**
 * Every locale file is src/i18n/locales/<language>/<area>.json. The file name is the first part of a key:
 * The key reels.setup.title reads locales/en/reels.json -> { "setup": { "title": ... } }.
 */
const files = import.meta.glob<Tree>('./locales/*/*.json', { eager: true, import: 'default' })

const dictionaries: Record<UiLanguage, Tree> = { en: {}, hi: {}, mr: {} }
for (const [path, content] of Object.entries(files)) {
  const match = /\.\/locales\/(\w+)\/([\w-]+)\.json$/.exec(path)
  if (match && (UI_LANGUAGES as readonly string[]).includes(match[1]!)) dictionaries[match[1] as UiLanguage][match[2]!] = content
}

function lookup(tree: Tree, key: string): string | null {
  let node: string | Tree | undefined = tree
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return null
    node = node[part]
  }
  return typeof node === 'string' ? node : null
}

function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text
}

function readStored(): UiLanguage {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return (UI_LANGUAGES as readonly string[]).includes(value ?? '') ? (value as UiLanguage) : 'en'
  } catch {
    return 'en'
  }
}

let current: UiLanguage = readStored()

/** Translates outside React (services, helpers). Falls back to English, then to the key itself. */
export function translate(key: string, vars?: Vars): string {
  return fill(lookup(dictionaries[current], key) ?? lookup(dictionaries.en, key) ?? key, vars)
}

/** Translates into a specific language, for text that follows the content language rather than the app language (for example spoken photo tips). */
export function translateIn(language: UiLanguage, key: string, vars?: Vars): string {
  return fill(lookup(dictionaries[language], key) ?? lookup(dictionaries.en, key) ?? key, vars)
}

interface I18n {
  language: UiLanguage
  setLanguage: (language: UiLanguage) => void
  t: (key: string, vars?: Vars) => string
}

const Context = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(current)

  const setLanguage = useCallback((next: UiLanguage) => {
    current = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The choice then lasts only for this visit.
    }
    setLanguageState(next)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<I18n>(() => ({ language, setLanguage, t: (key, vars) => translate(key, vars) }), [language, setLanguage])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18n {
  const value = useContext(Context)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}

/** Shorthand for components that only need to translate. */
// eslint-disable-next-line react-refresh/only-export-components
export function useT(): I18n['t'] {
  return useI18n().t
}
