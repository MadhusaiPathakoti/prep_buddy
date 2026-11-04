import type { QStatus } from '../../lib/mocks/scoring'

// Palette markers modelled on the NTA/TCS test software: grey square (not visited), red tab (not
// answered), green tab (answered), purple circle (marked for review) and a purple circle with a green
// tick (answered & marked for review — still counted for evaluation).

const SHAPE: Record<QStatus, { bg: string; clip?: string; round?: boolean; text: string }> = {
  'not-visited': { bg: '#e5e7eb', text: '#1f2937' },
  'not-answered': { bg: '#ef4444', clip: 'polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)', text: '#fff' },
  answered: { bg: '#22a447', clip: 'polygon(50% 0, 100% 30%, 100% 100%, 0 100%, 0 30%)', text: '#fff' },
  marked: { bg: '#7c3aed', round: true, text: '#fff' },
  'answered-marked': { bg: '#7c3aed', round: true, text: '#fff' },
}

interface Props {
  status: QStatus
  label: string | number
  size?: number
  current?: boolean
  onClick?: () => void
  title?: string
}

export default function StatusBadge({ status, label, size = 36, current, onClick, title }: Props) {
  const s = SHAPE[status]
  const body = (
    <span
      className={`relative inline-flex items-center justify-center text-sm font-semibold ${s.round ? 'rounded-full' : status === 'not-visited' ? 'rounded-md' : ''}`}
      style={{ width: size, height: size, background: s.bg, color: s.text, clipPath: s.clip }}
    >
      {label}
    </span>
  )
  const tick = status === 'answered-marked' && (
    <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#22a447] text-[9px] leading-none text-white ring-1 ring-white">✓</span>
  )
  const wrapperClass = `relative inline-flex ${current ? 'rounded-md ring-2 ring-blue-500 ring-offset-1' : ''}`
  if (!onClick) {
    return (
      <span className={wrapperClass} title={title}>
        {body}
        {tick}
      </span>
    )
  }
  return (
    <button type="button" onClick={onClick} title={title} className={`${wrapperClass} cursor-pointer`}>
      {body}
      {tick}
    </button>
  )
}
