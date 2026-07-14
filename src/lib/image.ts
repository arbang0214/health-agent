/**
 * 브라우저에서 이미지를 리사이즈·JPEG 압축한다.
 * 주의: canvas를 거치며 EXIF가 삭제되므로, EXIF 추출은 반드시 이 함수 호출 전에 할 것.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
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
}
