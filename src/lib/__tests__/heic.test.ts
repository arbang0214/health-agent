import { describe, expect, it, vi } from 'vitest'
import { ensureDisplayable, isHeic } from '@/lib/heic'

/** ISO-BMFF ftyp 헤더를 가진 가짜 이미지 파일 (박스크기 4B + 'ftyp' + 브랜드 4B) */
function bmff(brand: string): Blob {
  const head = new Uint8Array(16)
  head.set([0, 0, 0, 16]) // box size
  head.set([...'ftyp'].map((c) => c.charCodeAt(0)), 4)
  head.set([...brand].map((c) => c.charCodeAt(0)), 8)
  return new Blob([head], { type: 'image/heic' })
}

const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])], {
  type: 'image/jpeg',
})

describe('isHeic', () => {
  it('heic 계열 브랜드의 ftyp 헤더를 HEIC로 판정한다', async () => {
    for (const brand of ['heic', 'heix', 'mif1', 'msf1']) {
      await expect(isHeic(bmff(brand))).resolves.toBe(true)
    }
  })

  it('JPEG 시그니처는 HEIC가 아니다', async () => {
    await expect(isHeic(JPEG)).resolves.toBe(false)
  })

  it('ftyp이라도 avif 브랜드는 HEIC가 아니다 (브라우저가 직접 디코딩 가능)', async () => {
    await expect(isHeic(bmff('avif'))).resolves.toBe(false)
  })

  it('12바이트 미만 파일은 HEIC가 아니다', async () => {
    await expect(isHeic(new Blob([new Uint8Array([1, 2, 3])]))).resolves.toBe(false)
  })
})

describe('ensureDisplayable', () => {
  it('HEIC가 아니면 변환 없이 원본을 그대로 돌려준다', async () => {
    const convert = vi.fn()
    await expect(ensureDisplayable(JPEG, convert)).resolves.toBe(JPEG)
    expect(convert).not.toHaveBeenCalled()
  })

  it('HEIC면 변환 결과(JPEG Blob)를 돌려준다', async () => {
    const converted = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' })
    const convert = vi.fn().mockResolvedValue(converted)
    await expect(ensureDisplayable(bmff('heic'), convert)).resolves.toBe(converted)
  })

  it('변환에 실패하면 한국어 안내 에러를 던진다', async () => {
    const convert = vi.fn().mockRejectedValue(new Error('wasm boom'))
    await expect(ensureDisplayable(bmff('heic'), convert)).rejects.toThrow(/고효율 사진/)
  })
})
