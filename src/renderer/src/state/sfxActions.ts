// Hiệu ứng âm thanh (tự tạo + có sẵn trong bộ cài) + Thư viện âm thanh của bạn (file trên máy): nghe thử,
// thêm vào timeline (tại đầu phát, trên track âm thanh còn trống).
import { createStore, useStore } from 'zustand'
import { sfxById } from '@shared/audio/sfxCatalog'
import type { SoundLibrary, SoundLibraryItem } from '@shared/audio/soundLibrary'
import * as ops from '@shared/project/ops'
import type { Id, MediaAsset } from '@shared/project/schema'
import { canPlace, createMediaClip } from '@shared/timeline/clips'
import { encodeWav, renderSfx } from '../engine/sfx/sfxSynth'
import { localImageUrl } from './coverActions'
import { editorStore } from './editorStore'
import { projectStore } from './projectStore'

const samePath = (a: string, b: string): boolean => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()

/** `playing` / `adding`: id hiệu ứng tự tạo, hoặc đường dẫn file của thư viện. */
const sfxStore = createStore<{ playing: string | null; adding: string | null; library: SoundLibrary | null; scanning: boolean }>()(() => ({
  playing: null,
  adding: null,
  library: null,
  scanning: false
}))
export const useSfxPlaying = (): string | null => useStore(sfxStore, (s) => s.playing)
export const useSfxAdding = (): string | null => useStore(sfxStore, (s) => s.adding)
export const useSoundLibrary = (): SoundLibrary | null => useStore(sfxStore, (s) => s.library)
export const useSoundLibraryScanning = (): boolean => useStore(sfxStore, (s) => s.scanning)

// ───────── Nghe thử ─────────

const buffers = new Map<string, Promise<AudioBuffer>>()
const bufferOf = (id: string): Promise<AudioBuffer> => {
  let b = buffers.get(id)
  if (!b) {
    b = renderSfx(id)
    buffers.set(id, b)
  }
  return b
}

/** Đường dẫn file của hiệu ứng có sẵn (resources/sfx/kenney/…). */
let bundledDir: Promise<string> | null = null
const bundledPath = async (file: string): Promise<string> => `${await (bundledDir ??= window.cutcap.sfxBundledDir())}\\${file}`

let audioCtx: AudioContext | null = null
let current: AudioBufferSourceNode | null = null
let element: HTMLAudioElement | null = null

export function stopSfxPreview(): void {
  if (current) {
    current.onended = null
    current.stop()
    current = null
  }
  if (element) {
    element.onended = null
    element.pause()
    element = null
  }
  sfxStore.setState({ playing: null })
}

/** Bấm vào hiệu ứng: phát thử (bấm lại khi đang phát = dừng). */
export async function toggleSfxPreview(id: string): Promise<void> {
  const file = sfxById(id)?.file
  if (file) return toggleFilePreview(id, () => bundledPath(file))
  const wasPlaying = sfxStore.getState().playing
  stopSfxPreview()
  if (wasPlaying === id) return
  const buffer = await bufferOf(id)
  audioCtx ??= new AudioContext()
  const src = audioCtx.createBufferSource()
  src.buffer = buffer
  src.connect(audioCtx.destination)
  src.onended = () => {
    if (current === src) {
      current = null
      sfxStore.setState({ playing: null })
    }
  }
  current = src
  sfxStore.setState({ playing: id })
  src.start()
}

/** Bấm vào âm thanh trong thư viện: phát thử file (file video → tách âm thanh trước). */
export const toggleLibraryPreview = (item: SoundLibraryItem): Promise<void> => toggleFilePreview(item.path, () => playablePath(item))

