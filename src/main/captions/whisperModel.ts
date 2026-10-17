// Mô hình nhận dạng giọng nói Whisper (ggml-small-q5_1, ~190 MB, MIT).
// Không đóng gói kèm bộ cài: tải từ Hugging Face khi người dùng tạo phụ đề lần đầu,
// vừa tải vừa tính SHA-256, khớp mới đổi tên thành file chính thức (tải dở / hỏng thì không dùng).
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

export const WHISPER_MODEL = {
  file: 'ggml-small-q5_1.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
  sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
  bytes: 190_085_487
} as const

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>

export function modelPath(modelsDir: string): string {
  return join(modelsDir, WHISPER_MODEL.file)
}

export function hasModel(modelsDir: string): boolean {
  return existsSync(modelPath(modelsDir))
}

/**
 * Tải mô hình nếu chưa có.
 * @param onProgress (đã tải, tổng) tính bằng byte
 */
export async function ensureModel(
  modelsDir: string,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const dest = modelPath(modelsDir)
  if (existsSync(dest)) return dest
  await mkdir(modelsDir, { recursive: true })
  const partial = `${dest}.part`
  const res = await fetchImpl(WHISPER_MODEL.url, { signal })
  if (!res.ok || !res.body) throw new Error(`Tải mô hình thất bại (${res.status} ${res.statusText})`)
  const total = Number(res.headers.get('content-length')) || WHISPER_MODEL.bytes
  const hash = createHash('sha256')
  const out = createWriteStream(partial)
  let received = 0
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      received += value.length
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      onProgress(received, total)
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
    const actual = hash.digest('hex')
    if (actual !== WHISPER_MODEL.sha256) throw new Error(`Mô hình tải về bị hỏng (SHA-256 không khớp: ${actual})`)
    await rename(partial, dest)
    return dest
  } catch (err) {
    out.destroy()
    await rm(partial, { force: true })
    throw err
  }
}
