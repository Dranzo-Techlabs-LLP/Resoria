import { useLayoutEffect, useRef, useState } from 'react'
import { formatINR } from '../../lib/format'

export interface MonthPoint {
  key: string // YYYY-MM
  label: string // Jun
  long: string // June 2026
  revenue: number
  expenses: number
}

const INK = '#0b241e'
const ACCENT = '#b5771f'

/** Width of an element, kept current with a ResizeObserver (the SVG is drawn at real pixels so text stays readable). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.floor(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Axis top and ticks at a "nice" step (1, 2, 2.5, 5 × 10ⁿ), about four intervals. */
function niceTicks(max: number): { top: number; ticks: number[] } {
  const m = max > 0 ? max : 1_00_000
  const rough = m / 4
  const mag = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const top = Math.ceil(m / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  return { top, ticks }
}

function tickLabel(v: number, top: number): string {
  if (top >= 10_00_000) return `₹${+(v / 1_00_000).toFixed(1)}L`
  if (top >= 1_000) return `₹${+(v / 1_000).toFixed(1)}k`
  return `₹${v}`
}

/** "Revenue & Expenses · last 6 months" grouped bars (Revenue ink, Expenses accent). */
export function RevenueExpenseChart({ data }: { data: MonthPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const H = 250
  const padL = 56
  const padR = 8
  const padT = 14
  const padB = 30
  const max = Math.max(0, ...data.flatMap((d) => [d.revenue, d.expenses]))
  const { top, ticks } = niceTicks(max)
  const plotW = Math.max(0, width - padL - padR)
  const plotH = H - padT - padB
  const y = (v: number) => padT + plotH - (Math.max(0, v) / top) * plotH
  const group = data.length ? plotW / data.length : 0
  const barW = Math.max(6, Math.min(32, group * 0.3))
  const gap = Math.min(6, group * 0.06)
  const summary =
    'Revenue and expenses, last 6 months: ' +
    data.map((d) => `${d.long}: revenue ${formatINR(d.revenue)}, expenses ${formatINR(d.expenses)}`).join('; ')

  return (
    <div>
      <div ref={ref} className="w-full" style={{ height: H }}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={summary}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="#ece8df" strokeWidth={1} />
                <text x={padL - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill="#64748b">
                  {tickLabel(t, top)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = padL + group * i + group / 2
              const bars = [
                { name: 'Revenue', value: d.revenue, color: INK, x: cx - gap / 2 - barW },
                { name: 'Expenses', value: d.expenses, color: ACCENT, x: cx + gap / 2 },
              ]
              return (
                <g key={d.key}>
                  {bars.map((b) => {
                    const h = Math.max(0, y(0) - y(b.value))
                    return (
                      <rect
                        key={b.name}
                        x={b.x}
                        y={y(0) - h}
                        width={barW}
                        height={h}
                        rx={Math.min(4, barW / 4)}
                        fill={b.color}
                        className="transition-opacity hover:opacity-80"
                      >
                        <title>{`${d.long} · ${b.name} ${formatINR(b.value)}`}</title>
                      </rect>
                    )
                  })}
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={13} fill="#475569">{d.label}</text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-slate-700" aria-hidden="true">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-ink" />Revenue</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-accent" />Expenses</span>
      </div>
    </div>
  )
}
