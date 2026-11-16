import { translateIn } from '../i18n'

export type TipLanguage = 'en' | 'hi' | 'mr'

export const TIP_LANGUAGES: Array<{ code: TipLanguage; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
]

const PROBLEMS = new Set([
  'very_blurry', 'slightly_blurry', 'too_dark', 'too_bright', 'low_contrast', 'colour_cast', 'busy_background',
  'too_much_empty_space', 'product_cut_off', 'product_at_edge', 'product_not_separated', 'low_resolution', 'awkward_aspect_ratio',
])

const VOICE_LANG: Record<TipLanguage, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' }

/** Shown before every upload. */
export function photoTips(language: TipLanguage): string[] {
  return Array.from({ length: 8 }, (_, i) => translateIn(language, `tips.pre.tip${i + 1}`))
}

export function photoTipsScript(language: TipLanguage): string {
  return photoTips(language).join(' ')
}

/** At most three tips. */
export function shotTips(problems: string[], language: TipLanguage): string[] {
  return problems.filter((p) => PROBLEMS.has(p)).slice(0, 3).map((p) => translateIn(language, `tips.problem.${p}`))
}

export function tipsScript(problems: string[], score: number, language: TipLanguage): string {
  const tips = shotTips(problems, language)
  return [translateIn(language, 'tips.score', { score }), ...(tips.length > 0 ? tips : [translateIn(language, 'tips.allGood')])].join(' ')
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Reads the text aloud with the device's voice. Returns false if the browser cannot speak. */
export function speak(text: string, language: TipLanguage, onEnd: () => void): boolean {
  if (!canSpeak()) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = VOICE_LANG[language]
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(language))
  if (voice) utterance.voice = voice
  utterance.onend = onEnd
  utterance.onerror = onEnd
  synth.speak(utterance)
  return true
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel()
}
