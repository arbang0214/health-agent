// HEIC/HEIF 감지·변환 — Android Chrome 등 HEIC 미지원 브라우저 대응
// (삼성 카메라 '고효율 사진'이 HEIC로 저장돼 createImageBitmap이 디코딩하지 못함)

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heif', 'mif1', 'msf1'])

export async function isHeic(image: Blob): Promise<boolean> {
  if (image.size < 12) return false
  const head = new Uint8Array(await image.slice(0, 12).arrayBuffer())
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to))
  return ascii(4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(8, 12).toLowerCase())
}

type Convert = (image: Blob) => Promise<Blob>

async function convertWithHeic2any(image: Blob): Promise<Blob> {
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: image, toType: 'image/jpeg', quality: 0.9 })
  return Array.isArray(out) ? out[0] : out
}

/**
 * 브라우저가 표시할 수 있는 Blob을 보장한다.
 * HEIC면 JPEG로 변환(heic2any를 필요할 때만 로드), 아니면 원본 그대로.
 * 주의: 변환하면 EXIF가 사라지므로 EXIF 추출은 원본에서 먼저 할 것.
 */
export async function ensureDisplayable(image: Blob, convert: Convert = convertWithHeic2any): Promise<Blob> {
  if (!(await isHeic(image))) return image
  try {
    return await convert(image)
  } catch {
    throw new Error(
      '사진 형식(HEIC)을 변환하지 못했어요. 카메라 설정에서 "고효율 사진"을 끄거나, 갤러리에서 JPEG로 저장해 올려주세요'
    )
  }
}
