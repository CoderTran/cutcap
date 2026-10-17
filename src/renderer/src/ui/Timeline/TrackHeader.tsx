// Cột trái của mỗi track (kiểu CapCut): tên ngắn + biểu tượng khóa / ẩn / tắt tiếng / xóa.
import { useTranslation } from 'react-i18next'
import type { Track } from '@shared/project/schema'
import { removeTrack, toggleTrackFlag } from '../../state/projectActions'
import { Icon } from '../icons'
import { HEADER_WIDTH, trackHeight } from './layout'

interface Props {
  track: Track
  label: string
}

export function TrackHeader({ track, label }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const hasPicture = track.kind !== 'audio'
  const hasSound = track.kind === 'video' || track.kind === 'audio'

  return (
    <div className={`tl-header kind-${track.kind}`} style={{ width: HEADER_WIDTH, height: trackHeight(track) }}>
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
