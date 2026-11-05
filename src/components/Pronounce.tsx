import { useEffect, useRef, useState } from 'react'
import { isSpeechSupported, speak, usePhonetic } from '../lib/pronunciation'

interface SpeakerButtonProps {
  /** The text read aloud. */
  word: string
  /** `md` is the round blue button; `sm` is a subtle inline icon for synonym/antonym lists. */
  size?: 'md' | 'sm'
  className?: string
}

/** Speaker icon button: click to hear `word` pronounced. Renders nothing if the browser has no speech synthesis. */
export function SpeakerButton({ word, size = 'md', className = '' }: SpeakerButtonProps) {
  const [speaking, setSpeaking] = useState(false)
  const speakingRef = useRef(false)

  useEffect(() => {
    speakingRef.current = speaking
  }, [speaking])

  // Stop mid-word audio if the card/question unmounts — but only if this button is the one speaking.
  useEffect(
    () => () => {
      if (speakingRef.current && isSpeechSupported()) window.speechSynthesis.cancel()
    },
    [],
  )

  if (!isSpeechSupported()) return null

  const base =
    size === 'md'
      ? 'h-8 w-8 bg-blue-600 text-white hover:bg-blue-500'
      : 'h-5 w-5 bg-transparent text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setSpeaking(true)
        speak(word, () => setSpeaking(false))
      }}
      title={`Pronounce “${word}”`}
      aria-label={`Pronounce ${word}`}
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-95',
        base,
        speaking ? 'animate-pulse ring-2 ring-blue-300 dark:ring-blue-500/50' : '',
        className,
      ].join(' ')}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden="true">
        <path d="M3 10v4a1 1 0 0 0 1 1h3l4.3 3.6a1 1 0 0 0 1.7-.77V6.17a1 1 0 0 0-1.7-.77L7 9H4a1 1 0 0 0-1 1Z" />
        <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12Z" />
        <path d="M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54Z" />
      </svg>
    </button>
  )
}

/**
 * The word's IPA transcription (e.g. /əˈdrɔɪt/), looked up lazily once it scrolls into view.
 * Renders an empty, fixed-height line until/unless one is found, so cards don't jump around.
 * Phrases get nothing — the dictionary only has IPA for single words.
 */
export function Phonetic({ word, className = '' }: { word: string; className?: string }) {
  const { ref, ipa } = usePhonetic(word)
  return (
    <span ref={ref} className={`block min-h-[1.25rem] font-mono text-sm text-slate-500 dark:text-slate-400 ${className}`}>
      {ipa}
    </span>
  )
}
