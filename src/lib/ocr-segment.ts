// 계기판 LED 밴드 분할용 순수 함수들 — 실험(ocr-exp5)에서 검증된 로직의 함수화

export type Band = { start: number; end: number }

/** 행별 LED 픽셀 수에서 임계값을 넘는 연속 구간 중 픽셀 합이 최대인 밴드. 없으면 null. */
export function findBand(rowCounts: ArrayLike<number>, minCount: number): Band | null {
  let best: (Band & { sum: number }) | null = null
  let start = -1
  let sum = 0
  for (let y = 0; y <= rowCounts.length; y++) {
    const on = y < rowCounts.length && rowCounts[y] > minCount
    if (on && start < 0) {
      start = y
      sum = 0
    }
    if (on) sum += rowCounts[y]
    if (!on && start >= 0) {
      if (!best || sum > best.sum) best = { start, end: y - 1, sum }
      start = -1
    }
  }
  return best ? { start: best.start, end: best.end } : null
}

/** 열별 중심점들의 선형회귀 기울기를 도(deg)로. 점이 부족하면 0. */
export function estimateSkewDeg(points: Array<{ x: number; y: number }>): number {
  const n = points.length
  if (n < 2) return 0
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  if (den === 0) return 0
  return Math.atan2(num / den, 1) * (180 / Math.PI)
}

/** 밴드 높이의 85% 이상을 채우는 얇은(≤높이의 12%) 세로줄(필드 구분선)을 0으로. 원본 보존. */
export function removeDividers(colCounts: ArrayLike<number>, bandHeight: number): number[] {
  const out = Array.from(colCounts as number[])
  const tallMin = bandHeight * 0.85
  const thinMax = bandHeight * 0.12
  let runStart = -1
  for (let x = 0; x <= out.length; x++) {
    const tall = x < out.length && out[x] > tallMin
    if (tall && runStart < 0) runStart = x
    if (!tall && runStart >= 0) {
      if (x - runStart <= thinMax) {
        for (let xx = runStart; xx < x; xx++) out[xx] = 0
      }
      runStart = -1
    }
  }
  return out
}

/** 열 투영에서 간격(밴드높이 50% 이상)으로 그룹 분할. 폭이 높이의 25% 이하인 그룹은 노이즈로 제거. */
export function splitGroups(colCounts: ArrayLike<number>, bandHeight: number): Array<[number, number]> {
  const gapMin = Math.round(bandHeight * 0.5)
  const groups: Array<[number, number]> = []
  let start = -1
  let gap = 0
  for (let x = 0; x <= colCounts.length; x++) {
    const on = x < colCounts.length && colCounts[x] > 0
    if (on) {
      if (start < 0) start = x
      gap = 0
    } else if (start >= 0) {
      gap++
      if (gap >= gapMin || x === colCounts.length) {
        groups.push([start, x - gap])
        start = -1
        gap = 0
      }
    }
  }
  return groups.filter(([a, b]) => b - a > bandHeight * 0.25)
}
