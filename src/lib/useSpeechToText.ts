import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorEventLike {
  error: string
}

interface MinimalSpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => MinimalSpeechRecognition

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const isSpeechToTextSupported = typeof window !== 'undefined' && getSpeechRecognitionCtor() !== null

/** Speech-to-text via the browser's built-in Web Speech API — transcribes on-device/in-browser, no server round-trip. */
export function useSpeechToText(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('Voice input is not supported in this browser — try Chrome.')
      return
    }
    setError('')
    const recognition = new Ctor()
    recognition.lang = 'en-IN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ')
        .trim()
      if (transcript) onResultRef.current(transcript)
    }
    recognition.onerror = (event) => {
      setError(event.error === 'no-speech' ? "Didn't catch that — try again." : 'Voice input failed — try again.')
      setIsListening(false)
    }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  return { isSupported: isSpeechToTextSupported, isListening, error, start, stop }
}
