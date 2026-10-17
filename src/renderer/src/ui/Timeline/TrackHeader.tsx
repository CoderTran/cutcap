// Tiêu đề track bên trái: tên + nút ẩn / tắt tiếng / khóa / xóa.
import { useTranslation } from 'react-i18next'
import type { Track } from '@shared/project/schema'
import { removeTrack, toggleTrackFlag } from '../../state/projectActions'
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
        {hasPicture && (
          <button
            className={`icon ${track.hidden ? 'active' : ''}`}
            onClick={() => toggleTrackFlag(track.id, 'hidden')}
            title={t('track.hide')}
          >
            {track.hidden ? '🙈' : '👁'}
          </button>
        )}
        {hasSound && (
          <button
            className={`icon ${track.muted ? 'active' : ''}`}
            onClick={() => toggleTrackFlag(track.id, 'muted')}
            title={t('track.mute')}
          >
            {track.muted ? '🔇' : '🔊'}
          </button>
        )}
        <button
          className={`icon ${track.locked ? 'active' : ''}`}
          onClick={() => toggleTrackFlag(track.id, 'locked')}
          title={t('track.lock')}
        >
          {track.locked ? '🔒' : '🔓'}
        </button>
        <button className="icon" onClick={() => removeTrack(track.id)} title={t('track.remove')}>
          ✕
        </button>
      </div>
    </div>
  )
}
