// Panel "Thuộc tính" khi chưa chọn clip: hiện cài đặt của dự án.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { canvasSize } from '@shared/project/canvas'
import { ASPECT_RATIOS, FRAME_RATES, RESOLUTIONS, type FrameRate } from '@shared/project/schema'
import { renameProject, updateSettings } from '../../state/projectActions'
import { useProjectStore } from '../../state/projectStore'

export function ProjectSettingsPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const name = useProjectStore((s) => s.project.name)
  const settings = useProjectStore((s) => s.project.settings)
  const filePath = useProjectStore((s) => s.filePath)
  const size = canvasSize(settings.aspectRatio, settings.resolution)

  // Tên dự án: giữ bản nháp cục bộ khi đang gõ, chỉ ghi vào dự án khi rời ô hoặc nhấn Enter
  // → cả lần đổi tên chỉ là 1 bước Undo, không phải mỗi ký tự 1 bước.
  const [draftName, setDraftName] = useState(name)
  useEffect(() => setDraftName(name), [name])
  const commitName = (): void => {
    if (draftName.trim() !== name) renameProject(draftName)
    else setDraftName(name)
  }

  return (
    <div className="form">
      <h3 className="form-title">{t('settings.title')}</h3>

      <label className="field">
        <span>{t('settings.name')}</span>
        <input
          value={draftName}
          placeholder={t('project.untitled')}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraftName(name)
              e.currentTarget.blur()
            }
          }}
        />
      </label>

      <div className="field">
        <span>{t('settings.aspectRatio')}</span>
        <div className="segmented">
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio}
              className={ratio === settings.aspectRatio ? 'active' : ''}
              onClick={() => updateSettings({ aspectRatio: ratio })}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>{t('settings.resolution')}</span>
        <select
          value={settings.resolution}
          onChange={(e) => updateSettings({ resolution: e.target.value as (typeof RESOLUTIONS)[number] })}
        >
          {RESOLUTIONS.map((r) => (
            <option key={r} value={r}>
              {t(`settings.resolutions.${r}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>{t('settings.fps')}</span>
        <select
          value={settings.fps}
          onChange={(e) => updateSettings({ fps: Number(e.target.value) as FrameRate })}
        >
          {FRAME_RATES.map((fps) => (
            <option key={fps} value={fps}>
              {fps} fps
            </option>
          ))}
        </select>
      </label>

      <p className="hint">
        {t('settings.canvasSize', { width: size.width, height: size.height })}
        <br />
        {filePath ?? t('project.notSavedYet')}
      </p>
    </div>
  )
}
