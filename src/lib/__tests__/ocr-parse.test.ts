import { describe, expect, it } from 'vitest'
import { mapGroupsToStats, mergeSplitGroups } from '@/lib/ocr-parse'

describe('mapGroupsToStats', () => {
  it('5그룹 패턴(경사/칼로리/시간/거리/속도)을 매핑한다', () => {
    // 실사진 GT: 00 | 140 | 37:03 | 3.018km | 5.5
    expect(mapGroupsToStats(['00', '140', '3703', '3018', '55'])).toEqual({
      duration_min: 37,
      distance_km: 3.02,
      calories: 140,
    })
  })

  it('mm:ss 반올림 — 초가 30 이상이면 올림', () => {
    expect(mapGroupsToStats(['02', '173', '3542', '3013', '55']).duration_min).toBe(36)
  })

  it('구분선 오인으로 자릿수가 1 넘치고 1로 시작하면 첫 자를 버린다', () => {
    // "1139" → "139", "13012" → "3012"
    const r = mapGroupsToStats(['00', '1139', '3626', '13012', '55'])
    expect(r.calories).toBe(139)
    expect(r.distance_km).toBe(3.01)
  })

  it('초 자리가 60 이상이면 시간은 null (오독 방지)', () => {
    expect(mapGroupsToStats(['00', '140', '3781', '3018', '55']).duration_min).toBeNull()
  })

  it('범위 밖 값은 null — 칼로리 50 미만/2000 초과', () => {
    expect(mapGroupsToStats(['00', '030', '3703', '3018', '55']).calories).toBeNull()
    expect(mapGroupsToStats(['00', '999', '3703', '3018', '55']).calories).toBe(999)
  })

  it('그룹 수가 5가 아니면(다른 기계/부분 인식) 전부 null', () => {
    expect(mapGroupsToStats(['31313077683092', '55'])).toEqual({
      duration_min: null,
      distance_km: null,
      calories: null,
    })
    expect(mapGroupsToStats([])).toEqual({ duration_min: null, distance_km: null, calories: null })
  })

  it('시간이 3자리면 m:ss로 해석한다', () => {
    expect(mapGroupsToStats(['00', '140', '542', '3018', '55']).duration_min).toBe(6) // 5:42 → 6분
  })

  it('빈 문자열 그룹은 제외하고 판단한다', () => {
    expect(mapGroupsToStats(['00', '', '3703', '3018', '55'])).toEqual({
      duration_min: null,
      distance_km: null,
      calories: null,
    }) // 4그룹이 되므로 패턴 밖
  })
})

describe('mergeSplitGroups', () => {
  const bh = 40 // 밴드 높이 — 병합 임계 간격은 bh * 0.9 = 36

  it('6그룹 중 소수점으로 쪼개진 인접 그룹(간격 < 밴드높이*0.9)을 병합한다', () => {
    // 실사진 7/16: 거리 3.018이 "30"/"18"로 분리 인식된 케이스
    const items = [
      { digits: '00', span: [0, 50] as [number, number] },
      { digits: '140', span: [100, 180] as [number, number] },
      { digits: '3703', span: [230, 340] as [number, number] },
      { digits: '30', span: [380, 420] as [number, number] },
      { digits: '18', span: [430, 470] as [number, number] },
      { digits: '55', span: [520, 570] as [number, number] },
    ]
    expect(mergeSplitGroups(items, bh)).toEqual(['00', '140', '3703', '3018', '55'])
  })

  it('병합 결과는 mapGroupsToStats로 정상 매핑된다', () => {
    const items = [
      { digits: '00', span: [0, 50] as [number, number] },
      { digits: '140', span: [100, 180] as [number, number] },
      { digits: '3703', span: [230, 340] as [number, number] },
      { digits: '30', span: [380, 420] as [number, number] },
      { digits: '18', span: [430, 470] as [number, number] },
      { digits: '55', span: [520, 570] as [number, number] },
    ]
    expect(mapGroupsToStats(mergeSplitGroups(items, bh))).toEqual({
      duration_min: 37,
      distance_km: 3.02,
      calories: 140,
    })
  })

  it('5그룹 이하는 간격이 좁아도 병합하지 않는다 (정상 인식 보호)', () => {
    const items = [
      { digits: '00', span: [0, 50] as [number, number] },
      { digits: '140', span: [60, 140] as [number, number] },
      { digits: '3703', span: [150, 260] as [number, number] },
      { digits: '3018', span: [270, 380] as [number, number] },
      { digits: '55', span: [390, 440] as [number, number] },
    ]
    expect(mergeSplitGroups(items, bh)).toEqual(['00', '140', '3703', '3018', '55'])
  })

  it('빈 문자열 그룹은 병합 전에 제외한다', () => {
    const items = [
      { digits: '00', span: [0, 50] as [number, number] },
      { digits: '', span: [100, 180] as [number, number] },
      { digits: '3519', span: [230, 340] as [number, number] },
      { digits: '30', span: [380, 420] as [number, number] },
      { digits: '12', span: [430, 470] as [number, number] },
      { digits: '56', span: [520, 570] as [number, number] },
    ]
    // 빈 그룹 제외 후 5그룹 → 병합 없이 그대로 (패턴 판정은 mapGroupsToStats 몫)
    expect(mergeSplitGroups(items, bh)).toEqual(['00', '3519', '30', '12', '56'])
  })

  it('6그룹인데 전부 간격이 넓으면 병합 없이 6그룹 반환 (매핑 단계에서 null 처리)', () => {
    const items = [
      { digits: '00', span: [0, 50] as [number, number] },
      { digits: '140', span: [100, 180] as [number, number] },
      { digits: '37', span: [230, 280] as [number, number] },
      { digits: '03', span: [330, 380] as [number, number] },
      { digits: '3018', span: [430, 540] as [number, number] },
      { digits: '55', span: [590, 640] as [number, number] },
    ]
    expect(mergeSplitGroups(items, bh)).toHaveLength(6)
  })
})
