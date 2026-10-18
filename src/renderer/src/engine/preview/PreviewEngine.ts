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
import { clipAnimAt } from '@shared/render/clipAnims'
import { rateAt, sourceTimeAt } from '@shared/timeline/clipTime'
import { maskAt, transformAt } from '@shared/timeline/keyframes'
import { clampedSourceTime } from '@shared/timeline/transitions'
import { timedClipsBetween, visualLayersAt, type TimedClip } from '@shared/timeline/evaluate'
import { PREVIEW_ID, previewLoop, withTilePreview } from '@shared/timeline/tilePreview'
import { editorStore } from '../../state/editorStore'
import { mediaStore, pathKey } from '../../state/mediaStore'
import { projectStore } from '../../state/projectStore'
import { drawTextClip, type Rect } from '../text/drawText'
import { findEffect } from '@shared/render/effects'
import { EffectPainter } from '../effects/applyEffect'
import { BeautyPreview } from '../beauty/beautyPreview'
import { GradePreview } from '../grade/gradePreview'
import { MaskPreview } from '../mask/maskPreview'
import { PixelTransitionPreview } from '../transition/pixelTransitionPreview'
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
/** Video vừa nhảy tới chưa có hình: giữ khung cũ tối đa bấy nhiêu ms (thay vì chớp đen). */
const HOLD_MS = 600
/** Giới hạn độ phân giải canvas preview (cạnh dài) để máy yếu vẫn mượt. */
const MAX_CANVAS_SIDE = 1920

export class PreviewEngine {
  private readonly ctx: CanvasRenderingContext2D
  /** Một AudioContext cho cả preview: mọi tiếng đi qua đây (xem MediaElementPool). */
  private readonly audio = new AudioContext({ latencyHint: 'interactive' })
  private readonly pool = new MediaElementPool(() => this.requestRender(), this.audio)
  private readonly unsubscribers: (() => void)[] = []
  private readonly effects = new EffectPainter()
  private readonly beauty = new BeautyPreview(() => this.requestRender())
  private readonly grade = new GradePreview()
  private readonly masks = new MaskPreview()
  private readonly pixelTx = new PixelTransitionPreview()
  /** Khung hình gần nhất của mỗi clip video – vẽ thay khi phần tử đang tua (tránh chớp đen). */
  private readonly lastFrames = new Map<Id, { canvas: HTMLCanvasElement; time: number }>()
  /** Lúc bắt đầu giữ khung cũ chờ video có hình (0 = không giữ). */
  private holdSince = 0
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
        if (s.filterPreview !== prev.filterPreview || s.tilePreview !== prev.tilePreview) this.requestRender()
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
    // Bấm Phát: bỏ bản xem thử chữ / hiệu ứng (chuyển cảnh thì giữ – xem thử chuyển cảnh chính là phát một đoạn)
    if (editorStore.getState().tilePreview?.kind === 'clip') editorStore.getState().setTilePreview(null)
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
    let project = projectStore.getState().project
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

    // Đang chọn một ô (chưa thêm): vẽ dự án tạm có mục đó; chữ / hiệu ứng chạy lặp nên vẽ lại mỗi khung
    const preview = editorStore.getState().tilePreview
    if (preview) {
      project = withTilePreview(project, preview, t, Math.round((now - preview.startedAt) * 1000))
      if (preview.kind === 'clip' && previewLoop(preview.clip) > 0) this.dirty = true
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

      // Video đã xử lý âm thanh: phát file đã xử lý song song, tắt tiếng gốc của video
      const dub = this.dubFor(project, item, now)
      if (dub) inUse.add(dub.key)

      // Âm lượng (kể cả > 100% và fade) do GainNode đảm nhiệm; phần tử luôn để 100%
      const gain = item.track.muted ? 0 : clipGainAt(item.clip, t)
      this.pool.setGain(item.clip.id, dub || !item.asset.hasAudio ? 0 : gain)
      if (dub) this.pool.setGain(dub.key, gain)

      for (const m of dub ? [el, dub.el] : [el]) {
        // Uốn cong: tốc độ đổi liên tục theo vị trí trong clip (trình phát giữ cao độ giọng)
        const rate = Math.round(rateAt(item.clip, t) * 100) / 100
        if (Math.abs(m.playbackRate - rate) > 0.005) m.playbackRate = rate
        if (this.playing && !source.frozen) {
          if (m.paused) {
            m.currentTime = expected
            void m.play().catch(() => {}) // bị ngắt (vd. bấm dừng ngay) – bỏ qua
          } else if (!m.seeking && Math.abs(m.currentTime - expected) > MAX_DRIFT_SEC * Math.max(1, rate)) {
            // Lệch cho phép tăng theo tốc độ: ở 5× trình phát cần chút thời gian đuổi kịp – tua liên tục
            // sẽ không bao giờ kịp (và mỗi lần tua mất hình trong chốc lát)
            m.currentTime = expected
          }
        } else {
          if (!m.paused) m.pause()
          // Đang dừng: tua tới đúng frame (lệch dưới nửa frame thì thôi)
          if (!m.seeking && Math.abs(m.currentTime - expected) > frameSec / 2) m.currentTime = expected
        }
      }
    }

