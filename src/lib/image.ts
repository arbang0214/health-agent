import { ensureDisplayable } from '@/lib/heic'

/**
 * 브라우저에서 이미지를 리사이즈·JPEG 압축한다.
 * 주의: canvas를 거치며 EXIF가 삭제되므로, EXIF 추출은 반드시 이 함수 호출 전에 할 것.
 */
export async function compressImage(file: Blob, maxDim = 1600, quality = 0.8): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('사진을 읽을 수 없는 형식이에요. 다른 사진으로 올려주세요')
  }
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('이미지 처리를 지원하지 않는 브라우저입니다')
    ctx.drawImage(bitmap, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('이미지 압축에 실패했습니다'))),
        'image/jpeg',
        quality
      )
    )
  } finally {
    bitmap.close()
  }
}

type Prepare = (image: Blob) => Promise<Blob>

/**
 * 선택 직후 원본을 표시 가능한 형식으로 변환(HEIC→JPEG)하고 곧바로 압축한다.
 * 풀사이즈 이미지는 이 함수 안에서만 잠깐 존재하고, 이후 미리보기·OCR·업로드는
 * 전부 압축본을 쓴다 — 고화소 사진에서 모바일 브라우저 메모리 초과를 막는 핵심.
 */
export async function prepareImage(
  original: Blob,
  ensure: Prepare = ensureDisplayable,
  compress: Prepare = compressImage
): Promise<Blob> {
  return compress(await ensure(original))
}
