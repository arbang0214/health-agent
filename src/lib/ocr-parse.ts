export type ParsedStats = {
  duration_min: number | null
  distance_km: number | null
  calories: number | null
}

export type DigitGroup = { digits: string; span: [number, number] }

/**
 * 소수점 등으로 한 필드가 둘로 쪼개진 경우 복원: 그룹이 5개를 넘으면
 * 간격이 밴드 높이의 90% 미만인 인접 그룹을 병합한다. 5개 이하는 그대로.
 */
export function mergeSplitGroups(items: DigitGroup[], bandHeight: number): string[] {
  const g = items.filter((i) => i.digits.length > 0)
  if (g.length <= 5) return g.map((i) => i.digits)

  const gapMax = bandHeight * 0.9
  const merged: DigitGroup[] = []
  let cur: DigitGroup | null = null
  for (const it of g) {
    if (cur && it.span[0] - cur.span[1] < gapMax) {
      cur = { digits: cur.digits + it.digits, span: [cur.span[0], it.span[1]] }
    } else {
      if (cur) merged.push(cur)
      cur = { digits: it.digits, span: it.span }
    }
  }
  if (cur) merged.push(cur)
  return merged.map((i) => i.digits)
}

const EMPTY: ParsedStats = { duration_min: null, distance_km: null, calories: null }

/** 구분선을 숫자 1로 오인해 자릿수가 1 넘친 경우 복구 */
function stripDividerOne(s: string, expectedLen: number): string {
  return s.length === expectedLen + 1 && s.startsWith('1') ? s.slice(1) : s
}

/**
 * 그룹별 OCR 결과를 운동 수치로 매핑.
 * 주력 러닝머신의 5필드 고정 레이아웃 [경사(2) | 칼로리(3) | 시간(4, mmss) | 거리(4, m단위) | 속도(2)] 전제.
 * 패턴이 안 맞으면(다른 기계, 부분 인식, 쿨다운 화면 등) 전부 null — 수동 입력 폴백.
 */
export function mapGroupsToStats(groups: string[]): ParsedStats {
  const g = groups.filter((s) => s.length > 0)
  if (g.length !== 5) return EMPTY

  const calStr = stripDividerOne(g[1], 3)
  const timeStr = stripDividerOne(g[2], 4)
  const distStr = stripDividerOne(g[3], 4)

  let duration_min: number | null = null
  if (/^\d{3,4}$/.test(timeStr)) {
    const mm = Number(timeStr.slice(0, -2))
    const ss = Number(timeStr.slice(-2))
    if (ss < 60) {
      const min = Math.round((mm * 60 + ss) / 60)
      if (min >= 1 && min <= 300) duration_min = min
    }
  }

  let distance_km: number | null = null
  if (/^\d{4}$/.test(distStr)) {
    const km = Number(distStr) / 1000
    if (km >= 0.1 && km <= 99.9) distance_km = Math.round(km * 100) / 100
  }

  let calories: number | null = null
  if (/^\d{3}$/.test(calStr)) {
    const v = Number(calStr)
    if (v >= 50 && v <= 2000) calories = v
  }

  return { duration_min, distance_km, calories }
}
