// Engine preview: đồng hồ phát, đồng bộ các video/âm thanh, và vẽ khung hình lên canvas.
//
// ĐỒNG HỒ: khi đang phát, thời gian = thời điểm bấm Play + thời gian thực đã trôi qua
//   (performance.now). Mọi video/âm thanh "chạy theo" đồng hồ này; lệch quá nhiều thì tua lại.
//   Cách này giữ hình và tiếng của nhiều clip luôn khớp nhau.
// VẼ: mỗi khung hình màn hình (requestAnimationFrame) – nhưng khi đang dừng thì chỉ vẽ lại
//   khi có gì thay đổi (tua, sửa dự án, video tải xong) để không tốn CPU/GPU.
import type { MediaPreview } from '@shared/ipc'
import type { Id, Project } from '@shared/project/schema'
import { MICROS_PER_SECOND, type Micros } from '@shared/project/time'
import { clipCssFilter } from '@shared/render/filters'
import { placeLayer } from '@shared/render/geometry'
import { projectDuration } from '@shared/timeline/clips'
import { clipGainAt } from '@shared/timeline/clipProps'
import { clampedSourceTime } from '@shared/timeline/transitions'
import { timedClipsBetween, visualLayersAt, type TimedClip } from '@shared/timeline/evaluate'
import { editorStore } from '../../state/editorStore'
import { mediaStore, pathKey } from '../../state/mediaStore'
import { projectStore } from '../../state/projectStore'
import { drawTextClip, type Rect } from '../text/drawText'
import { MediaElementPool } from './MediaElementPool'

/** Vị trí một lớp hình vừa vẽ (pixel canvas) – để bấm chọn và kéo trên khung preview. */
export interface LayerBox {
  clipId: Id
  rect: Rect
}

/** Khi đang phát, lệch quá bấy nhiêu giây so với đồng hồ thì tua video về đúng chỗ. */
const MAX_DRIFT_SEC = 0.15
/** Chuẩn bị (tải + tua sẵn) các clip sắp tới trong khoảng này, để chuyển clip không bị khựng. */
const PRELOAD_US = 2 * MICROS_PER_SECOND
/** Giới hạn độ phân giải canvas preview (cạnh dài) để máy yếu vẫn mượt. */
const MAX_CANVAS_SIDE = 1920

export class PreviewEngine {
  private readonly ctx: CanvasRenderingContext2D
  /** Một AudioContext cho cả preview: mọi tiếng đi qua đây (xem MediaElementPool). */
  private readonly audio = new AudioContext({ latencyHint: 'interactive' })
  private readonly pool = new MediaElementPool(() => this.requestRender(), this.audio)
  private readonly unsubscribers: (() => void)[] = []
  private raf = 0
  private dirty = true
  private playing = false
  /** Mốc đồng hồ: thời điểm trên timeline ứng với performance.now() lúc bấm Play. */
  private clock = { time: 0, now: 0 }
  /** Thời gian engine vừa ghi vào store – để phân biệt với việc người dùng tự tua. */
  private lastPublished = -1
  /** Các lớp hình của lần vẽ gần nhất, từ dưới lên trên. */
  private layout: LayerBox[] = []
  private layoutListener: ((layout: LayerBox[]) => void) | null = null

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Không tạo được canvas 2D')
    this.ctx = ctx

