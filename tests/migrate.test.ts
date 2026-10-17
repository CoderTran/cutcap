import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import {
  ProjectFormatError,
  parseProject,
  parseProjectJson,
  serializeProject
} from '@shared/project/migrate'
import { PROJECT_FORMAT_VERSION, type Project } from '@shared/project/schema'

function sampleProject(): Project {
  const p = createEmptyProject('Video du lịch', new Date('2026-01-01T00:00:00Z'))
  p.assets['a1'] = {
    id: 'a1',
    kind: 'video',
    path: 'C:\\Videos\\bien.mp4',
    name: 'bien.mp4',
    durationUs: 10_000_000,
    width: 1920,
    height: 1080,
    fps: 30,
    hasAudio: true
  }
  p.tracks[0].clips.push({
    id: 'c1',
    type: 'media',
    assetId: 'a1',
    start: 0,
    duration: 5_000_000,
    sourceIn: 1_000_000,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    filter: null,
    filterIntensity: 1,
    adjust: { brightness: 0, contrast: 0, saturation: 0 },
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
    transitionIn: null,
    vocalsRemovedFrom: null,
    animIn: null,
    animOut: null,
    animCombo: null,
    audioFx: null,
    audioAssetId: null,
    loudnorm: null,
    keyframes: {}
  })
  return p
}

function expectCode(fn: () => unknown, code: ProjectFormatError['code']): void {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(ProjectFormatError)
    expect((err as ProjectFormatError).code).toBe(code)
    return
  }
  throw new Error('Phải báo lỗi nhưng không báo')
}

describe('đọc/ghi định dạng dự án', () => {
  it('ghi rồi đọc lại cho kết quả giống hệt', () => {
    const p = sampleProject()
    expect(parseProjectJson(serializeProject(p))).toEqual(p)
  })

  it('báo lỗi rõ ràng với dữ liệu sai', () => {
    expectCode(() => parseProjectJson('{ không phải json'), 'invalid-json')
    expectCode(() => parseProject({ hello: 'world' }), 'not-a-project')
    expectCode(() => parseProject({ ...sampleProject(), formatVersion: PROJECT_FORMAT_VERSION + 1 }), 'too-new')
    expectCode(() => parseProject({ ...sampleProject(), tracks: [{ id: 't', kind: 'lạ', clips: [] }] }), 'corrupted')
  })

  it('điền giá trị mặc định và kẹp giá trị ngoài giới hạn', () => {
    const raw = JSON.parse(serializeProject(sampleProject()))
    delete raw.settings
    raw.tracks[0].clips[0].speed = 99
    raw.tracks[0].clips[0].volume = -5
    delete raw.tracks[0].clips[0].adjust

    const p = parseProject(raw)
    expect(p.settings.aspectRatio).toBe('16:9')
    const clip = p.tracks[0].clips[0]
    if (clip.type !== 'media') throw new Error('sai loại clip')
    expect(clip.speed).toBe(4)
    expect(clip.volume).toBe(0)
    expect(clip.adjust).toEqual({ brightness: 0, contrast: 0, saturation: 0 })
  })

  it('sắp xếp lại clip theo thời gian bắt đầu', () => {
    const raw = JSON.parse(serializeProject(sampleProject()))
    const c = raw.tracks[0].clips[0]
    raw.tracks[0].clips = [{ ...c, id: 'c2', start: 9_000_000 }, c]
    expect(parseProject(raw).tracks[0].clips.map((x) => x.id)).toEqual(['c1', 'c2'])
  })
})
