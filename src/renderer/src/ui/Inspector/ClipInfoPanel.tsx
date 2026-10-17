// Các mục thuộc tính của clip media (Inspector ghép chúng thành các tab kiểu CapCut):
// Tốc độ, Âm thanh (âm lượng, fade), Thông tin.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isKaraokeFile } from '@shared/media/derived'
import type { Clip, MediaAsset, MediaClip, Track } from '@shared/project/schema'
import { MICROS_PER_SECOND, formatDuration, formatTimecode } from '@shared/project/time'
import { clipEnd } from '@shared/timeline/clips'
import { MAX_SPEED, MIN_SPEED, effectiveFades, planSpeed } from '@shared/timeline/clipProps'
import { setClipFades, setClipSpeed, setClipVolume } from '../../state/clipActions'
import { projectStore, useProjectStore } from '../../state/projectStore'
import { useMediaStore } from '../../state/mediaStore'
import { detachAudioOf, minClipDuration, removeVocalsOf, restoreVocalsOf } from '../../state/timelineActions'
import { canDetachAudio, canProcessAudio, canRemoveVocals, canRestoreVocals } from '@shared/timeline/detach'
import { volumeAt } from '@shared/timeline/keyframes'
import { useEditorStore } from '../../state/editorStore'
import { editTimeFor } from '../../state/keyframeActions'
import { Icon } from '../icons'
import { NumberBox } from './NumberBox'
import { HelpTip } from '../HelpTip'
import { LOUDNESS_TARGET, MAX_DB, MIN_DB, dbToGain, gainToDb } from '@shared/render/audioMath'
import { audioFxFileLabel } from './audioFxLabel'
import { setAudioFx, setLoudnessNormalized } from '../../state/voiceActions'
import { KeyframeButton } from './KeyframeButton'
import { SliderField } from './SliderField'

const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4]

// Thanh trượt tốc độ theo thang logarit: 0.25× và 4× cách đều 1× → kéo cảm giác cân đối
const toSlider = (speed: number): number => Math.log2(speed)
const fromSlider = (v: number): number => Math.round(2 ** v * 100) / 100
/** Fade tối đa 10 giây (hoặc bằng độ dài clip nếu ngắn hơn). */
const MAX_FADE_US = 10 * MICROS_PER_SECOND

export function SpeedSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const fps = useProjectStore((s) => s.project.settings.fps)
  // Thử trước từng mức tốc độ: mức nào làm clip đè lên clip phía sau thì cảnh báo trên nút
  const preview = (speed: number) => planSpeed(projectStore.getState().project, clip.id, speed, minClipDuration())
  const sourceSpanUs = clip.duration * clip.speed

  return (
    <section className="inspector-section">
      <h4>{t('clip.speedTitle')}</h4>
      <SliderField
        label={t('clip.speed')}
        display={`${clip.speed}×`}
        value={toSlider(clip.speed)}
        min={toSlider(MIN_SPEED)}
        max={toSlider(MAX_SPEED)}
        step={0.01}
        disabled={disabled}
        onChange={(v, session) => setClipSpeed(clip.id, fromSlider(v), session)}
        onReset={() => setClipSpeed(clip.id, 1)}
      />
      <div className="segmented small">
        {SPEED_PRESETS.map((s) => (
          <button
            key={s}
            className={s === clip.speed ? 'active' : ''}
            disabled={disabled}
            onClick={() => setClipSpeed(clip.id, s)}
            title={preview(s)?.truncated ? t('clip.speedTruncated') : undefined}
          >
            {s}×
          </button>
        ))}
      </div>
      <p className="hint">
        {t('clip.speedResult', {
          source: formatTimecode(sourceSpanUs, fps),
          duration: formatTimecode(clip.duration, fps)
        })}
      </p>
    </section>
  )
}

