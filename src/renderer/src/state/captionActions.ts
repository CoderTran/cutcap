// Phụ đề tự động (tab Văn bản → Phụ đề tự động): trạng thái + lệnh tạo / hủy.
// Nhận dạng chạy ở main process (whisper.cpp); xong thì thêm phụ đề lên timeline trong 1 bước Undo.
import { createStore, useStore } from 'zustand'
import { applyCaptions } from '@shared/captions/applyCaptions'
import type { CaptionLanguage } from '@shared/captions/captions'
import type { CaptionProgress, CaptionResult } from '@shared/ipc'
import { projectDuration } from '@shared/timeline/clips'
import { editorStore } from './editorStore'
import { projectStore } from './projectStore'

export interface CaptionState {
  running: boolean
  progress: CaptionProgress | null
  /** Kết quả lần chạy gần nhất: số câu đã thêm, hoặc mã lỗi. */
  last: { added: number } | { error: Exclude<CaptionResult, { ok: true }>['error'] | 'empty' | 'no-media'; detail?: string } | null
}

export const captionStore = createStore<CaptionState>()(() => ({ running: false, progress: null, last: null }))

export const useCaptionState = <T>(selector: (s: CaptionState) => T): T => useStore(captionStore, selector)

let unsubscribe: (() => void) | null = null

/** Tạo phụ đề cho cả timeline. */
export async function generateCaptions(language: CaptionLanguage, replace: boolean, trackName: string): Promise<void> {
  if (captionStore.getState().running) return
  const project = projectStore.getState().project
  if (projectDuration(project) === 0) {
    captionStore.setState({ last: { error: 'no-media' } })
    return
  }
  captionStore.setState({ running: true, progress: null, last: null })
  unsubscribe ??= window.cutcap.onCaptionProgress((progress) => captionStore.setState({ progress }))
  try {
    const result = await window.cutcap.generateCaptions(project, language)
    if (!result.ok) {
      captionStore.setState({ last: { error: result.error, detail: result.detail } })
      return
    }
    if (result.captions.length === 0) {
      captionStore.setState({ last: { error: 'empty' } })
      return
    }
    let added: string[] = []
    projectStore.getState().apply('history.captions', (d) => {
      added = applyCaptions(d, result.captions, { replace, trackName }).clipIds
    })
    editorStore.getState().setSelection([])
    captionStore.setState({ last: { added: added.length } })
  } catch (err) {
    captionStore.setState({ last: { error: 'failed', detail: (err as Error).message } })
  } finally {
    captionStore.setState({ running: false, progress: null })
  }
}

export function cancelCaptions(): void {
  window.cutcap.cancelCaptions()
}
