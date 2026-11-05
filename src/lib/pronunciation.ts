import { useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------ */
/* Speech (text-to-speech)                                             */
/* ------------------------------------------------------------------ */

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

/** Prefers an Indian-English voice (matches the exam audience), then any other English voice. */
function pickEnglishVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    null
  )
}

/** Reads `text` aloud, cancelling anything already being spoken. Safe to call when speech isn't supported. */
export function speak(text: string, onEnd?: () => void): void {
  const clean = text.trim()
  if (!clean || !isSpeechSupported()) {
    onEnd?.()
    return
  }
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  const voice = pickEnglishVoice()
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  } else {
    utterance.lang = 'en-US'
  }
  utterance.rate = 0.85
  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onEnd?.()
  synth.speak(utterance)
}

/* ------------------------------------------------------------------ */
/* Phonetics (IPA)                                                     */
/* ------------------------------------------------------------------ */

const CACHE_PREFIX = 'prepbuddy:phonetic:'
/** Cached miss marker, so words with no dictionary entry aren't re-requested on every visit. */
const NOT_FOUND = ''

const memoryCache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

function normalise(word: string): string {
  return word.trim().toLowerCase()
}

/** Only single words are looked up — the dictionary has no IPA for free-form phrases. */
export function isLookupable(word: string): boolean {
  return /^[a-z][a-z'’-]*$/i.test(word.trim())
}

function readStored(key: string): string | undefined {
  try {
    const v = localStorage.getItem(CACHE_PREFIX + key)
    return v === null ? undefined : v
  } catch {
    return undefined
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, value)
  } catch {
    // Storage full or blocked — the in-memory cache still works for this session.
  }
}

// Keep the number of simultaneous dictionary requests small: a library page can have hundreds of cards.
const MAX_CONCURRENT = 4
let active = 0
const waiting: (() => void)[] = []

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return Promise.resolve()
  }
  return new Promise((resolve) => waiting.push(() => { active++; resolve() }))
}

function release() {
  active--
  waiting.shift()?.()
}

interface DictionaryApiEntry {
  phonetic?: string
  phonetics?: { text?: string }[]
}

async function fetchPhonetic(key: string): Promise<string> {
  await acquire()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`, { signal: controller.signal })
      if (res.status === 404) return NOT_FOUND // definitive miss — worth caching
      if (!res.ok) throw new Error(`HTTP ${res.status}`) // transient — don't cache
      const data = (await res.json()) as DictionaryApiEntry[]
      for (const entry of data) {
        const text = entry.phonetic || entry.phonetics?.find((p) => p.text)?.text
        if (text) return text.trim()
      }
      return NOT_FOUND
    } finally {
      clearTimeout(timeout)
    }
  } finally {
    release()
  }
}

/** Resolves a word's IPA transcription such as "/əˈdrɔɪt/", or '' when none is available. Never rejects. */
export function getPhonetic(word: string): Promise<string> {
  const key = normalise(word)
  if (!isLookupable(key)) return Promise.resolve('')

  const cached = memoryCache.get(key) ?? readStored(key)
  if (cached !== undefined) {
    memoryCache.set(key, cached)
    return Promise.resolve(cached)
  }

  let pending = inflight.get(key)
  if (!pending) {
    pending = fetchPhonetic(key)
      .then((value) => {
        memoryCache.set(key, value)
        writeStored(key, value)
        return value
      })
      .catch(() => '') // network/transient failure: show nothing, retry on next visit
      .finally(() => inflight.delete(key))
    inflight.set(key, pending)
  }
  return pending
}

/**
 * Tidies a dictionary transcription for display: drops the syllable dots and writes the English
 * "r" the usual way (the API uses the strict-IPA ɹ), then wraps a bare one in slashes —
 * e.g. "/əˈdɹɔɪt/" -> "/əˈdrɔɪt/".
 */
function formatIpa(ipa: string): string {
  const tidy = ipa.replace(/\./g, '').replace(/ɹ/g, 'r')
  return /^[/[].*[/\]]$/.test(tidy) ? tidy : `/${tidy}/`
}

/**
 * The IPA transcription for `word`, looked up lazily — only once the element returned via `ref`
 * scrolls into view, so long libraries don't fire a request per card up front.
 */
export function usePhonetic(word: string, enabled = true) {
  const ref = useRef<HTMLElement | null>(null)
  // Without IntersectionObserver (very old browsers) just look up straight away.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  const [result, setResult] = useState<{ word: string; ipa: string } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled])

  useEffect(() => {
    if (!enabled || !visible) return
    let cancelled = false
    getPhonetic(word).then((ipa) => {
      if (!cancelled) setResult({ word, ipa })
    })
    return () => {
      cancelled = true
    }
  }, [word, enabled, visible])

  const ipa = result && result.word === word && result.ipa ? formatIpa(result.ipa) : ''
  return { ref, ipa }
}
