import { describe, expect, it } from 'vitest'
import { emptyFavorites, parseFavorites, toggleFavoriteIn } from '@shared/favorites'

describe('yêu thích', () => {
  it('bật / tắt: mục mới lên đầu, bấm lại thì bỏ', () => {
    let f = emptyFavorites()
    f = toggleFavoriteIn(f, 'filter', 'warm')
    f = toggleFavoriteIn(f, 'filter', 'cool')
    expect(f.filter).toEqual(['cool', 'warm'])
    f = toggleFavoriteIn(f, 'filter', 'warm')
    expect(f.filter).toEqual(['cool'])
    expect(f.effect).toEqual([])
  })

  it('đọc file: bỏ loại lạ, mục sai kiểu, trùng lặp; file hỏng → rỗng', () => {
    const f = parseFavorites({ filter: ['a', 'a', 3, '', 'b'], bogus: ['x'], sfx: 'nope' })
    expect(f.filter).toEqual(['a', 'b'])
    expect(f.sfx).toEqual([])
    expect('bogus' in f).toBe(false)
    expect(parseFavorites(null)).toEqual(emptyFavorites())
  })
})
