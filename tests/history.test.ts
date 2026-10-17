import { describe, expect, it } from 'vitest'
import { commit, emptyHistory, redo, undo } from '../src/renderer/src/state/history'

interface Doc {
  count: number
  items: string[]
}
const initial: Doc = { count: 0, items: [] }

describe('history (Undo/Redo)', () => {
  it('ghi lại thao tác và hoàn tác/làm lại đúng', () => {
    let r = commit(initial, emptyHistory(), 'inc', (d) => {
      d.count += 1
    })
    r = commit(r.state, r.history, 'push', (d) => {
      d.items.push('a')
    })
    expect(r.state).toEqual({ count: 1, items: ['a'] })

    const u1 = undo(r.state, r.history)!
    expect(u1.state).toEqual({ count: 1, items: [] })
    const u2 = undo(u1.state, u1.history)!
    expect(u2.state).toEqual(initial)
    expect(undo(u2.state, u2.history)).toBeNull() // hết lịch sử

    const r1 = redo(u2.state, u2.history)!
    const r2 = redo(r1.state, r1.history)!
    expect(r2.state).toEqual({ count: 1, items: ['a'] })
    expect(redo(r2.state, r2.history)).toBeNull()
  })

  it('không ghi lịch sử nếu thao tác không thay đổi gì', () => {
    const h = emptyHistory()
    const r = commit(initial, h, 'noop', () => {})
    expect(r.state).toBe(initial)
    expect(r.history).toBe(h)
  })

  it('thao tác mới xóa nhánh Redo', () => {
    let r = commit(initial, emptyHistory(), 'a', (d) => {
      d.count = 1
    })
    const u = undo(r.state, r.history)!
    r = commit(u.state, u.history, 'b', (d) => {
      d.count = 2
    })
    expect(r.history.future).toHaveLength(0)
  })

  it('gộp các thao tác liên tiếp cùng coalesceKey thành 1 bước', () => {
    let r = { state: initial, history: emptyHistory() }
    for (let i = 1; i <= 5; i++) {
      r = commit(r.state, r.history, 'slide', (d) => void (d.count = i * 10), { coalesceKey: 'slider', now: i * 100 })
    }
    expect(r.history.past).toHaveLength(1)
    expect(r.state.count).toBe(50)
    expect(undo(r.state, r.history)!.state.count).toBe(0)
  })

  it('không gộp nếu cách nhau quá lâu', () => {
    let r = commit(initial, emptyHistory(), 's', (d) => void (d.count = 1), { coalesceKey: 'k', now: 0 })
    r = commit(r.state, r.history, 's', (d) => void (d.count = 2), { coalesceKey: 'k', now: 5000 })
    expect(r.history.past).toHaveLength(2)
  })

  it('giới hạn số bước lịch sử', () => {
    let r = { state: initial, history: emptyHistory() }
    for (let i = 0; i < 10; i++) r = commit(r.state, r.history, 'x', (d) => void (d.count += 1), { limit: 3 })
    expect(r.history.past).toHaveLength(3)
  })
})
