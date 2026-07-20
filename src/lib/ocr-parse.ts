export type ParsedStats = {
  duration_min: number | null
  distance_km: number | null
  calories: number | null
}

const TIME_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g
const DECIMAL_RE = /\b(\d{1,2}\.\d{1,2})\b/g
const INT_RE = /\b(\d{2,4})\b/g

type Span = readonly [number, number]

function outside(spans: Span[], index: number, len: number): boolean {
  return spans.every(([s, e]) => index + len <= s || index >= e)
}

/** OCR 텍스트에서 시간/거리/칼로리 추출. 애매하면(후보 2개 이상, 범위 밖) null. */
export function parseWorkoutStats(text: string): ParsedStats {
  const times = [...text.matchAll(TIME_RE)]
  const timeSpans: Span[] = times.map((m) => [m.index!, m.index! + m[0].length])

  let duration_min: number | null = null
  if (times.length === 1) {
    const [, a, b, c] = times[0]
    const secs =
      c !== undefined
        ? Number(a) * 3600 + Number(b) * 60 + Number(c)
        : Number(a) * 60 + Number(b)
    const min = Math.round(secs / 60)
    duration_min = min > 0 ? min : null
  }

  const decimals = [...text.matchAll(DECIMAL_RE)].filter((m) => outside(timeSpans, m.index!, m[0].length))
  const decimalSpans: Span[] = decimals.map((m) => [m.index!, m.index! + m[0].length])

  let distance_km: number | null = null
  if (decimals.length === 1) {
    const v = Number(decimals[0][1])
    if (v >= 0.1 && v <= 99.9) distance_km = v
  }

  const ints = [...text.matchAll(INT_RE)].filter((m) => {
    const v = Number(m[1])
    return (
      v >= 50 &&
      v <= 2000 &&
      outside(timeSpans, m.index!, m[0].length) &&
      outside(decimalSpans, m.index!, m[0].length)
    )
  })
  const calories = ints.length === 1 ? Number(ints[0][1]) : null

  return { duration_min, distance_km, calories }
}
