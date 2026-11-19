import { useLayoutEffect, useRef, useState } from 'react'
import { fmtAvg, type TrendPoint } from './utils'

const INK = '#0b241e'

/** Width of an element, kept current (the SVG is drawn at real pixels so text stays readable). */
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

/** Monthly average rating (bars on a 0–5 scale, value above each bar; "–" for a month without reviews). */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const H = 190
  const padL = 26
  const padR = 4
  const padT = 22
  const padB = 28
  const plotW = Math.max(0, width - padL - padR)
  const plotH = H - padT - padB
  const y = (v: number) => padT + plotH - (v / 5) * plotH
  const group = data.length ? plotW / data.length : 0
  const barW = Math.max(8, Math.min(30, group * 0.42))
  const summary = 'Average rating by month: ' + data.map((d) => `${d.long}: ${d.avg === null ? 'no reviews' : `${fmtAvg(d.avg)} from ${d.count} ${d.count === 1 ? 'review' : 'reviews'}`}`).join('; ')

  return (
    <div ref={ref} className="w-full" style={{ height: H }}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={summary}>
          {[1, 2, 3, 4, 5].map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="#ece8df" strokeWidth={1} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill="#64748b">{t}</text>
            </g>
          ))}
          <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke="#d6d0c2" strokeWidth={1} />
          {data.map((d, i) => {
            const cx = padL + group * i + group / 2
            const h = d.avg === null ? 0 : Math.max(2, y(0) - y(d.avg))
            return (
              <g key={d.key}>
                {d.avg !== null && (
                  <rect x={cx - barW / 2} y={y(0) - h} width={barW} height={h} rx={Math.min(4, barW / 4)} fill={INK} className="transition-opacity hover:opacity-80">
                    <title>{`${d.long} · ${fmtAvg(d.avg)} average · ${d.count} ${d.count === 1 ? 'review' : 'reviews'}`}</title>
                  </rect>
                )}
                <text x={cx} y={d.avg === null ? y(0) - 6 : y(0) - h - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill={d.avg === null ? '#94a3b8' : '#0f1f12'}>
                  {d.avg === null ? '–' : fmtAvg(d.avg)}
                </text>
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={13} fill="#475569">{d.label}</text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
