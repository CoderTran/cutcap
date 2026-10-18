// Làm đẹp → Khuôn mặt: đọc thông số, hướng & độ lớn lực đẩy, điểm neo, công thức lấy mẫu ngược.
import { describe, expect, it } from 'vitest'
import {
  emptyFaceShape,
  faceWarpPushes,
  isFaceShapeEmpty,
  MAX_PUSHES,
  parseFaceShape,
  warpPushes,
  warpSource,
  type FaceShape,
  type Vec
} from '@shared/render/faceShape'

/** Khuôn mặt giả: tâm (500, 500), rộng 200 px (má 234 ↔ 454), trán 10 ở trên, cằm 152 ở dưới. */
function fakeFace(rotateDeg = 0): Vec[] {
  const pts: Vec[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }))
  const set = (i: number, x: number, y: number): void => {
    pts[i] = { x, y }
  }
  set(234, -100, 0)
  set(454, 100, 0)
  set(10, 0, -130)
  set(152, 0, 130)
  set(168, 0, -40)
  // Hàm 2 bên, từ ngang tai xuống gần cằm
  ;[93, 132, 58, 172, 136, 150, 149, 176].forEach((i, k) => set(i, -95 + k * 9, 10 + k * 15))
  ;[323, 361, 288, 397, 365, 379, 378, 400].forEach((i, k) => set(i, 95 - k * 9, 10 + k * 15))
  ;[127, 162, 21, 54].forEach((i, k) => set(i, -95 + k * 10, -30 - k * 22))
  ;[356, 389, 251, 284].forEach((i, k) => set(i, 95 - k * 10, -30 - k * 22))
  ;[148, 377].forEach((i, k) => set(i, k ? 15 : -15, 128))
  ;[109, 338, 67, 297].forEach((i, k) => set(i, [-25, 25, -50, 50][k], -125))
  ;[116, 345].forEach((i, k) => set(i, k ? 65 : -65, 5))
  set(61, -30, 70)
  set(291, 30, 70)
  set(0, 0, 60)
  set(17, 0, 85)
  set(13, 0, 68)
  set(14, 0, 74)
  set(1, 0, 20)
  ;[33, 133, 263, 362].forEach((i, k) => set(i, [-60, -25, 60, 25][k], -40))
  const r = (rotateDeg * Math.PI) / 180
  return pts.map((p) => ({ x: 500 + p.x * Math.cos(r) - p.y * Math.sin(r), y: 500 + p.x * Math.sin(r) + p.y * Math.cos(r) }))
}

const shape = (changes: Partial<FaceShape>): FaceShape => ({ ...emptyFaceShape(), ...changes })

describe('khuôn mặt – thông số', () => {
  it('thanh 2 chiều −100…100, thanh thường 0…100; toàn 0 → null', () => {
    expect(parseFaceShape({ slim: -40, chin: -140, hairline: 30.6 })).toEqual(shape({ chin: -100, hairline: 31 }))
    expect(parseFaceShape({ slim: 0 })).toBeNull()
    expect(isFaceShapeEmpty(shape({ width: -5 }))).toBe(false)
  })
})

describe('khuôn mặt – lực đẩy', () => {
  it('thon gọn: hàm 2 bên đẩy VÀO giữa; có điểm neo giữ miệng / mắt; không chỉnh gì → không có lực', () => {
    const face = fakeFace()
    expect(faceWarpPushes(face, emptyFaceShape())).toEqual([])
    const pushes = faceWarpPushes(face, shape({ slim: 100 }))
    const leftJaw = pushes.find((p) => p.x === face[172].x && p.y === face[172].y)!
    const rightJaw = pushes.find((p) => p.x === face[397].x && p.y === face[397].y)!
    expect(leftJaw.dx).toBeGreaterThan(0)
    expect(rightJaw.dx).toBeLessThan(0)
    expect(Math.abs(leftJaw.dy)).toBeLessThan(0.01)
    const mouth = pushes.find((p) => p.x === face[61].x && p.y === face[61].y)!
    expect(mouth).toMatchObject({ dx: 0, dy: 0 })
  })

  it('cằm dương kéo xuống, âm kéo lên; chân tóc dương đẩy trán lên', () => {
    const face = fakeFace()
    const at = (pushes: ReturnType<typeof faceWarpPushes>, i: number) => pushes.find((p) => p.x === face[i].x && p.y === face[i].y)!
    expect(at(faceWarpPushes(face, shape({ chin: 100 })), 152).dy).toBeGreaterThan(0)
    expect(at(faceWarpPushes(face, shape({ chin: -100 })), 152).dy).toBeLessThan(0)
    expect(at(faceWarpPushes(face, shape({ hairline: 100 })), 10).dy).toBeLessThan(0)
  })

  it('mặt nghiêng 90°: "vào giữa" xoay theo trục khuôn mặt', () => {
    const face = fakeFace(90)
    const pushes = faceWarpPushes(face, shape({ slim: 100 }))
    const jaw = pushes.find((p) => p.x === face[172].x && p.y === face[172].y)!
    // Xoay 90°: trục ngang của mặt thành trục dọc của ảnh → lực đẩy theo y
    expect(Math.abs(jaw.dy)).toBeGreaterThan(Math.abs(jaw.dx) * 5)
  })

  it('lấy mẫu ngược: lực chồng nhau không cộng dồn; xa khuôn mặt không đổi; miệng gần như đứng yên', () => {
    const face = fakeFace()
    const pushes = faceWarpPushes(face, shape({ slim: 100, vline: 100 }))
    const maxPush = Math.max(...pushes.map((p) => Math.hypot(p.dx, p.dy)))
    for (const q of [face[172], face[150], face[136], { x: 430, y: 560 }]) {
      const s = warpSource(q, pushes)
      expect(Math.hypot(s.x - q.x, s.y - q.y)).toBeLessThanOrEqual(maxPush + 1e-9)
    }
    const far = warpSource({ x: 50, y: 50 }, pushes)
    expect(Math.hypot(far.x - 50, far.y - 50)).toBeLessThan(0.01)
    const m = warpSource(face[61], pushes)
    expect(Math.hypot(m.x - face[61].x, m.y - face[61].y)).toBeLessThan(maxPush * 0.35)
  })

  it('nhiều khuôn mặt: mặt lớn trước, không vượt giới hạn của shader, không cắt nửa chừng 1 mặt', () => {
    const all = shape({
      slim: 50,
      thin: 50,
      width: 50,
      jaw: 50,
      cheekbone: 50,
      shorten: 50,
      vline: 50,
      chin: 50,
      lower: 50,
      middle: 50,
      upper: 50,
      hairline: 50
    })
    const one = faceWarpPushes(fakeFace(), all).length
    const pushes = warpPushes([fakeFace(), fakeFace(), fakeFace()], all)
    expect(pushes.length).toBeLessThanOrEqual(MAX_PUSHES)
    expect(pushes.length % one).toBe(0)
  })
})