export function AudioSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const { fadeIn, fadeOut } = effectiveFades(clip)
  const maxFade = Math.min(MAX_FADE_US, clip.duration)
  // Âm lượng tại đầu phát (có keyframe thì đổi theo thời gian), hiển thị theo dB như CapCut
  const now = useEditorStore((s) => s.currentTime)
  const volume = volumeAt(clip, editTimeFor(clip, now))
  const db = gainToDb(volume)
  const setDb = (v: number, session?: string): void => setClipVolume(clip.id, Math.round(dbToGain(v) * 1000) / 1000, session)
  const seconds = (us: number): string => `${(us / MICROS_PER_SECOND).toFixed(1)}s`
  const changed = volume !== 1 || fadeIn > 0 || fadeOut > 0

  return (
    <section className="inspector-section">
      <div className="row">
        <h4 className="with-help">
          {t('clip.audioTitle')}
          <HelpTip text={t('clip.resetHint')} />
        </h4>
        <button
          className="icon ghost"
          disabled={disabled || !changed}
          title={t('clip.resetAudio')}
          onClick={() => {
            setClipVolume(clip.id, 1)
            setClipFades(clip.id, 0, 0)
          }}
        >
          <Icon name="undo" size={14} />
        </button>
      </div>
      <SliderField
        label={t('clip.volume')}
        display=""
        value={Number.isFinite(db) ? Math.max(MIN_DB, db) : MIN_DB}
        min={MIN_DB}
        max={MAX_DB}
        step={0.1}
        disabled={disabled}
        onChange={(v, session) => setDb(v, session)}
        onReset={() => setClipVolume(clip.id, 1)}
        extra={
          <>
            <NumberBox
              value={db}
              digits={1}
              unit="dB"
              step={1}
              min={MIN_DB}
              max={Number(MAX_DB.toFixed(1))}
              emptyText={t('clip.muted')}
              disabled={disabled}
              onCommit={(v) => setDb(v)}
            />
            <KeyframeButton clip={clip} props={['volume']} disabled={disabled} />
          </>
        }
      />
      <SliderField
        label={t('clip.fadeIn')}
        display=""
        value={fadeIn}
        min={0}
        max={maxFade}
        step={MICROS_PER_SECOND / 10}
        disabled={disabled}
        onChange={(v, session) => setClipFades(clip.id, v, Math.min(fadeOut, clip.duration - v), session)}
        onReset={() => setClipFades(clip.id, 0, fadeOut)}
        extra={
          <NumberBox
            value={fadeIn / MICROS_PER_SECOND}
            digits={1}
            unit="s"
            step={0.1}
            min={0}
            max={maxFade / MICROS_PER_SECOND}
            disabled={disabled}
            title={seconds(fadeIn)}
            onCommit={(v) => setClipFades(clip.id, v * MICROS_PER_SECOND, Math.min(fadeOut, clip.duration - v * MICROS_PER_SECOND))}
          />
        }
      />
      <SliderField
        label={t('clip.fadeOut')}
        display=""
        value={fadeOut}
        min={0}
        max={maxFade}
        step={MICROS_PER_SECOND / 10}
        disabled={disabled}
        onChange={(v, session) => setClipFades(clip.id, Math.min(fadeIn, clip.duration - v), v, session)}
        onReset={() => setClipFades(clip.id, fadeIn, 0)}
        extra={
          <NumberBox
            value={fadeOut / MICROS_PER_SECOND}
            digits={1}
            unit="s"
            step={0.1}
            min={0}
            max={maxFade / MICROS_PER_SECOND}
            disabled={disabled}
            title={seconds(fadeOut)}
            onCommit={(v) => setClipFades(clip.id, Math.min(fadeIn, clip.duration - v * MICROS_PER_SECOND), v * MICROS_PER_SECOND)}
          />
        }
      />
    </section>
  )
}

/**
 * Chuẩn hóa âm lượng, Cải thiện giọng nói, Giảm tiếng ồn (giống CapCut).
 * Hai mục sau xử lý bằng FFmpeg ra file mới (gộp chung với Trình thay đổi giọng nói, luôn từ bản gốc).
 */
export function AudioToolsSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const busy = useMediaStore((s) => s.importing)
  const canProcess = useProjectStore((s) => canProcessAudio(s.project, clip.id))
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fx = clip.audioFx

  const run = async (key: string, task: () => Promise<string | null>): Promise<void> => {
    setError(null)
    setWorking(key)
    try {
      const code = await task()
      if (code) setError(code)
    } finally {
      setWorking(null)
    }
  }
  const toggle = (key: 'enhance' | 'denoise', on: boolean): void =>
    void run(key, () => setAudioFx(clip.id, { [key]: on }, { file: audioFxFileLabel(t), audioSuffix: t('extractAudio.suffix') }))

  return (
    <section className="inspector-section audio-tools">
      <label className="check tool-row">
        <input
          type="checkbox"
          checked={!!clip.loudnorm}
          disabled={disabled || busy}
          onChange={(e) => void run('loudnorm', () => setLoudnessNormalized(clip.id, e.target.checked))}
        />
        <span className="tool-title">{working === 'loudnorm' ? t('audioTools.measuring') : t('audioTools.loudnorm')}</span>
        <HelpTip text={t('audioTools.loudnormHint', { target: LOUDNESS_TARGET })} />
        {clip.loudnorm && (
          <span className="tool-status">
            {t('audioTools.loudnormShort', { measured: clip.loudnorm.measured.toFixed(1), target: LOUDNESS_TARGET })}
          </span>
        )}
      </label>
      <hr />
      <label className="check tool-row">
        <input
          type="checkbox"
          checked={!!fx?.enhance}
          disabled={disabled || busy || !canProcess}
          onChange={(e) => toggle('enhance', e.target.checked)}
        />
        <span className="tool-title">{working === 'enhance' ? t('extractAudio.working') : t('audioTools.enhance')}</span>
        <HelpTip text={t('audioTools.enhanceHint')} />
      </label>
      <hr />
      <label className="check tool-row">
        <input
          type="checkbox"
          checked={!!fx?.denoise}
          disabled={disabled || busy || !canProcess}
          onChange={(e) => toggle('denoise', e.target.checked)}
        />
        <span className="tool-title">{working === 'denoise' ? t('extractAudio.working') : t('audioTools.denoise')}</span>
        <HelpTip text={t('audioTools.denoiseHint')} />
      </label>
      {error && <div className="notice error">{t(`audioTools.errors.${error}`, { defaultValue: t('vocals.errors.failed') })}</div>}
    </section>
  )
}

