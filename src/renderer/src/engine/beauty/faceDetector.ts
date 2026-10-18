// Nhận diện khuôn mặt (MediaPipe Face Landmarker, Apache-2.0) – 478 điểm trên mỗi khuôn mặt.
// Chạy ngay trên máy (WebAssembly + card đồ họa). File nằm ở public/mediapipe (npm run setup:face).
//
// Dùng chế độ IMAGE (mỗi khung hình độc lập) thay cho VIDEO: preview tua tới lui tự do, nhiều clip cùng lúc,
// và lúc xuất cũng gọi đúng một cách → kết quả xem trước và video xuất ra giống nhau.
// Ảnh được thu nhỏ còn cạnh dài DETECT_SIZE trước khi nhận diện: nhanh hơn nhiều, điểm trả về là tỉ lệ 0–1.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

export interface Point {
  x: number
  y: number
}
/** Một khuôn mặt: 478 điểm, toạ độ tỉ lệ 0–1 theo khung hình. */
export type Face = Point[]

const DETECT_SIZE = 640
const MAX_FACES = 4

let landmarker: Promise<FaceLandmarker> | null = null
const scratch = document.createElement('canvas')

function load(): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const base = new URL('./mediapipe/', document.baseURI).href
    const fileset = await FilesetResolver.forVisionTasks(base)
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: `${base}face_landmarker.task`, delegate },
      runningMode: 'IMAGE' as const,
      numFaces: MAX_FACES,
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4
    })
    try {
      return await FaceLandmarker.createFromOptions(fileset, options('GPU'))
    } catch {
      // Máy không dùng được card đồ họa cho AI → chạy bằng CPU (chậm hơn nhưng vẫn đúng)
      return FaceLandmarker.createFromOptions(fileset, options('CPU'))
    }
  })()
  landmarker.catch(() => (landmarker = null))
  return landmarker
}

/** Nạp sẵn AI (lần đầu mất ~1 giây). */
export function preloadFaceDetector(): Promise<void> {
  return load().then(() => undefined)
}

let ready: FaceLandmarker | null = null

/** Tìm các khuôn mặt trong một khung hình (chờ nạp AI nếu chưa nạp). */
export async function detectFaces(source: CanvasImageSource, width: number, height: number): Promise<Face[]> {
  ready = await load()
  return detectWith(ready, source, width, height)
}

/**
 * Bản không chờ – dùng trong vòng vẽ của khung Xem trước.
 * @returns null nếu AI chưa nạp xong (đã bắt đầu nạp; khung sau gọi lại là có)
 */
export function detectFacesNow(source: CanvasImageSource, width: number, height: number): Face[] | null {
  if (!ready) {
    void load().then((fl) => (ready = fl))
    return null
  }
  return detectWith(ready, source, width, height)
}

function detectWith(fl: FaceLandmarker, source: CanvasImageSource, width: number, height: number): Face[] {
  const k = Math.min(1, DETECT_SIZE / Math.max(width, height))
  scratch.width = Math.max(1, Math.round(width * k))
  scratch.height = Math.max(1, Math.round(height * k))
  const ctx = scratch.getContext('2d')!
  ctx.drawImage(source, 0, 0, scratch.width, scratch.height)
  const result = fl.detect(scratch)
  return result.faceLandmarks.map((pts) => pts.map((p) => ({ x: p.x, y: p.y })))
}
