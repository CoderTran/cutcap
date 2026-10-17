// Kho các phần tử <video>/<audio>/<img> dùng cho preview.
//
// - Mỗi CLIP video/âm thanh có phần tử riêng (2 clip cắt từ cùng một file có thể chạy cùng lúc
//   ở 2 vị trí khác nhau, nên không dùng chung được).
// - Ảnh tĩnh dùng chung theo URL (chỉ cần giải mã 1 lần).
// - Phần tử không dùng tới một lúc sẽ bị giải phóng để không chiếm bộ nhớ/giải mã GPU.
// Các phần tử không cần gắn vào trang (DOM) – Chromium vẫn giải mã và phát tiếng bình thường.
//
// ÂM THANH: tiếng của mỗi phần tử đi qua Web Audio:  <video> → GainNode → loa.
// GainNode cho phép âm lượng > 100% và thay đổi mượt (fade) – thuộc tính el.volume chỉ tới 100%.
import type { Id } from '@shared/project/schema'

interface PooledMedia {
  el: HTMLMediaElement
  url: string
  lastUsed: number
  source: MediaElementAudioSourceNode
  gain: GainNode
}

/** Phần tử không dùng quá bấy nhiêu ms thì giải phóng. */
const IDLE_DISPOSE_MS = 5000

export class MediaElementPool {
  private readonly media = new Map<Id, PooledMedia>()
  private readonly images = new Map<string, HTMLImageElement>()

  /**
   * @param onFrameReady gọi khi có khung hình mới để vẽ (tua xong, tải xong…)
   * @param audio        AudioContext chung cho cả preview
   */
  constructor(
    private readonly onFrameReady: () => void,
    private readonly audio: AudioContext
  ) {}

  /** Lấy (hoặc tạo) phần tử phát cho một clip. Đổi URL nếu proxy vừa tạo xong. */
  mediaFor(clipId: Id, url: string, kind: 'video' | 'audio', now: number): HTMLMediaElement {
    let entry = this.media.get(clipId)
    if (!entry) {
      const el = document.createElement(kind)
      el.preload = 'auto'
      el.crossOrigin = 'anonymous' // giao thức cutcap-media đã cho phép CORS
      if (el instanceof HTMLVideoElement) el.playsInline = true
      // Có khung hình mới → vẽ lại preview
      el.addEventListener('seeked', this.onFrameReady)
      el.addEventListener('loadeddata', this.onFrameReady)
      el.src = url
      // Mỗi phần tử chỉ tạo được MỘT MediaElementSource trong suốt vòng đời của nó
      const source = this.audio.createMediaElementSource(el)
      const gain = this.audio.createGain()
      gain.gain.value = 0
      source.connect(gain).connect(this.audio.destination)
      entry = { el, url, lastUsed: now, source, gain }
      this.media.set(clipId, entry)
    } else if (entry.url !== url) {
      const time = entry.el.currentTime
      entry.el.src = url
      entry.el.currentTime = time
      entry.url = url
    }
    entry.lastUsed = now
    return entry.el
  }

  /**
   * Đặt âm lượng (0 = im, 1 = gốc, 2 = gấp đôi). Chuyển mượt trong ~10ms để không bị tiếng "lụp bụp".
   */
  setGain(clipId: Id, value: number): void {
    const entry = this.media.get(clipId)
    if (!entry) return
    const param = entry.gain.gain
    if (Math.abs(param.value - value) < 0.001) return
    // Hủy lịch cũ trước khi đặt mới – hàm này được gọi mỗi khung hình khi đang fade
    param.cancelScheduledValues(this.audio.currentTime)
    param.setTargetAtTime(value, this.audio.currentTime, 0.01)
  }

  /** Phần tử của clip nếu đã có (không tạo mới). */
  existing(clipId: Id): HTMLMediaElement | undefined {
    return this.media.get(clipId)?.el
  }

  imageFor(url: string): HTMLImageElement {
    let img = this.images.get(url)
    if (!img) {
      img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.addEventListener('load', this.onFrameReady)
      img.src = url
      this.images.set(url, img)
    }
    return img
  }

  /** Dừng mọi phần tử không nằm trong danh sách đang dùng; giải phóng phần tử bỏ không lâu. */
  sweep(inUse: Set<Id>, now: number): void {
    for (const [clipId, entry] of this.media) {
      if (inUse.has(clipId)) continue
      if (!entry.el.paused) entry.el.pause()
      if (now - entry.lastUsed > IDLE_DISPOSE_MS) {
        this.dispose(entry)
        this.media.delete(clipId)
      }
    }
  }

  pauseAll(): void {
    for (const { el } of this.media.values()) if (!el.paused) el.pause()
  }

  destroy(): void {
    for (const entry of this.media.values()) this.dispose(entry)
    this.media.clear()
    this.images.clear()
  }

  private dispose({ el, source, gain }: PooledMedia): void {
    source.disconnect()
    gain.disconnect()
    el.pause()
    el.removeEventListener('seeked', this.onFrameReady)
    el.removeEventListener('loadeddata', this.onFrameReady)
    // Bỏ src + load() là cách chuẩn để trình duyệt giải phóng bộ giải mã ngay
    el.removeAttribute('src')
    el.load()
  }
}
