// Phụ đề tự động: tiếng trên timeline → các câu phụ đề có thời gian.
// Chạy hoàn toàn trên máy bằng whisper.cpp (không cần mạng, trừ lần đầu tải mô hình).
// Các bước & lý do: xem src/shared/captions/captions.ts.
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { join } from 'node:path'
import {
  fixOverlaps,
  parseVadSegments,
  parseWhisperJson,
  planChunks,
  type Caption,
  type CaptionLanguage,
  type Span
} from '@shared/captions/captions'
import type { CaptionProgress } from '@shared/ipc'
import type { Project } from '@shared/project/schema'
import { buildAudioMixGraph, sec } from '../export/graphBuilder'
import { runProcess } from '../media/processRunner'
import { ensureModel, hasModel, type FetchLike } from './whisperModel'

export interface CaptionServiceOptions {
  ffmpegExe: string
  /** resources/whisper: whisper-cli.exe, whisper-vad-speech-segments.exe, mô hình VAD */
  whisperDir: string
  /** Nơi lưu mô hình nhận dạng đã tải (thư mục dữ liệu người dùng). */
  modelsDir: string
  /** Thư mục tạm (mỗi lần tạo phụ đề một thư mục con, xong thì xóa). */
  tempDir: string
  fetchImpl?: FetchLike
}

const VAD_MODEL = 'ggml-silero-v6.2.0.bin'
/** Ngưỡng dò tiếng nói (0–1). 0.5 mặc định bỏ sót câu nói nhỏ / lẫn ồn; 0.3 đo trên video thật vẫn không bắt nhầm ồn. */
const VAD_THRESHOLD = '0.3'
/** Số khúc mỗi lần chạy whisper-cli (dòng lệnh Windows giới hạn ~32 nghìn ký tự). */
const BATCH = 60

export class CaptionService {
  private abort: AbortController | null = null

  constructor(private readonly options: CaptionServiceOptions) {}

  get available(): boolean {
    const w = this.options.whisperDir
    return (
      existsSync(join(w, 'whisper-cli.exe')) && existsSync(join(w, 'whisper-vad-speech-segments.exe')) && existsSync(join(w, VAD_MODEL))
    )
  }

  get modelReady(): boolean {
    return hasModel(this.options.modelsDir)
  }

  cancel(): void {
    this.abort?.abort()
  }

  async generate(project: Project, language: CaptionLanguage, onProgress: (p: CaptionProgress) => void): Promise<Caption[]> {
    if (!this.available) throw new Error('whisper-missing')
    this.abort?.abort()
    const abort = new AbortController()
    this.abort = abort
    const { signal } = abort
    const work = join(this.options.tempDir, `captions-${Date.now()}`)
    await mkdir(work, { recursive: true })
    try {
      // 1) Mô hình (lần đầu: tải ~190 MB)
      const model = await ensureModel(
        this.options.modelsDir,
        (received, total) => onProgress({ stage: 'download', fraction: received / total, received, total }),
        signal,
        this.options.fetchImpl
      )

      // 2) Trộn tiếng cả timeline → WAV 16 kHz mono (định dạng whisper cần)
      onProgress({ stage: 'prepare', fraction: 0 })
      const graph = buildAudioMixGraph(project)
      if (graph.durationUs <= 0) return []
      const graphFile = join(work, 'audio-graph.txt')
      await writeFile(graphFile, graph.filterGraph, 'utf8')
      const mix = join(work, 'mix.wav')
      await runProcess(
        this.options.ffmpegExe,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          ...graph.inputArgs,
          '-/filter_complex',
          graphFile,
          '-map',
          `[${graph.audioLabel}]`,
          '-ac',
          '1',
          '-ar',
          '16000',
          '-c:a',
          'pcm_s16le',
          '-t',
          sec(graph.durationUs),
          mix
        ],
        { signal }
      )

      // 3) Tìm các đoạn có người nói
      onProgress({ stage: 'detect', fraction: 0 })
      const vad = await runProcess(
        join(this.options.whisperDir, 'whisper-vad-speech-segments.exe'),
        ['-vm', join(this.options.whisperDir, VAD_MODEL), '-vt', VAD_THRESHOLD, '-t', String(threads()), '-f', mix],
        { signal }
      )
      const chunks = planChunks(parseVadSegments(vad.stdout), graph.durationUs)
      if (chunks.length === 0) return []

      // 4) Cắt từng khúc ra file riêng
      const files = chunks.map((_, i) => join(work, `chunk-${String(i).padStart(4, '0')}.wav`))
      for (let i = 0; i < chunks.length; i += BATCH) {
        const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', mix]
        chunks.slice(i, i + BATCH).forEach((c, j) => {
          args.push('-ss', sec(c.start), '-t', sec(c.end - c.start), '-c:a', 'pcm_s16le', files[i + j])
        })
        await runProcess(this.options.ffmpegExe, args, { signal })
      }

      // 5) Nhận dạng từng khúc (nạp mô hình 1 lần cho cả loạt)
      let done = 0
      onProgress({ stage: 'recognize', fraction: 0 })
      const captions: Caption[] = []
      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH)
        await runProcess(
          join(this.options.whisperDir, 'whisper-cli.exe'),
          [
            '-m',
            model,
            '-l',
            language,
            '-t',
            String(threads()),
            // Chống "ảo giác": không dựa vào câu trước (-mc 0), bỏ ký hiệu không phải lời nói, không lặp lại khi bí
            '-mc',
            '0',
            '-sns',
            '-nf',
            '-oj',
            ...batch.flatMap((f) => ['-f', f])
          ],
          {
            signal,
            onStderrLine: (line) => {
              if (line.startsWith('output_json:')) onProgress({ stage: 'recognize', fraction: ++done / files.length })
            }
          }
        )
        for (let j = 0; j < batch.length; j++) {
          const json = await readFile(`${batch[j]}.json`, 'utf8').catch(() => '')
          captions.push(...parseWhisperJson(json, chunks[i + j] as Span))
        }
      }
      return fixOverlaps(captions)
    } finally {
      if (this.abort === abort) this.abort = null
      await rm(work, { recursive: true, force: true })
    }
  }
}

/** Dùng gần hết nhân CPU nhưng chừa 1 nhân cho giao diện; whisper không nhanh hơn mấy khi quá 8 luồng. */
function threads(): number {
  return Math.max(1, Math.min(8, cpus().length - 1))
}