/** Phát thử một file âm thanh trên máy. @param key mã để biết dòng nào đang phát */
async function toggleFilePreview(key: string, getPath: () => Promise<string | null>): Promise<void> {
  const wasPlaying = sfxStore.getState().playing
  stopSfxPreview()
  if (wasPlaying === key) return
  sfxStore.setState({ playing: key })
  const path = await getPath()
  if (sfxStore.getState().playing !== key) return // đã bấm sang âm thanh khác trong lúc chờ
  if (!path) return void sfxStore.setState({ playing: null })
  const el = new Audio(localImageUrl(path))
  el.onended = () => {
    if (element === el) {
      element = null
      sfxStore.setState({ playing: null })
    }
  }
  element = el
  el.play().catch(() => stopSfxPreview())
}

/** File video (mp4, mpeg…) → tách lấy âm thanh (FFmpeg, có bộ nhớ đệm); file âm thanh → dùng luôn. */
async function playablePath(item: Pick<SoundLibraryItem, 'path' | 'fromVideo'>): Promise<string | null> {
  if (!item.fromVideo) return item.path
  const r = await window.cutcap.extractAudio(item.path)
  return r.ok ? r.path : null
}

// ───────── Thêm vào timeline ─────────

/**
 * Thêm file âm thanh vào timeline tại đầu phát: track âm thanh đầu tiên còn trống chỗ đó, không có thì tạo track mới.
 * Thêm media (nếu chưa có) + thêm clip = 1 bước Undo.
 */
async function addAudioFile(key: string, getPath: () => Promise<string | null>, name: string): Promise<Id | null> {
  if (sfxStore.getState().adding) return null
  sfxStore.setState({ adding: key })
  try {
    const path = await getPath()
    if (!path) return null
    let asset: MediaAsset | undefined = Object.values(projectStore.getState().project.assets).find((a) => samePath(a.path, path))
    const isNew = !asset
    if (!asset) {
      const [result] = await window.cutcap.importMedia([path])
      if (!result?.ok) return null
      asset = { ...result.asset, name }
    }
    const start = editorStore.getState().currentTime
    const clip = createMediaClip(asset, start)
    const media = asset
    projectStore.getState().apply('history.addSoundEffect', (d) => {
      if (isNew) ops.addAssets(d, [media])
      const free = d.tracks.find((t) => t.kind === 'audio' && !t.locked && canPlace(t, start, clip.duration))
      ops.addClip(d, free?.id ?? ops.addTrack(d, 'audio'), clip)
    })
    editorStore.getState().setSelection([clip.id])
    return clip.id
  } finally {
    sfxStore.setState({ adding: null })
  }
}

/** Hiệu ứng có sẵn → dùng file trong bộ cài; tự tạo → ghi WAV vào thư mục của app. Rồi thêm vào timeline. @param name tên hiển thị (đã dịch) */
export const addSfxToTimeline = (id: string, name: string): Promise<Id | null> => {
  const file = sfxById(id)?.file
  return addAudioFile(id, async () => (file ? bundledPath(file) : window.cutcap.sfxSave(id, encodeWav(await bufferOf(id)))), name)
}

/** Âm thanh trong thư viện của bạn → thêm vào timeline. */
export const addLibrarySoundToTimeline = (item: SoundLibraryItem): Promise<Id | null> =>
  addAudioFile(item.path, () => playablePath(item), item.name)

// ───────── Thư viện âm thanh của bạn ─────────

async function runLibrary(job: () => Promise<SoundLibrary>): Promise<void> {
  sfxStore.setState({ scanning: true })
  try {
    sfxStore.setState({ library: await job() })
  } finally {
    sfxStore.setState({ scanning: false })
  }
}
export const loadSoundLibrary = (): Promise<void> => runLibrary(() => window.cutcap.soundLibraryGet())
export const pickSoundLibraryFolder = (): Promise<void> => runLibrary(() => window.cutcap.soundLibraryPick())
export const rescanSoundLibrary = (): Promise<void> => runLibrary(() => window.cutcap.soundLibraryRescan())
export const clearSoundLibrary = (): Promise<void> => runLibrary(() => window.cutcap.soundLibraryClear())
