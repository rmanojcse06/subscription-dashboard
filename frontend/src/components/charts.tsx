import { useRef, useState } from 'react'

// Small dependency-free SVG charts. Single series each (the title names it, so no legend).
// Specs: 2px line, 4px-rounded bar tops on the baseline, 2px gaps, recessive grid, hover tooltip.

export interface Point {
  label: string // x-axis / tooltip label
  value: number
}

const W = 640
const H = 200
const PAD = { top: 12, right: 12, bottom: 24, left: 56 }

function niceMax(max: number): number {
  if (max <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(max))
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((v) => v >= max) ?? max
}

function useHover(n: number) {
  const ref = useRef<SVGSVGElement>(null)
  const [idx, setIdx] = useState<number | null>(null)
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const step = (W - PAD.left - PAD.right) / Math.max(n, 1)
    setIdx(Math.min(n - 1, Math.max(0, Math.floor((x - PAD.left) / step))))
  }
  return { ref, idx, setIdx, onMove }
}

function Axes({ max, fmt, labels }: { max: number; fmt: (n: number) => string; labels: string[] }) {
  const ticks = [0, 0.5, 1].map((f) => f * max)
  const step = (W - PAD.left - PAD.right) / Math.max(labels.length, 1)
  const every = Math.ceil(labels.length / 6)
  return (
    <g className="axis">
      {ticks.map((t) => {
        const y = PAD.top + (1 - t / max) * (H - PAD.top - PAD.bottom)
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} className={t === 0 ? 'baseline' : 'grid'} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        )
      })}
      {labels.map((l, i) =>
        i % every === 0 ? (
          <text key={i} x={PAD.left + step * (i + 0.5)} y={H - 6} textAnchor="middle">
            {l}
          </text>
        ) : null,
      )}
    </g>
  )
}

function Tip({ idx, n, children }: { idx: number; n: number; children: React.ReactNode }) {
  const pct = ((PAD.left + ((W - PAD.left - PAD.right) / n) * (idx + 0.5)) / W) * 100
  return (
    <div className="chart-tip" style={{ left: `${pct}%`, transform: `translateX(${pct > 60 ? '-100%' : '0'})` }}>
      {children}
    </div>
  )
}

export function BarChart({ data, fmt, title }: { data: Point[]; fmt: (n: number) => string; title: string }) {
  const { ref, idx, setIdx, onMove } = useHover(data.length)
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const innerH = H - PAD.top - PAD.bottom
  const step = (W - PAD.left - PAD.right) / Math.max(data.length, 1)
  const bw = Math.max(step - 2, 1)
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <div className="chart-wrap">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onPointerMove={onMove} onPointerLeave={() => setIdx(null)}>
          <Axes max={max} fmt={fmt} labels={data.map((d) => d.label)} />
          {data.map((d, i) => {
            const h = (d.value / max) * innerH
            const x = PAD.left + step * i + 1
            const y = PAD.top + innerH - h
            const r = Math.min(4, bw / 2, h)
            // Rounded top, square bottom on the baseline.
            const base = PAD.top + innerH
            const path =
              h <= 0
                ? ''
                : `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`
            return path ? <path key={i} d={path} className={`bar${idx === i ? ' bar-hover' : ''}`} /> : null
          })}
        </svg>
        {idx !== null && data[idx] && (
          <Tip idx={idx} n={data.length}>
            <strong>{fmt(data[idx].value)}</strong>
            <span>{data[idx].label}</span>
          </Tip>
        )}
      </div>
    </figure>
  )
}

/** Step line: a balance holds its value until the next observation. */
export function StepLineChart({ data, fmt, title }: { data: Point[]; fmt: (n: number) => string; title: string }) {
  const { ref, idx, setIdx, onMove } = useHover(data.length)
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const innerH = H - PAD.top - PAD.bottom
  const step = (W - PAD.left - PAD.right) / Math.max(data.length, 1)
  const x = (i: number) => PAD.left + step * (i + 0.5)
  const y = (v: number) => PAD.top + (1 - Math.max(v, 0) / max) * innerH
  const d = data.map((p, i) => (i === 0 ? `M${x(0)},${y(p.value)}` : `H${x(i)} V${y(p.value)}`)).join(' ')
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <div className="chart-wrap">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onPointerMove={onMove} onPointerLeave={() => setIdx(null)}>
          <Axes max={max} fmt={fmt} labels={data.map((p) => p.label)} />
          {data.length > 0 && <path d={d} className="line" />}
          {idx !== null && data[idx] && (
            <>
              <line x1={x(idx)} x2={x(idx)} y1={PAD.top} y2={PAD.top + innerH} className="crosshair" />
              <circle cx={x(idx)} cy={y(data[idx].value)} r={4} className="dot" />
            </>
          )}
        </svg>
        {idx !== null && data[idx] && (
          <Tip idx={idx} n={data.length}>
            <strong>{fmt(data[idx].value)}</strong>
            <span>{data[idx].label}</span>
          </Tip>
        )}
      </div>
    </figure>
  )
}
