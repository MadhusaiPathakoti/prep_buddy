import type { Stimulus, StimulusPart } from './types'

const num = (n: number): string => String(Number(n.toFixed(2)))

/** Re-expresses a chart as a table (series as rows, categories as columns); tables and text pass through unchanged. */
export function partToTable(part: StimulusPart): StimulusPart {
  if (part.kind === 'bar' || part.kind === 'line') {
    return {
      kind: 'table',
      heading: `${part.heading ?? (part.kind === 'bar' ? 'Bar graph' : 'Line graph')} — data in table form${part.unit ? ` (${part.unit})` : ''}`,
      columns: ['', ...part.categories],
      rows: part.series.map((s) => [s.name, ...s.values.map(num)]),
    }
  }
  if (part.kind === 'pie') {
    const total = part.slices.reduce((n, s) => n + s.value, 0)
    const isAngle = part.unit === '°'
    return {
      kind: 'table',
      heading: `${part.heading ?? 'Pie chart'} — data in table form`,
      columns: ['Category', isAngle ? 'Angle (°)' : `Value${part.unit ? ` (${part.unit})` : ''}`, isAngle ? 'Share (%)' : 'Angle (°)'],
      rows: part.slices.map((s) => [s.label, num(s.value), total > 0 ? num(isAngle ? (s.value / total) * 100 : (s.value / total) * 360) : '']),
    }
  }
  return part
}

/**
 * What the result analysis shows under the given data so every number is visible as a table.
 * Prefers the generator's complete table (derived columns included); older saved attempts, or sets without one,
 * fall back to a plain table conversion of any chart. Returns [] when the data is already a table or plain text.
 */
export function analysisTables(stimulus: Stimulus): { heading: string; parts: StimulusPart[] } | null {
  if (stimulus.workings && stimulus.workings.length > 0) {
    return { heading: 'Complete data table (with derived values)', parts: stimulus.workings }
  }
  const charts = stimulus.parts.filter((p) => p.kind === 'bar' || p.kind === 'line' || p.kind === 'pie')
  if (charts.length === 0) return null
  return { heading: 'Data in table form', parts: charts.map(partToTable) }
}
