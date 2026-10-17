// Phụ đề tự động: các hàm xử lý thuần + chạy thật whisper.cpp (nếu đã có mô hình trên máy).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixOverlaps, isHallucination, parseVadSegments, parseWhisperJson, planChunks } from '@shared/captions/captions'
import { createEmptyProject } from '@shared/project/factory'
import * as ops from '@shared/project/ops'
import type { MediaAsset } from '@shared/project/schema'
import { createMediaClip } from '@shared/timeline/clips'
import { applyCaptions, CAPTION_Y, splitForScreen } from '@shared/captions/applyCaptions'
import { createTextClip } from '@shared/timeline/clips'
import { CaptionService } from '../src/main/captions/captionService'
import { ensureModel, modelPath } from '../src/main/captions/whisperModel'

const S = 1_000_000

describe('phụ đề tự động – xử lý thuần', () => {
  it('đọc đoạn có tiếng nói (phần trăm giây → µs)', () => {
    const out =
      'Detected 2 speech segments:\nSpeech segment 0: start = 239.00, end = 308.00\nSpeech segment 1: start = 1068.00, end = 1140.00\n'
    expect(parseVadSegments(out)).toEqual([
      { start: 2.39 * S, end: 3.08 * S },
      { start: 10.68 * S, end: 11.4 * S }
    ])
    expect(parseVadSegments('Detected 0 speech segments:')).toEqual([])
  })

  it('gộp đoạn gần nhau, nới 2 đầu, không vượt quá đầu/cuối timeline', () => {
    const chunks = planChunks(
      [
        { start: 0.1 * S, end: 1 * S },
        { start: 1.3 * S, end: 2 * S }, // cách 0.3s → cùng câu
        { start: 5 * S, end: 6 * S },
        { start: 9.9 * S, end: 10 * S }
      ],
      10 * S
    )
    expect(chunks).toEqual([
      { start: 0, end: 2.3 * S },
      { start: 4.7 * S, end: 6.3 * S },
      { start: 9.6 * S, end: 10 * S }
    ])
  })

  it('đọc JSON của whisper: cộng giờ đầu khúc, bỏ câu rỗng / ảo giác', () => {
    const json = JSON.stringify({
      transcription: [
        { offsets: { from: 300, to: 1100 }, text: ' Cái gì mà đơ vậy?' },
        { offsets: { from: 1100, to: 1500 }, text: ' Hãy subscribe cho kênh Ghiền Mì Gõ' },
        { offsets: { from: 1500, to: 1600 }, text: '   ' }
      ]
    })
    expect(parseWhisperJson(json, { start: 10 * S, end: 12 * S })).toEqual([{ start: 10.3 * S, end: 11.1 * S, text: 'Cái gì mà đơ vậy?' }])
    expect(parseWhisperJson('hỏng', { start: 0, end: S })).toEqual([])
    expect(isHallucination('Cảm ơn các bạn đã theo dõi')).toBe(true)
    expect(isHallucination('Hôm nay mình đi chợ')).toBe(false)
  })

  it('phụ đề không chồng lên nhau', () => {
    expect(
      fixOverlaps([
        { start: 2 * S, end: 4 * S, text: 'b' },
        { start: 0, end: 2.5 * S, text: 'a' }
      ])
    ).toEqual([
      { start: 0, end: 2.5 * S, text: 'a' },
      { start: 2.5 * S, end: 4 * S, text: 'b' }
    ])
  })
})

