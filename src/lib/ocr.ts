import { parseWorkoutStats, type ParsedStats } from '@/lib/ocr-parse'
import type { Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

async function createOcrWorker(): Promise<Worker> {
  const { createWorker, OEM } = await import('tesseract.js')
  try {
    // 7-세그먼트 전용 모델 (public/tessdata/letsgodigital.traineddata, legacy 엔진)
    return await createWorker('letsgodigital', OEM.TESSERACT_ONLY, {
      langPath: '/tessdata',
      gzip: false,
      legacyCore: true,
      legacyLang: true,
    })
  } catch {
    // 폴백: 기본 영어 모델 + 숫자 화이트리스트
    const worker = await createWorker('eng')
    await worker.setParameters({ tessedit_char_whitelist: '0123456789:. ' })
    return worker
  }
}

/** 계기판 사진에서 시간/거리/칼로리 인식. 실패 시 throw — 호출부에서 수동 입력으로 폴백. */
export async function recognizeWorkout(image: Blob | string): Promise<ParsedStats> {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((err) => {
      workerPromise = null // 다음 호출에서 재시도
      throw err
    })
  }
  const worker = await workerPromise
  const { data } = await worker.recognize(image)
  return parseWorkoutStats(data.text)
}