    // Dự án, media, hay đầu phát thay đổi → vẽ lại
    this.unsubscribers.push(
      projectStore.subscribe(() => this.requestRender()),
      mediaStore.subscribe(() => this.requestRender()),
      editorStore.subscribe((s, prev) => {
        // Đổi clip đang chọn → vẽ lại khung chọn trên preview
        // (vẽ lại luôn: chữ đang chọn được hiện đầy đủ, bỏ qua hiệu ứng xuất hiện)
        if (s.selectedClipIds !== prev.selectedClipIds) {
          this.layoutListener?.(this.layout)
          this.requestRender()
        }
        if (s.filterPreview !== prev.filterPreview) this.requestRender()
        if (s.currentTime === prev.currentTime) return
        // Người dùng tự tua (bấm thước, phím mũi tên) trong lúc đang phát → đặt lại mốc đồng hồ
        if (this.playing && s.currentTime !== this.lastPublished) this.resetClock(s.currentTime)
        this.requestRender()
      })
    )
    this.raf = requestAnimationFrame(this.tick)
  }

  get isPlaying(): boolean {
    return this.playing
  }

  play(): void {
    if (this.playing) return
    const project = projectStore.getState().project
    const duration = projectDuration(project)
    if (duration === 0) return
    let t = editorStore.getState().currentTime
    if (t >= duration) t = 0 // đang ở cuối → phát lại từ đầu
    this.playing = true
    void this.audio.resume() // trình duyệt có thể tạm treo AudioContext khi chưa dùng
    this.resetClock(t)
    this.publish(t)
    editorStore.getState().setPlaying(true)
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    this.pool.pauseAll()
    editorStore.getState().setPlaying(false)
    this.requestRender()
  }

  /** Canvas đổi kích thước (panel co giãn) → đặt lại độ phân giải vẽ. */
  resize(cssWidth: number, cssHeight: number): void {
    const dpr = window.devicePixelRatio || 1
    const scale = Math.min(dpr, MAX_CANVAS_SIDE / Math.max(cssWidth, cssHeight, 1))
    this.canvas.width = Math.max(1, Math.round(cssWidth * scale))
    this.canvas.height = Math.max(1, Math.round(cssHeight * scale))
    this.requestRender()
  }

  requestRender(): void {
    this.dirty = true
  }

  /** Nhận vị trí các lớp hình mỗi khi vẽ xong (dùng cho khung chọn trên preview). */
  setLayoutListener(listener: ((layout: LayerBox[]) => void) | null): void {
    this.layoutListener = listener
    listener?.(this.layout)
  }

  /** Lớp hình trên cùng tại điểm (x, y) – toạ độ pixel canvas. */
  hitTest(x: number, y: number): Id | null {
    for (let i = this.layout.length - 1; i >= 0; i--) {
      const { clipId, rect } = this.layout[i]
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return clipId
    }
    return null
  }

  get canvasSize(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height }
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.unsubscribers.forEach((u) => u())
    this.pool.destroy()
    void this.audio.close()
  }

  // ───────── Vòng lặp chính ─────────

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick)
    const project = projectStore.getState().project
    let t = editorStore.getState().currentTime

    if (this.playing) {
      t = this.clock.time + Math.round((now - this.clock.now) * 1000)
      const duration = projectDuration(project)
      if (t >= duration) {
        t = duration
        this.publish(t)
        this.pause()
      } else {
        this.publish(t)
      }
    }

    this.syncMedia(project, t, now)
    if (this.playing || this.dirty) {
      this.dirty = false
      this.draw(project, t)
    }
  }

  private resetClock(t: Micros): void {
    this.clock = { time: t, now: performance.now() }
  }

  private publish(t: Micros): void {
    this.lastPublished = Math.round(t)
    editorStore.getState().setCurrentTime(t)
  }

  // ───────── Đồng bộ video/âm thanh với đồng hồ ─────────

  private playbackUrl(path: string): string | null {
    const preview: MediaPreview | undefined = mediaStore.getState().previews[pathKey(path)]
    return preview?.playbackUrl ?? null
  }

  private syncMedia(project: Project, t: Micros, now: number): void {
    const inUse = new Set<Id>()
    const frameSec = 1 / project.settings.fps

    // 1) Clip đang chạy tại t
    for (const item of timedClipsBetween(project, t, t)) {
      const el = this.elementFor(item, now)
      if (!el) continue
      inUse.add(item.clip.id)
      // Ngoài đoạn có hình của file (do chuyển cảnh kéo dài clip) → "đóng băng" ở khung đầu/cuối
      const source = clampedSourceTime(item.clip, item.asset, t)
      const expected = source.time / MICROS_PER_SECOND

      // Âm lượng (kể cả > 100% và fade) do GainNode đảm nhiệm; phần tử luôn để 100%
      const silent = item.track.muted || !item.asset.hasAudio
      this.pool.setGain(item.clip.id, silent ? 0 : clipGainAt(item.clip, t))
      if (el.playbackRate !== item.clip.speed) el.playbackRate = item.clip.speed

      if (this.playing && !source.frozen) {
        if (el.paused) {
          el.currentTime = expected
          void el.play().catch(() => {}) // bị ngắt (vd. bấm dừng ngay) – bỏ qua
        } else if (!el.seeking && Math.abs(el.currentTime - expected) > MAX_DRIFT_SEC) {
          el.currentTime = expected
        }
      } else {
        if (!el.paused) el.pause()
        // Đang dừng: tua tới đúng frame (lệch dưới nửa frame thì thôi)
        if (!el.seeking && Math.abs(el.currentTime - expected) > frameSec / 2) el.currentTime = expected
      }
    }

    // 2) Clip sắp tới: tạo sẵn phần tử và tua tới điểm bắt đầu, để lúc tới nơi là có hình ngay
    if (this.playing) {
      for (const item of timedClipsBetween(project, t + 1, t + PRELOAD_US)) {
        if (inUse.has(item.clip.id)) continue
        const el = this.elementFor(item, now)
        if (!el) continue
        inUse.add(item.clip.id)
        const startSec = item.clip.sourceIn / MICROS_PER_SECOND
        if (el.paused && !el.seeking && Math.abs(el.currentTime - startSec) > 0.05) el.currentTime = startSec
      }
    }

    // 3) Dừng / giải phóng phần còn lại
    this.pool.sweep(inUse, now)
  }

  private elementFor(item: TimedClip, now: number): HTMLMediaElement | null {
    const url = this.playbackUrl(item.asset.path)
    if (!url) return null // proxy chưa tạo xong
    return this.pool.mediaFor(item.clip.id, url, item.asset.kind === 'audio' ? 'audio' : 'video', now)
  }

  // ───────── Vẽ ─────────

  private draw(project: Project, t: Micros): void {
    const { ctx, canvas } = this
    const W = canvas.width
    const H = canvas.height
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = project.settings.backgroundColor
    ctx.fillRect(0, 0, W, H)

    const layout: LayerBox[] = []
    const selected = editorStore.getState().selectedClipIds
    for (const layer of visualLayersAt(project, t)) {
      const { clip, asset } = layer
      if (clip.type === 'text') {
        // Đang dừng và đang chọn chữ → hiện chữ đầy đủ (bỏ qua hiệu ứng xuất hiện) để dễ chỉnh sửa
        const editing = !this.playing && clip.animationIn !== 'none' && selected.includes(clip.id)
        const rect = drawTextClip(ctx, editing ? { ...clip, animationIn: 'none' } : clip, W, H, t)
        if (rect) layout.push({ clipId: clip.id, rect })
        continue
      }
      if (!asset) continue

      let source: CanvasImageSource | null = null
      let srcW = 0
      let srcH = 0
      if (asset.kind === 'image') {
        const url = this.playbackUrl(asset.path)
        const img = url ? this.pool.imageFor(url) : null
        if (img?.complete && img.naturalWidth > 0) {
          source = img
          srcW = img.naturalWidth
          srcH = img.naturalHeight
        }
      } else {
        const el = this.pool.existing(clip.id)
        // readyState >= 2: đã có ít nhất 1 khung hình để vẽ
        if (el instanceof HTMLVideoElement && el.readyState >= 2 && el.videoWidth > 0) {
          source = el
          srcW = el.videoWidth
          srcH = el.videoHeight
        }
      }
      if (!source) continue

      const p = placeLayer(srcW, srcH, W, H, clip.transform)
      const fx = layer.effect
      ctx.save()
      // Chuyển cảnh "phóng to": phóng cả lớp quanh TÂM KHUNG (giống zoompan của FFmpeg khi xuất)
      if (fx.frameZoom !== 1) {
        ctx.translate(W / 2, H / 2)
        ctx.scale(fx.frameZoom, fx.frameZoom)
        ctx.translate(-W / 2, -H / 2)
      }
      ctx.globalAlpha = p.opacity * fx.alpha
      // Xem thử bộ lọc khi rê chuột trên panel (không đổi dữ liệu dự án)
      const hover = editorStore.getState().filterPreview
      ctx.filter = clip.type === 'media' ? clipCssFilter(clip, hover?.clipId === clip.id ? hover : undefined) : 'none'
      ctx.translate(p.cx + fx.offsetX * W, p.cy)
      ctx.rotate(p.rotation)
      ctx.drawImage(source, -p.width / 2, -p.height / 2, p.width, p.height)
      ctx.restore()
      layout.push({ clipId: clip.id, rect: { x: p.cx - p.width / 2, y: p.cy - p.height / 2, w: p.width, h: p.height } })
    }
    this.layout = layout
    this.layoutListener?.(layout)
  }
}