describe('phụ đề tự động – đưa lên timeline', () => {
  it('câu dài: chia dòng ≤ 32 ký tự, quá 2 dòng thì tách thành phụ đề nối tiếp', () => {
    expect(splitForScreen({ start: 0, end: S, text: 'gì mà đơ vậy' })).toEqual([{ start: 0, end: S, text: 'gì mà đơ vậy' }])
    const long = 'một hai ba bốn năm sáu bảy tám chín mười một hai ba bốn năm sáu bảy tám chín mười một hai ba bốn năm'
    const parts = splitForScreen({ start: 0, end: 6 * S, text: long })
    expect(parts.length).toBe(2)
    for (const p of parts) for (const line of p.text.split('\n')) expect(line.length).toBeLessThanOrEqual(32)
    expect(parts[0].text.split('\n').length).toBe(2)
    expect(parts[0].end).toBe(parts[1].start)
    expect(parts[1].end).toBe(6 * S)
    expect(parts.map((p) => p.text.replace(/\n/g, ' ')).join(' ')).toBe(long)
  })

  it('thêm track "Phụ đề" mới; "Xóa phụ đề hiện tại" chỉ xóa phụ đề tự động, giữ chữ tự thêm', () => {
    const project = createEmptyProject('t')
    const mine = createTextClip(0, 'Chữ của tôi')
    ops.addClip(project, ops.addTrack(project, 'text'), mine)
    const first = applyCaptions(project, [{ start: S, end: 2 * S, text: 'xin chào' }], { replace: true, trackName: 'Phụ đề' })
    const track = project.tracks.find((t) => t.id === first.trackId)!
    expect(track).toMatchObject({ kind: 'text', name: 'Phụ đề' })
    expect(track.clips[0]).toMatchObject({
      type: 'text',
      text: 'xin chào',
      start: S,
      duration: S,
      caption: true,
      transform: { y: CAPTION_Y }
    })

    const second = applyCaptions(project, [{ start: 3 * S, end: 4 * S, text: 'lần hai' }], { replace: true, trackName: 'Phụ đề' })
    const texts = project.tracks.flatMap((t) => t.clips).map((c) => (c.type === 'text' ? c.text : ''))
    expect(texts.sort()).toEqual(['Chữ của tôi', 'lần hai'])
    expect(project.tracks.some((t) => t.id === first.trackId)).toBe(false) // track phụ đề cũ trống → bỏ
    // Không xóa: giữ cả 2 lần
    applyCaptions(project, [{ start: 5 * S, end: 6 * S, text: 'lần ba' }], { replace: false, trackName: 'Phụ đề' })
    expect(project.tracks.flatMap((t) => t.clips).length).toBe(3)
    expect(second.clipIds.length).toBe(1)
  })

  it('tải mô hình: file tải về sai checksum thì báo lỗi và không giữ lại file hỏng', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-model-'))
    try {
      const fakeFetch = async (): Promise<Response> => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-length': '4' } })
      const seen: number[] = []
      await expect(ensureModel(dir, (r) => seen.push(r), undefined, fakeFetch)).rejects.toThrow(/SHA-256/)
      expect(seen).toEqual([4])
      expect(existsSync(modelPath(dir))).toBe(false)
      expect(existsSync(`${modelPath(dir)}.part`)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

// ───────── Chạy thật ─────────
// Cần: resources/whisper (npm run setup:whisper) + mô hình ggml-small-q5_1.bin trong thư mục
// CUTCAP_WHISPER_MODELS (hoặc %APPDATA%\Cutcap\models – nơi app tải về) + giọng đọc của Windows.
const root = join(__dirname, '..')
const ffmpeg = join(root, 'resources', 'ffmpeg', 'ffmpeg.exe')
const whisperDir = join(root, 'resources', 'whisper')
const modelsDir = process.env['CUTCAP_WHISPER_MODELS'] ?? join(process.env['APPDATA'] ?? '', 'Cutcap', 'models')
const canRun = existsSync(ffmpeg) && existsSync(join(whisperDir, 'whisper-cli.exe')) && existsSync(modelPath(modelsDir))

describe.skipIf(!canRun)('phụ đề tự động – chạy thật whisper.cpp', () => {
  it('giọng đọc tiếng Anh ở giây thứ 3 → phụ đề đúng chữ, đúng chỗ trên timeline', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcap-captions-'))
    try {
      const speech = join(dir, 'speech.wav')
      spawnSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.Speech; $t = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
          `$t.SetOutputToWaveFile('${speech}'); $t.Speak('Hello, this is a short test of automatic captions.'); $t.Dispose()`
      ])
      expect(existsSync(speech)).toBe(true) // giọng đọc có sẵn của Windows (System.Speech)
      // 3 giây im lặng + câu nói + 2 giây im lặng
      const audio = join(dir, 'clip.wav')
      execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', speech, '-af', 'adelay=3000:all=1,apad=pad_dur=2', '-ar', '48000', audio])
      const dur = Number(
        execFileSync(
          join(root, 'resources', 'ffmpeg', 'ffprobe.exe'),
          ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio],
          { encoding: 'utf8' }
        )
      )

      const project = createEmptyProject('t')
      const asset: MediaAsset = {
        id: 'a',
        kind: 'audio',
        path: audio,
        name: 'a',
        durationUs: Math.round(dur * S),
        width: null,
        height: null,
        fps: null,
        hasAudio: true
      }
      ops.addAssets(project, [asset])
      // Clip đặt ở giây thứ 1 trên timeline → câu nói bắt đầu khoảng giây thứ 4
      ops.addClip(project, ops.addTrack(project, 'audio'), createMediaClip(asset, 1 * S))

      const service = new CaptionService({ ffmpegExe: ffmpeg, whisperDir, modelsDir, tempDir: dir })
      const stages = new Set<string>()
      const captions = await service.generate(project, 'en', (p) => stages.add(p.stage))
      const text = captions
        .map((c) => c.text)
        .join(' ')
        .toLowerCase()
      expect(text).toContain('test')
      expect(text).toContain('caption')
      expect(captions[0].start).toBeGreaterThan(3.3 * S)
      expect(captions[0].start).toBeLessThan(4.5 * S)
      expect(captions[captions.length - 1].end).toBeLessThan(dur * S + 1 * S)
      expect([...stages]).toEqual(expect.arrayContaining(['prepare', 'detect', 'recognize']))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 180_000)
})
