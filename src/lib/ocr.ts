import { mapGroupsToStats, mergeSplitGroups, type DigitGroup, type ParsedStats } from '@/lib/ocr-parse'
import { preprocessDashboard } from '@/lib/ocr-preprocess'
import type { Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

async function createOcrWorker(): Promise<Worker> {
  const { createWorker, OEM } = await import('tesseract.js')
  // 7-세그먼트 특화 정수 LSTM 모델 (public/tessdata/ssd_int.traineddata)
  const worker = await createWorker('ssd_int', OEM.LSTM_ONLY, {
    langPath: '/tessdata',
    gzip: false,
    legacyCore: true, // ssd_int가 요구하는 심볼이 경량 코어에 없음
  })
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789:.',
    tessedit_pageseg_mode: '7' as never, // SINGLE_LINE — 그룹 이미지는 한 줄
  })
  return worker
}

/**
 * 계기판 사진에서 시간/거리/칼로리 인식.
 * 전처리(LED 밴드 분할)가 실패하거나 레이아웃이 안 맞으면 전부 null — 호출부는 수동 입력 폴백.
 * OCR 엔진 자체가 실패하면 throw.
 */
export async function recognizeWorkout(image: Blob | string): Promise<ParsedStats> {
  const blob = typeof image === 'string' ? await fetch(image).then((r) => r.blob()) : image
  const pre = await preprocessDashboard(blob).catch(() => null)
  if (!pre || pre.groups.length === 0) {
    return { duration_min: null, distance_km: null, calories: null }
  }

  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((err) => {
      workerPromise = null // 다음 호출에서 재시도
      throw err
    })
  }
  const worker = await workerPromise

  const items: DigitGroup[] = []
  for (let i = 0; i < pre.groups.length; i++) {
    const { data } = await worker.recognize(pre.groups[i])
    items.push({ digits: data.text.replace(/[^\d]/g, ''), span: pre.spans[i] })
  }
  return mapGroupsToStats(mergeSplitGroups(items, pre.bandHeight))
}