/** Tách âm thanh của clip video xuống track âm thanh riêng (clip video tắt tiếng). */
export function DetachAudioSection({ clip, disabled }: { clip: MediaClip; disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const busy = useMediaStore((s) => s.importing)
  // Đọc lại mỗi khi dự án đổi (âm lượng, khóa track…) để bật/tắt nút cho đúng
  const can = useProjectStore((s) => canDetachAudio(s.project, clip.id))
  return (
    <section className="inspector-section">
      <div className="row">
        <h4 className="with-help">
          {t('clipMenu.detachAudio')}
          <HelpTip text={can ? t('clipMenu.detachHint') : t('clipMenu.detachedHint')} />
        </h4>
        <button disabled={disabled || !can || busy} onClick={() => void detachAudioOf([clip.id], t('extractAudio.suffix'))}>
          <Icon name="extract" size={15} /> {busy ? t('extractAudio.working') : t('clipMenu.detachAudio')}
        </button>
      </div>
    </section>
  )
}

/**
 * Xóa giọng hát (karaoke) – bản đơn giản bằng FFmpeg, không dùng AI:
 * triệt tiêu phần âm nằm giữa 2 kênh stereo (thường là giọng hát), giữ phần âm trầm.
 */
export function VocalRemovalSection({
  clip,
  asset,
  disabled
}: {
  clip: MediaClip
  asset: MediaAsset
  disabled: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const busy = useMediaStore((s) => s.importing)
  const can = useProjectStore((s) => canRemoveVocals(s.project, clip.id))
  const canRestore = useProjectStore((s) => canRestoreVocals(s.project, clip.id))
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const done = clip.vocalsRemovedFrom !== null || isKaraokeFile(asset.path)
  // Mục này nằm cuối bảng → cuộn tới thông báo lỗi để chắc chắn người dùng nhìn thấy
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  const run = async (): Promise<void> => {
    setError(null)
    const code = await removeVocalsOf(clip.id, { vocalsSuffix: t('vocals.suffix'), audioSuffix: t('extractAudio.suffix') })
    if (code) setError(code)
  }

  return (
    <section className="inspector-section">
      <div className="row">
        <h4 className="with-help">
          {t('vocals.title')}
          <HelpTip
            text={
              done
                ? canRestore
                  ? t('vocals.done')
                  : t('vocals.doneNoOriginal')
                : asset.kind === 'video' && clip.volume === 0
                  ? t('vocals.muted')
                  : t('vocals.hint')
            }
          />
        </h4>
        {/* Đã xóa giọng → nút "Khôi phục" thay chỗ nút "Xóa giọng hát" */}
        {done ? (
          <button disabled={disabled || !canRestore} onClick={() => restoreVocalsOf(clip.id)} title={t('vocals.restoreHint')}>
            <Icon name="undo" size={15} /> {t('vocals.restore')}
          </button>
        ) : (
          <button disabled={disabled || !can || busy} onClick={() => void run()}>
            <Icon name="mute" size={15} /> {busy ? t('extractAudio.working') : t('vocals.button')}
          </button>
        )}
      </div>
      {error && (
        <div className="notice error" ref={errorRef}>
          {t(`vocals.errors.${error}`, { defaultValue: t('vocals.errors.failed') })}
        </div>
      )}
    </section>
  )
}

export function InfoSection({ clip, track, asset }: { clip: Clip; track: Track; asset: MediaAsset | undefined }): React.JSX.Element {
  const { t } = useTranslation()
  const fps = useProjectStore((s) => s.project.settings.fps)
  const tc = (us: number): string => formatTimecode(us, fps)
  const rows: [string, string][] = [
    [t('clip.track'), t(`track.kind.${track.kind}`)],
    [t('clip.start'), tc(clip.start)],
    [t('clip.end'), tc(clipEnd(clip))],
    [t('clip.duration'), formatDuration(clip.duration)]
  ]
  if (clip.type === 'media') rows.push([t('clip.sourceIn'), tc(clip.sourceIn)])
  if (asset?.width && asset.height) rows.push([t('clip.resolution'), `${asset.width} × ${asset.height}`])

  return (
    <section className="inspector-section">
      <h4>{t('clip.infoTitle')}</h4>
      <dl className="info-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
