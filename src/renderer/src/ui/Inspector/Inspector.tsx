// Bảng phải kiểu CapCut: hàng tab ở trên, nội dung theo tab.
//   - không chọn gì:   Dự án | Chi tiết
//   - clip video/ảnh:  Video | Âm thanh | Tốc độ | Hiệu ứng động | Điều chỉnh | Chuyển cảnh   (tab không áp dụng thì ẩn)
//   - clip âm thanh:   Âm thanh | Tốc độ
//   - clip chữ:        Văn bản | Hoạt ảnh
//   - clip hiệu ứng:   Hiệu ứng
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Clip, MediaAsset, Track } from '@shared/project/schema'
import { clipAssetId, findClip } from '@shared/timeline/clips'
import { canHaveTransition } from '@shared/timeline/transitions'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'
import { AudioSection, AudioToolsSection, DetachAudioSection, InfoSection, SpeedSection, VocalRemovalSection } from './ClipInfoPanel'
import { AnimationPanel } from './AnimationPanel'
import { ColorSection } from './ColorSection'
import { EffectPanel } from './EffectPanel'
import { ProjectDetails } from './ProjectDetails'
import { ProjectSettingsPanel } from './ProjectSettingsPanel'
import { TextPanel } from './TextPanel'
import { TransformSection } from './TransformSection'
import { TransitionSection } from './TransitionSection'
import { VoicePanel } from './VoicePanel'

type TabId = 'project' | 'details' | 'video' | 'audio' | 'speed' | 'anim' | 'adjust' | 'transition' | 'text' | 'animation' | 'effect'

/** Các tab phù hợp với clip đang chọn. */
function tabsFor(clip: Clip | null, track: Track | null, asset: MediaAsset | undefined, transitionable: boolean): TabId[] {
  if (!clip || !track) return ['project', 'details']
  if (clip.type === 'text') return ['text', 'animation']
  if (clip.type === 'effect') return ['effect']
  if (!asset) return []
  const timed = asset.kind !== 'image'
  if (asset.kind === 'audio') return ['audio', 'speed']
  return [
    'video',
    ...(timed && asset.hasAudio ? (['audio'] as const) : []),
    ...(timed ? (['speed'] as const) : []),
    'anim',
    'adjust',
    ...(transitionable ? (['transition'] as const) : [])
  ]
}

export function Inspector(): React.JSX.Element {
  const { t } = useTranslation()
  const selected = useEditorStore((s) => s.selectedClipIds)
  const requestedTab = useEditorStore((s) => s.inspectorTab)
  const project = useProjectStore((s) => s.project)

  const found = selected.length === 1 ? findClip(project, selected[0]) : null
  const clip = found?.clip ?? null
  const track = found?.track ?? null
  const assetId = clip ? clipAssetId(clip) : null
  const asset = assetId ? project.assets[assetId] : undefined
  const transitionable = !!(clip && track && canHaveTransition(project, track, track.clips.indexOf(clip)))
  const tabs = tabsFor(clip, track, asset, transitionable)

  // Đổi clip → về tab được yêu cầu (vd. Chuyển cảnh) hoặc tab đầu tiên
  const [tab, setTab] = useState<TabId>(tabs[0])
  const [audioSub, setAudioSub] = useState<'basic' | 'voice'>('basic')
  const selectionKey = `${clip?.id ?? 'none'}|${requestedTab ?? ''}`
  useEffect(() => {
    setTab(requestedTab && tabs.includes(requestedTab as TabId) ? (requestedTab as TabId) : tabs[0])
  }, [selectionKey])
  const current = tabs.includes(tab) ? tab : tabs[0]

  if (selected.length > 1) {
    return (
      <section className="panel inspector">
        <p className="hint inspector-empty">{t('inspector.multiSelected', { count: selected.length })}</p>
      </section>
    )
  }

  const locked = track?.locked ?? false
  return (
    <section className="panel inspector">
      <nav className="inspector-tabs">
        {tabs.map((id) => (
          <button key={id} className={`inspector-tab ${current === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {t(`inspector.tabs.${id}`)}
          </button>
        ))}
      </nav>
      <div className="inspector-body" key={`${clip?.id ?? 'project'}-${current}`}>
        {current === 'project' && <ProjectSettingsPanel />}
        {current === 'details' && <ProjectDetails />}
        {clip?.type === 'text' && track && (current === 'text' || current === 'animation') && (
          <TextPanel clip={clip} track={track} section={current} />
        )}
        {clip?.type === 'effect' && track && <EffectPanel clip={clip} disabled={track.locked} />}
        {clip?.type === 'media' && track && (
          <div className="form">
            {locked && <p className="hint">🔒 {t('clip.locked')}</p>}
            {current === 'video' && (
              <>
                <TransformSection clip={clip} disabled={locked} />
                <InfoSection clip={clip} track={track} asset={asset} />
              </>
            )}
            {current === 'audio' && (
              <>
                {/* Âm thanh có 2 mục như CapCut: Cơ bản | Trình thay đổi giọng nói */}
                <div className="segmented audio-sub">
                  <button className={audioSub === 'basic' ? 'active' : ''} onClick={() => setAudioSub('basic')}>
                    {t('voices.basic')}
                  </button>
                  <button className={audioSub === 'voice' ? 'active' : ''} onClick={() => setAudioSub('voice')}>
                    {t('voices.title')}
                    {clip.audioFx?.voice && <span className="anim-dot" />}
                  </button>
                </div>
                {audioSub === 'basic' ? (
                  <>
                    <AudioSection clip={clip} disabled={locked} />
                    <AudioToolsSection clip={clip} disabled={locked} />
                    {asset?.kind === 'video' && <DetachAudioSection clip={clip} disabled={locked} />}
                    {asset && <VocalRemovalSection clip={clip} asset={asset} disabled={locked} />}
                    {asset?.kind === 'audio' && <InfoSection clip={clip} track={track} asset={asset} />}
                  </>
                ) : (
                  asset && <VoicePanel clip={clip} asset={asset} disabled={locked} />
                )}
              </>
            )}
            {current === 'speed' && <SpeedSection clip={clip} disabled={locked} />}
            {current === 'anim' && <AnimationPanel clip={clip} disabled={locked} />}
            {current === 'adjust' && asset && <ColorSection clip={clip} asset={asset} disabled={locked} />}
            {current === 'transition' && <TransitionSection clip={clip} track={track} />}
          </div>
        )}
      </div>
    </section>
  )
}
