// .env.local을 process.env로 로드 (dotenv 의존성 없이 최소 구현)
// eval 러너는 Next.js 밖에서 돌기 때문에 직접 읽어야 한다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function loadEnvLocal(): void {
  const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
  // Windows CRLF 대응: \r이 남으면 정규식 $가 매칭되지 않는다
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
