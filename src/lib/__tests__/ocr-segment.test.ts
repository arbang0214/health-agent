import { describe, expect, it } from 'vitest'
import { estimateSkewDeg, findBand, removeDividers, splitGroups } from '@/lib/ocr-segment'

describe('findBand', () => {
  it('LED 픽셀이 가장 밀집한 연속 행 구간을 찾는다', () => {
    //            0  1  2   3   4   5  6  7   8   9
    const rows = [0, 2, 0, 50, 80, 70, 0, 0, 10, 0]
    expect(findBand(rows, 5)).toEqual({ start: 3, end: 5 })
  })

  it('여러 밴드 중 픽셀 합이 큰 쪽을 고른다', () => {
    const rows = [0, 30, 30, 0, 0, 90, 95, 90, 0]
    expect(findBand(rows, 5)).toEqual({ start: 5, end: 7 })
  })

  it('임계값을 넘는 행이 없으면 null', () => {
    expect(findBand([1, 2, 1], 5)).toBeNull()
  })
})

describe('estimateSkewDeg', () => {
  it('수평선은 0도', () => {
    const pts = [0, 1, 2, 3].map((x) => ({ x, y: 10 }))
    expect(estimateSkewDeg(pts)).toBeCloseTo(0)
  })

  it('기울기 1(45도)을 추정한다', () => {
    const pts = [0, 1, 2, 3].map((x) => ({ x, y: x }))
    expect(estimateSkewDeg(pts)).toBeCloseTo(45)
  })

  it('점이 2개 미만이면 0도', () => {
    expect(estimateSkewDeg([{ x: 1, y: 1 }])).toBe(0)
  })
})

describe('removeDividers', () => {
  it('밴드 높이의 85% 이상을 채우는 얇은 열 구간을 0으로 만든다', () => {
    // bandHeight 20 → 구분선: count > 17, 폭 ≤ 2.4(=20*0.12)
    const cols = [0, 5, 5, 0, 19, 19, 0, 8, 8, 0]
    const out = removeDividers(cols, 20)
    expect(out[4]).toBe(0)
    expect(out[5]).toBe(0)
    expect(out[1]).toBe(5) // 일반 숫자 열은 유지
    expect(cols[4]).toBe(19) // 원본 불변
  })

  it('키가 크더라도 폭이 넓으면(숫자 블록) 유지한다', () => {
    // 폭 5 > 20*0.12 → 구분선 아님
    const cols = [0, 19, 19, 19, 19, 19, 0]
    const out = removeDividers(cols, 20)
    expect(out[3]).toBe(19)
  })
})

describe('splitGroups', () => {
  it('간격(밴드높이 절반 이상)으로 그룹을 나눈다', () => {
    // bandHeight 10 → gapMin 5
    const cols = Array(40).fill(0)
    for (let x = 2; x <= 8; x++) cols[x] = 9 // 그룹1 (폭 7)
    for (let x = 20; x <= 29; x++) cols[x] = 9 // 그룹2 (폭 10)
    expect(splitGroups(cols, 10)).toEqual([
      [2, 8],
      [20, 29],
    ])
  })

  it('작은 간격(소수점 등)은 같은 그룹으로 유지한다', () => {
    const cols = Array(30).fill(0)
    for (let x = 2; x <= 6; x++) cols[x] = 9
    for (let x = 9; x <= 14; x++) cols[x] = 9 // 간격 2 < gapMin 5
    expect(splitGroups(cols, 10)).toEqual([[2, 14]])
  })

  it('밴드높이 25% 이하 폭의 그룹(노이즈)은 버린다', () => {
    const cols = Array(30).fill(0)
    cols[2] = 9 // 폭 1 ≤ 2.5 → 노이즈
    for (let x = 10; x <= 18; x++) cols[x] = 9
    expect(splitGroups(cols, 10)).toEqual([[10, 18]])
  })
})
