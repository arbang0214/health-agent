// 계기판 사진 → 숫자 그룹별 이진화 PNG 목록 (브라우저 전용, 실험 ocr-exp5 파이프라인 포팅)
import { estimateSkewDeg, findBand, removeDividers, splitGroups, type Band } from '@/lib/ocr-segment'

const MAX_WIDTH = 1600
const TARGET_GROUP_HEIGHT = 60

type MaskResult = { mask: Uint8Array; rowCounts: number[] }

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d context 생성 실패')
  return ctx
}

/** 밝고 채도 높은 픽셀(LED) 마스크 */
function ledMask(data: Uint8ClampedArray, width: number, height: number): MaskResult {
  const mask = new Uint8Array(width * height)
  const rowCounts = new Array<number>(height).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      if (mx > 120 && mx - mn > 60) {
        mask[y * width + x] = 1
        rowCounts[y]++
      }
    }
  }
  return { mask, rowCounts }
}

function colCountsInBand(mask: Uint8Array, width: number, band: Band): number[] {
  const cols = new Array<number>(width).fill(0)
  for (let x = 0; x < width; x++) {
    for (let y = band.start; y <= band.end; y++) {
      if (mask[y * width + x]) cols[x]++
    }
  }
  return cols
}

/** 그룹 영역을 잘라 그레이 정규화 + 임계값 이진화(검은 글자/흰 배경) PNG Blob으로 */
async function binarizeGroup(
  src: HTMLCanvasElement,
  left: number,
  top: number,
  w: number,
  h: number
): Promise<Blob> {
  const scale = Math.max(1, Math.min(5, TARGET_GROUP_HEIGHT / h))
  const out = makeCanvas(Math.round(w * scale), Math.round(h * scale))
  const octx = ctx2d(out)
  octx.filter = 'blur(1px)' // 7-seg 세그먼트 틈 붙이기
  octx.drawImage(src, left, top, w, h, 0, 0, out.width, out.height)
  octx.filter = 'none'

  const img = octx.getImageData(0, 0, out.width, out.height)
  const d = img.data
  // 그레이 변환 + min/max 정규화
  const lum = new Float32Array(out.width * out.height)
  let lo = 255
  let hi = 0
  for (let p = 0; p < lum.length; p++) {
    const i = p * 4
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    lum[p] = v
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const range = Math.max(1, hi - lo)
  const thr = 0.43 // 실험값 110/255
  for (let p = 0; p < lum.length; p++) {
    const norm = (lum[p] - lo) / range
    const val = norm > thr ? 0 : 255 // 밝은 LED → 검은 글자, 배경 → 흰색
    const i = p * 4
    d[i] = d[i + 1] = d[i + 2] = val
    d[i + 3] = 255
  }
  octx.putImageData(img, 0, 0)
  return new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 변환 실패'))), 'image/png')
  })
}

export type PreprocessResult = {
  groups: Blob[]
  /** 그룹별 x축 구간 — 쪼개진 필드 병합(mergeSplitGroups) 판단용 */
  spans: Array<[number, number]>
  bandHeight: number
}

/**
 * 계기판 사진에서 LED 숫자 그룹들을 찾아 그룹별 이진화 이미지로 반환.
 * LED 밴드를 못 찾으면 null (호출부는 수동 입력 폴백).
 */
export async function preprocessDashboard(image: Blob): Promise<PreprocessResult | null> {
  const bitmap = await createImageBitmap(image)
  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  const W = Math.round(bitmap.width * scale)
  const H = Math.round(bitmap.height * scale)
  const base = makeCanvas(W, H)
  ctx2d(base).drawImage(bitmap, 0, 0, W, H)
  bitmap.close()

  // 1차 마스크 → 밴드 → 기울기 추정
  const first = ctx2d(base).getImageData(0, 0, W, H)
  const m1 = ledMask(first.data, W, H)
  const band1 = findBand(m1.rowCounts, Math.max(5, W * 0.005))
  if (!band1) return null
  const points: Array<{ x: number; y: number }> = []
  for (let x = 0; x < W; x++) {
    let cnt = 0
    let acc = 0
    for (let y = band1.start; y <= band1.end; y++) {
      if (m1.mask[y * W + x]) {
        cnt++
        acc += y
      }
    }
    if (cnt > 0) points.push({ x, y: acc / cnt })
  }
  const angleDeg = estimateSkewDeg(points)

  // 회전 보정
  const rot = makeCanvas(W, H)
  const rctx = ctx2d(rot)
  rctx.fillStyle = '#000'
  rctx.fillRect(0, 0, W, H)
  rctx.translate(W / 2, H / 2)
  rctx.rotate((-angleDeg * Math.PI) / 180)
  rctx.drawImage(base, -W / 2, -H / 2)
  rctx.setTransform(1, 0, 0, 1, 0, 0)

  // 재마스크 → 밴드 → 구분선 제거 → 그룹 분할
  const second = rctx.getImageData(0, 0, W, H)
  const m2 = ledMask(second.data, W, H)
  const band2 = findBand(m2.rowCounts, Math.max(5, W * 0.005))
  if (!band2) return null
  const bh = band2.end - band2.start + 1
  const cols = removeDividers(colCountsInBand(m2.mask, W, band2), bh)
  const groups = splitGroups(cols, bh)
  if (groups.length === 0) return null

  const pad = Math.round(bh * 0.15)
  const blobs: Blob[] = []
  for (const [a, b] of groups) {
    const left = Math.max(0, a - pad)
    const top = Math.max(0, band2.start - pad)
    const w = Math.min(W - left, b - a + 1 + pad * 2)
    const h = Math.min(H - top, bh + pad * 2)
    blobs.push(await binarizeGroup(rot, left, top, w, h))
  }
  return { groups: blobs, spans: groups, bandHeight: bh }
}
