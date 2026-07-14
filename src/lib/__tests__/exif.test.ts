import { describe, expect, it } from 'vitest'
import { extractTakenAt, resolveTakenAt } from '@/lib/exif'

describe('resolveTakenAt', () => {
  it('EXIF 일시가 있으면 그대로 사용한다', () => {
    const exif = new Date(2026, 6, 10, 19, 30)
    const now = new Date(2026, 6, 14, 9, 0)
    expect(resolveTakenAt(exif, now)).toEqual(exif)
  })

  it('EXIF 일시가 없으면 현재 시각으로 폴백한다', () => {
    const now = new Date(2026, 6, 14, 9, 0)
    expect(resolveTakenAt(null, now)).toEqual(now)
  })
})

describe('extractTakenAt', () => {
  it('EXIF가 없는 데이터에서는 null을 돌려준다 (throw하지 않음)', async () => {
    const junk = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' })
    await expect(extractTakenAt(junk)).resolves.toBeNull()
  })
})
