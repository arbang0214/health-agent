import exifr from 'exifr'

/** EXIF에서 촬영 일시를 추출한다. 없거나 읽기 실패면 null. */
export async function extractTakenAt(file: File | Blob): Promise<Date | null> {
  try {
    const data = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    const d = data?.DateTimeOriginal ?? data?.CreateDate
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
  } catch {
    return null
  }
}

export function resolveTakenAt(exifDate: Date | null, now: Date): Date {
  return exifDate ?? now
}

/** EXIF가 없을 때 쓸 기본 일시. 캘린더에서 고른 날짜(yyyy-MM-dd)가 있으면 그날 낮 12시, 없으면 now. */
export function fallbackTakenAt(dateKey: string | null, now: Date): Date {
  if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const [y, m, d] = dateKey.split('-').map(Number)
    const date = new Date(y, m - 1, d, 12, 0)
    if (!Number.isNaN(date.getTime())) return date
  }
  return now
}
