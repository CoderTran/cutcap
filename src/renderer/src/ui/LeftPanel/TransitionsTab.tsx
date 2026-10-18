// Tab Chuyển tiếp: ô xem trước động cho từng kiểu. Bấm → gắn vào mối cắt gần đầu phát nhất
// (ưu tiên track của clip đang chọn). Chỉnh thời lượng ở bảng phải.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TRANSITION_KINDS, type TransitionKind } from '@shared/project/schema'
import { findClip } from '@shared/timeline/clips'
import { DEFAULT_TRANSITION, findCutNear, maxTransitionDuration } from '@shared/timeline/transitions'
import { setTransition } from '../../state/clipActions'
import { editorStore } from '../../state/editorStore'
import { playRange } from '../../state/playbackActions'
import { projectStore } from '../../state/projectStore'
import { useFavorites } from '../../state/favoritesStore'
import { FavoriteFilter, FavoriteStar } from '../Favorites'
import { HelpTip } from '../HelpTip'
import { TileAdd } from '../TileAdd'

export function TransitionsTab(): React.JSX.Element {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [picked, setPicked] = useState<TransitionKind | null>(null)
  const favs = useFavorites('transition')
  const kinds: TransitionKind[] = onlyFavs ? (favs.filter((k) => (TRANSITION_KINDS as readonly string[]).includes(k)) as TransitionKind[]) : [...TRANSITION_KINDS]

  // Rời tab → bỏ bản xem thử
  useEffect(() => () => editorStore.getState().setTilePreview(null), [])

  /** Mối cắt gần đầu phát nhất (ưu tiên track của clip đang chọn): id clip phía sau, hoặc null. */
  const cutNear = (): string | null => {
    const project = projectStore.getState().project
    const { currentTime, selectedClipIds } = editorStore.getState()
    const preferTrack = selectedClipIds[0] ? findClip(project, selectedClipIds[0])?.track.id : null
    return findCutNear(project, currentTime, preferTrack)
  }

  /** Bấm 1 lần: chọn + phát thử đoạn quanh mối cắt với chuyển cảnh này (chưa gắn vào dự án). */
  const pick = (kind: TransitionKind): void => {
    if (picked === kind) {
      setPicked(null)
      editorStore.getState().setTilePreview(null)
      return
    }
    setPicked(kind)
    const clipId = cutNear()
    const found = clipId ? findClip(projectStore.getState().project, clipId) : null
    if (!found) {
      setNotice(t('transitionsTab.noCut'))
      return
    }
    setNotice(null)
    const index = found.track.clips.indexOf(found.clip)
    const duration = Math.min(DEFAULT_TRANSITION, maxTransitionDuration(found.track.clips[index - 1], found.clip))
    editorStore.getState().setTilePreview({ kind: 'transition', clipId: found.clip.id, transition: { kind, duration } })
    // Phát từ trước chuyển cảnh một chút tới sau một chút; xong thì bỏ bản xem thử và đưa đầu phát về chỗ cũ
    const margin = 400_000
    const preview = editorStore.getState().tilePreview
    const back = editorStore.getState().currentTime
    playRange(found.clip.start - duration / 2 - margin, duration + 2 * margin, () => {
      if (editorStore.getState().tilePreview !== preview) return // đã chọn ô khác / đã thêm
      editorStore.getState().setTilePreview(null)
      editorStore.getState().setCurrentTime(back)
    })
  }

  const apply = (kind: TransitionKind): void => {
    setPicked(null)
    editorStore.getState().setTilePreview(null)
    const project = projectStore.getState().project
    const { currentTime, selectedClipIds } = editorStore.getState()
    const preferTrack = selectedClipIds[0] ? findClip(project, selectedClipIds[0])?.track.id : null
    const clipId = findCutNear(project, currentTime, preferTrack)
    if (!clipId) {
      setNotice(t('transitionsTab.noCut'))
      return
    }
    setTransition(clipId, kind, DEFAULT_TRANSITION)
    // Chọn clip phía sau mối cắt và mở tab Chuyển cảnh ở bảng phải để chỉnh thời lượng
    editorStore.getState().selectWithTab(clipId, 'transition')
    setNotice(null)
  }

  return (
    <div className="left-scroll">
      <h4 className="left-heading with-help">
        {t('transitionsTab.heading')}
        <HelpTip text={t('transitionsTab.hint')} />
      </h4>
      <FavoriteFilter only={onlyFavs} count={favs.length} onChange={setOnlyFavs} />
      {onlyFavs && kinds.length === 0 && <p className="hint">{t('favorites.empty')}</p>}
      <div className="preset-grid">
        {kinds.map((kind) => (
          <button
            key={kind}
            className={`preset-tile ${picked === kind ? 'active' : ''}`}
            // Bấm 1 lần: chọn ô; bấm đúp hoặc bấm + : gắn chuyển cảnh (giống CapCut)
            onClick={() => pick(kind)}
            onDoubleClick={() => apply(kind)}
            title={t('transitionsTab.hint')}
          >
            <span className={`transition-demo ${kind}`}>
              <span className="demo-a" />
              <span className="demo-b" />
            </span>
            <span className="preset-name">{t(`transition.kinds.${kind}`)}</span>
            <FavoriteStar kind="transition" id={kind} />
            <TileAdd title={t('transitionsTab.hint')} onAdd={() => apply(kind)} />
          </button>
        ))}
      </div>
      {notice && <p className="hint">{notice}</p>}
    </div>
  )
}
