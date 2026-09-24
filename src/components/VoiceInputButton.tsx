import { useSpeechToText } from '../lib/useSpeechToText'

interface VoiceInputButtonProps {
  onResult: (text: string) => void
  label?: string
}

export default function VoiceInputButton({ onResult, label = 'Speak instead of typing' }: VoiceInputButtonProps) {
  const { isSupported, isListening, error, start, stop } = useSpeechToText(onResult)

  if (!isSupported) return null

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={isListening ? stop : start}
        title={label}
        aria-label={label}
        className={[
          'flex h-[50px] w-[50px] items-center justify-center rounded-lg transition',
          isListening ? 'animate-pulse bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
        ].join(' ')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
          <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.07A7 7 0 0 0 19 11Z" />
        </svg>
      </button>
      {error && <p className="mt-1 w-24 text-center text-[11px] leading-tight text-rose-500">{error}</p>}
    </div>
  )
}
