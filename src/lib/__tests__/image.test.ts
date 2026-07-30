import { describe, expect, it, vi } from 'vitest'
import { prepareImage } from '@/lib/image'

const ORIGINAL = new Blob([new Uint8Array([1])], { type: 'image/jpeg' })
const CONVERTED = new Blob([new Uint8Array([2])], { type: 'image/jpeg' })
const COMPRESSED = new Blob([new Uint8Array([3])], { type: 'image/jpeg' })

describe('prepareImage', () => {
  it('변환이 필요 없으면 원본을 바로 압축해 돌려준다', async () => {
    const ensure = vi.fn().mockResolvedValue(ORIGINAL)
    const compress = vi.fn().mockResolvedValue(COMPRESSED)
    await expect(prepareImage(ORIGINAL, ensure, compress)).resolves.toBe(COMPRESSED)
    expect(compress).toHaveBeenCalledExactlyOnceWith(ORIGINAL)
  })

  it('HEIC 변환 결과를 압축에 넘긴다 (원본이 아니라)', async () => {
    const ensure = vi.fn().mockResolvedValue(CONVERTED)
    const compress = vi.fn().mockResolvedValue(COMPRESSED)
    await expect(prepareImage(ORIGINAL, ensure, compress)).resolves.toBe(COMPRESSED)
    expect(compress).toHaveBeenCalledExactlyOnceWith(CONVERTED)
  })

  it('변환 실패 에러는 그대로 전달한다', async () => {
    const ensure = vi.fn().mockRejectedValue(new Error('고효율 사진 변환 실패'))
    const compress = vi.fn()
    await expect(prepareImage(ORIGINAL, ensure, compress)).rejects.toThrow(/고효율 사진/)
    expect(compress).not.toHaveBeenCalled()
  })

  it('압축 실패 에러는 그대로 전달한다', async () => {
    const ensure = vi.fn().mockResolvedValue(ORIGINAL)
    const compress = vi.fn().mockRejectedValue(new Error('사진을 읽을 수 없는 형식이에요'))
    await expect(prepareImage(ORIGINAL, ensure, compress)).rejects.toThrow(/읽을 수 없는/)
  })
})
