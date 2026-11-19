import { formatINR } from '../../lib/format'
import { formatLakh, SOURCE_KEYS, type SourceKey } from './finance'

const COLORS: Record<SourceKey, string> = {
  Direct: '#0b241e', // ink
  B2B: '#b5771f', // accent
  OTA: '#3d7ea6',
  Other: '#93ad8f',
}

const R = 78
const STROKE = 30
const C = 2 * Math.PI * R

/** "Revenue by source" donut: Direct, B2B, OTA, Other, with the month's total in the centre. */
export function SourceDonut({ bySource, total, month }: { bySource: Record<SourceKey, number>; total: number; month: string }) {
  // a source can net out negative (refunds / commission larger than receipts): draw it as zero
  const values = SOURCE_KEYS.map((k) => ({ key: k, value: Math.max(0, bySource[k]) }))
  const sum = values.reduce((s, v) => s + v.value, 0)
  const shown = values.filter((v) => v.value > 0)
  const gap = shown.length > 1 ? 2 : 0
  const pct = (v: number) => (sum > 0 ? Math.round((v / sum) * 100) : 0)
  const describe = (k: SourceKey) => `${k} · ${formatINR(bySource[k])}${sum > 0 ? ` (${pct(Math.max(0, bySource[k]))}%)` : ''}`
  const label =
    sum > 0
      ? `Revenue by source, ${month}: ` + SOURCE_KEYS.map(describe).join('; ')
      : `No revenue received yet in ${month}`

  let offset = 0
  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={label}>
          <circle cx={100} cy={100} r={R} fill="none" stroke="#ece8df" strokeWidth={STROKE} />
          <g transform="rotate(-90 100 100)">
            {shown.map((v) => {
              const len = (v.value / sum) * C
              const el = (
                <circle
                  key={v.key}
                  cx={100}
                  cy={100}
                  r={R}
                  fill="none"
                  stroke={COLORS[v.key]}
                  strokeWidth={STROKE}
                  strokeDasharray={`${Math.max(0, len - gap)} ${C - Math.max(0, len - gap)}`}
                  strokeDashoffset={-offset}
                  className="transition-opacity hover:opacity-85"
                >
                  <title>{describe(v.key)}</title>
                </circle>
              )
              offset += len
              return el
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="nums font-display text-[28px] font-semibold leading-none text-dark">{formatLakh(total)}</div>
          <div className="mt-2 text-[15px] text-slate-600">{month}</div>
        </div>
      </div>
      {sum <= 0 && <p className="mt-3 text-center text-sm text-slate-500">No revenue received yet this month.</p>}
      <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[15px] text-slate-700">
        {SOURCE_KEYS.map((k) => (
          <li key={k} className="inline-flex items-center gap-2" title={describe(k)}>
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[k] }} aria-hidden="true" />
            {k}
          </li>
        ))}
      </ul>
    </div>
  )
}
