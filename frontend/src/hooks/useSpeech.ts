import { useCallback, useEffect, useRef, useState } from 'react'
import { translate } from '../i18n'
import type { Language } from '../lib/types'

// The browser speech API is not in lib.dom for every browser, so the small part we use is typed here.
interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => Recognition

const LOCALE: Record<Language, string> = { hi: 'hi-IN', mr: 'mr-IN', en: 'en-IN' }

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'blocked',
  'service-not-allowed': 'blocked',
  'no-speech': 'noSpeech',
  'audio-capture': 'noMic',
  network: 'network',
  'language-not-supported': 'language',
}

export function useSpeechRecognition(language: Language) {
  const supported = recognitionCtor() !== null
  const [listening, setListening] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const finalText = useRef('')

  const stop = useCallback(() => recognition.current?.stop(), [])

  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    setError(null)
    const r = new Ctor()
    r.lang = LOCALE[language]
    r.continuous = true
    r.interimResults = true
    finalText.current = ''
    setText('')
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const result = e.results[i]
        if (result.isFinal) finalText.current += `${result[0].transcript} `
        else interim += result[0].transcript
      }
      setText((finalText.current + interim).trim())
    }
    r.onerror = (e) => {
      setError(translate(`errors.speech.${ERRORS[e.error] ?? 'stopped'}`))
      setListening(false)
    }
    r.onend = () => setListening(false)
    recognition.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      setError(translate('errors.speech.startFailed'))
    }
  }, [language])

  useEffect(() => () => recognition.current?.abort(), [])

  const reset = useCallback(() => {
    finalText.current = ''
    setText('')
    setError(null)
  }, [])

  return { supported, listening, text, setText, error, start, stop, reset }
}

export function useSpeechSynthesis() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)

  const speak = useCallback(
    (text: string, language: Language) => {
      if (!supported || !text) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = LOCALE[language]
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(language))
      if (voice) u.voice = voice
      u.onstart = () => setSpeaking(true)
      u.onend = () => setSpeaking(false)
      u.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(u)
    },
    [supported],
  )

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  useEffect(() => () => cancel(), [cancel])

  return { supported, speaking, speak, cancel }
}
