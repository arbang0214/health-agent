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