    // 2) Clip sắp tới: tạo sẵn phần tử và tua tới điểm bắt đầu, để lúc tới nơi là có hình ngay
    if (this.playing) {
      for (const item of timedClipsBetween(project, t + 1, t + PRELOAD_US)) {
        if (inUse.has(item.clip.id)) continue
        const el = this.elementFor(item, now)
        if (!el) continue
        inUse.add(item.clip.id)
        const dub = this.dubFor(project, item, now)
        if (dub) inUse.add(dub.key)
        const startSec = item.clip.sourceIn / MICROS_PER_SECOND
        for (const m of dub ? [el, dub.el] : [el]) {
          if (m.paused && !m.seeking && Math.abs(m.currentTime - startSec) > 0.05) m.currentTime = startSec
        }
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

  /** Phần tử phát file âm thanh đã xử lý (giảm ồn, đổi giọng…) của clip video; null nếu clip dùng tiếng gốc. */
  private dubFor(project: Project, item: TimedClip, now: number): { key: Id; el: HTMLMediaElement } | null {
    const id = item.clip.audioAssetId
    const asset = id ? project.assets[id] : undefined
    const url = asset ? this.playbackUrl(asset.path) : null
    if (!url) return null // chưa có file / chưa sẵn sàng → tạm phát tiếng gốc
    const key = `${item.clip.id}#audio`
    return { key, el: this.pool.mediaFor(key, url, 'audio', now) }
  }

  /** Chép khung hình hiện tại của video (chỉ khi đã sang khung mới) để dùng lại lúc phần tử đang tua. */
  private rememberFrame(clipId: Id, el: HTMLVideoElement): void {
    // Chỉ cần cỡ của khung Xem trước (video 4K: chép cả khung mỗi lần rất nặng)
    const k = Math.min(1, Math.max(this.canvas.width, this.canvas.height) / Math.max(el.videoWidth, el.videoHeight))
    const w = Math.max(1, Math.round(el.videoWidth * k))
    const h = Math.max(1, Math.round(el.videoHeight * k))
    let entry = this.lastFrames.get(clipId)
    if (entry && entry.time === el.currentTime && entry.canvas.width === w) return
    if (!entry) {
      entry = { canvas: document.createElement('canvas'), time: -1 }
      this.lastFrames.set(clipId, entry)
    }
    if (entry.canvas.width !== w || entry.canvas.height !== h) {
      entry.canvas.width = w
      entry.canvas.height = h
    }
    entry.canvas.getContext('2d')!.drawImage(el, 0, 0, w, h)
    entry.time = el.currentTime
  }

  // ───────── Vẽ ─────────

  /** Có lớp video chưa có hình nào để vẽ (vừa nhảy tới, phần tử đang tua và chưa từng có khung hình)? */
  private videoPending(layers: ReturnType<typeof visualLayersAt>): boolean {
    return layers.some(({ clip, asset }) => {
      if (asset?.kind !== 'video' || this.lastFrames.has(clip.id)) return false
      const el = this.pool.existing(clip.id)
      return !(el instanceof HTMLVideoElement && el.readyState >= 2 && el.videoWidth > 0 && !el.seeking)
    })
  }

  private draw(project: Project, t: Micros): void {
    const { ctx, canvas } = this
    const W = canvas.width
    const H = canvas.height
    const layers = visualLayersAt(project, t)
    // Video chưa có hình: giữ nguyên khung cũ một chút thay vì chớp đen (tối đa HOLD_MS, phòng file hỏng)
    if (this.videoPending(layers)) {
      const now = performance.now()
      this.holdSince ||= now
      if (now - this.holdSince < HOLD_MS) {
        this.dirty = true
        return
      }
    } else this.holdSince = 0
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = project.settings.backgroundColor
    ctx.fillRect(0, 0, W, H)

    const layout: LayerBox[] = []
    const selected = editorStore.getState().selectedClipIds
    const beautyVisible = new Set<Id>()
    for (const layer of layers) {
      const { clip, asset } = layer
      if (clip.type === 'effect') {
        // Hiệu ứng: tác động lên mọi thứ đã vẽ (các track bên dưới), thời gian tính từ đầu clip
        const def = findEffect(clip.effectId)
        if (def) this.effects.apply(ctx, def, W, H, (t - clip.start) / MICROS_PER_SECOND)
        continue
      }
      if (clip.type === 'text') {
        // Đang dừng và đang chọn chữ → hiện chữ đầy đủ (bỏ qua hiệu ứng xuất hiện) để dễ chỉnh sửa
        const editing = !this.playing && (clip.animationIn !== 'none' || !!clip.textIn || !!clip.textOut) && selected.includes(clip.id)
        const rect = drawTextClip(ctx, editing ? { ...clip, animationIn: 'none', textIn: null, textOut: null } : clip, W, H, t)
        if (rect && clip.id !== PREVIEW_ID) layout.push({ clipId: clip.id, rect })
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
        // readyState >= 2: đã có ít nhất 1 khung hình để vẽ. Đang tua thì phần tử chưa có hình mới
        // → vẽ lại khung hình gần nhất của clip (không chớp đen khi tua / khi đuổi theo tốc độ cao)
        if (el instanceof HTMLVideoElement && el.readyState >= 2 && el.videoWidth > 0 && !el.seeking) {
          source = el
          srcW = el.videoWidth
          srcH = el.videoHeight
          this.rememberFrame(clip.id, el)
        } else {
          const last = this.lastFrames.get(clip.id)
          if (last) {
            source = last.canvas
            srcW = last.canvas.width
            srcH = last.canvas.height
          }
        }
      }
      if (!source) continue
      beautyVisible.add(clip.id)

      // Làm đẹp (nhận diện mặt + làm mịn, trắng da…): thay nguồn bằng khung hình đã làm đẹp, giữ nguyên kích thước gốc
      if (clip.type === 'media' && (clip.beauty || clip.faceShape)) {
        const frameKey = source instanceof HTMLVideoElement ? source.currentTime : 0
        const pretty = this.beauty.apply(clip.id, clip.beauty, clip.faceShape, source, srcW, srcH, frameKey)
        if (pretty) source = pretty
      }
      // Điều chỉnh màu (sau làm đẹp – cùng thứ tự với lúc xuất)
      if (clip.type === 'media' && clip.grade) {
        const frameKey = layer.asset?.kind === 'video' ? sourceTimeAt(clip, t) / MICROS_PER_SECOND : 0
        const graded = this.grade.apply(clip.id, clip.grade, source, srcW, srcH, frameKey)
        if (graded) source = graded
      }
      // Mặt nạ: phần ngoài vùng giữ lại trong suốt (lộ track bên dưới) – gắn theo khung hình của clip
      const mask = clip.type === 'media' ? maskAt(clip, t) : null
      if (mask) source = this.masks.apply(clip.id, mask, source, srcW, srcH)
      // Biến đổi tại t (keyframe) + hiệu ứng động Vào/Ra/Kết hợp cộng dồn lên trên (giống khi xuất)
      const tf = transformAt(clip, t)
      // Chuyển cảnh làm méo điểm ảnh (gợn sóng, sóng sọc, khảm ô…) – sau mặt nạ, cùng thứ tự với lúc xuất.
      // Xử lý ở đúng cỡ lớp hiện trên khung (video 4K mà khung nhỏ → nhẹ hơn hàng chục lần, không giật)
      if (layer.pixel.length > 0) {
        const side = Math.ceil(Math.max(W, H) * Math.max(1, tf.scale))
        source = this.pixelTx.apply(clip.id, layer.pixel, source, srcW, srcH, side) ?? source
      }
      const anim = clip.type === 'media' ? clipAnimAt(clip, t) : null
      const p = placeLayer(
        srcW,
        srcH,
        W,
        H,
        anim
          ? {
              x: tf.x + anim.dx,
              y: tf.y + anim.dy,
              scale: tf.scale * anim.scale,
              rotation: tf.rotation + anim.rot,
              opacity: tf.opacity * anim.alpha
            }
          : tf
      )
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
      if (anim && anim.sx !== 1) ctx.scale(anim.sx, 1) // lật như tấm thẻ
      ctx.drawImage(source, -p.width / 2, -p.height / 2, p.width, p.height)
      ctx.restore()
      layout.push({ clipId: clip.id, rect: { x: p.cx - p.width / 2, y: p.cy - p.height / 2, w: p.width, h: p.height } })
    }
    this.beauty.sweep(beautyVisible)
    this.grade.sweep(beautyVisible)
    this.masks.sweep(beautyVisible)
    this.pixelTx.sweep(beautyVisible)
    for (const id of this.lastFrames.keys()) if (!beautyVisible.has(id)) this.lastFrames.delete(id)
    this.layout = layout
    this.layoutListener?.(layout)
  }
}
