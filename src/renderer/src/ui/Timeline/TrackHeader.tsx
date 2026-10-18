// Cột trái của mỗi track (kiểu CapCut): tên ngắn + biểu tượng khóa / ẩn / tắt tiếng / xóa.
import { useTranslation } from 'react-i18next'
import type { Track } from '@shared/project/schema'
import { openCoverDialog } from '../../state/coverActions'
import { removeTrack, toggleTrackFlag } from '../../state/projectActions'
import { useProjectStore } from '../../state/projectStore'
import { Icon } from '../icons'
import { HEADER_WIDTH, trackHeight } from './layout'

interface Props {
  track: Track
  label: string
  /** Track chính (track video dưới cùng): có nút "Ảnh bìa" như CapCut. */
  isMain?: boolean
}

export function TrackHeader({ track, label, isMain = false }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const hasPicture = track.kind !== 'audio'
  const hasSound = track.kind === 'video' || track.kind === 'audio'

  const coverThumb = useProjectStore((s) => s.project.cover?.thumb ?? null)

  return (
    <div className={`tl-header kind-${track.kind} ${isMain ? 'with-cover' : ''}`} style={{ width: HEADER_WIDTH, height: trackHeight(track) }}>
      {isMain && (
        <button
          className={`tl-cover ${coverThumb ? 'has-thumb' : ''}`}
          style={coverThumb ? { backgroundImage: `url("${coverThumb}")` } : undefined}
          onClick={openCoverDialog}
          title={t('cover.buttonHint')}
        >
          <Icon name="pencil" size={13} />
          <span>{t('cover.button')}</span>
        </button>
      )}
      <span className="tl-header-name" title={label}>
        {label}
      </span>
      <div className="tl-header-flags">
        <button className={`icon ghost ${track.locked ? 'on' : ''}`} onClick={() => toggleTrackFlag(track.id, 'locked')} title={t('track.lock')}>
          <Icon name={track.locked ? 'lock' : 'unlock'} size={14} />
        </button>
        {hasPicture && (
          <button className={`icon ghost ${track.hidden ? 'on' : ''}`} onClick={() => toggleTrackFlag(track.id, 'hidden')} title={t('track.hide')}>
            <Icon name={track.hidden ? 'eyeOff' : 'eye'} size={14} />
          </button>
        )}
        {hasSound && (
          <button className={`icon ghost ${track.muted ? 'on' : ''}`} onClick={() => toggleTrackFlag(track.id, 'muted')} title={t('track.mute')}>
            <Icon name={track.muted ? 'mute' : 'volume'} size={14} />
          </button>
        )}
        <button className="icon ghost" onClick={() => removeTrack(track.id)} title={t('track.remove')}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  )
}
