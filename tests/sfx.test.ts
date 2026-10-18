// Hiệu ứng âm thanh: danh sách khớp công thức tổng hợp / file có sẵn và bản dịch.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SFX_CATEGORIES, SFX_LIST as SFX } from '@shared/audio/sfxCatalog'
import en from '../src/renderer/src/i18n/en.json'
import vi from '../src/renderer/src/i18n/vi.json'

describe('hiệu ứng âm thanh', () => {
  it('mỗi hiệu ứng có tên tiếng Việt / tiếng Anh, id dùng được làm tên file', () => {
    expect(new Set(SFX.map((s) => s.id)).size).toBe(SFX.length)
    // (mỗi id có công thức tổng hợp: TypeScript kiểm tra – RECIPES: Record<SfxId, …> trong sfxSynth.ts)
    for (const s of SFX) {
      expect(s.id).toMatch(/^[a-zA-Z0-9]{1,40}$/)
      expect(vi.sfx.items[s.id as keyof typeof vi.sfx.items]).toBeTruthy()
      expect(en.sfx.items[s.id as keyof typeof en.sfx.items]).toBeTruthy()
      expect(s.categories.length).toBeGreaterThan(0)
    }
  })

  it('mỗi nhóm có ít nhất 2 hiệu ứng và có tên', () => {
    for (const c of SFX_CATEGORIES) {
      expect(SFX.filter((s) => s.categories.includes(c)).length).toBeGreaterThanOrEqual(2)
      expect(vi.sfx.categories[c]).toBeTruthy()
    }
  })

  it('hiệu ứng có sẵn (Kenney): file .ogg nằm trong resources/sfx/kenney, kèm giấy phép CC0', () => {
    const dir = join(__dirname, '..', 'resources', 'sfx', 'kenney')
    const bundled = SFX.filter((s) => s.file)
    expect(bundled.length).toBeGreaterThan(100)
    for (const s of bundled) expect(existsSync(join(dir, s.file!)), s.file).toBe(true)
    expect(readFileSync(join(dir, 'License.txt'), 'utf8')).toContain('Creative Commons Zero, CC0')
  })
})
