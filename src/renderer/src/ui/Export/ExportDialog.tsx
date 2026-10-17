// Hộp thoại Xuất video: 3 màn hình – cài đặt → đang xuất (tiến trình) → kết quả.
import { useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { EncoderId, ExportQuality, ExportResult } from '@shared/ipc'
import { fileNameOf } from '@shared/media/formats'
import { canvasSize } from '@shared/project/canvas'
import { ASPECT_RATIOS, FRAME_RATES, RESOLUTIONS, type FrameRate, type Resolution } from '@shared/project/schema'
import { formatDuration } from '@shared/project/time'
import { projectDuration } from '@shared/timeline/clips'
import {
  cancelExport,
  chooseOutputPath,
  closeExportDialog,
  startExport,
  useExportStore
} from '../../state/exportStore'
import { updateSettings } from '../../state/projectActions'
import { useProjectStore } from '../../state/projectStore'

const QUALITIES: ExportQuality[] = ['high', 'standard', 'small']

/** 12345678 → "11,8 MB" */
function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}
const formatSeconds = (s: number): string => formatDuration(Math.round(s) * 1_000_000)

export function ExportDialog(): React.JSX.Element | null {
  const open = useExportStore((s) => s.dialogOpen)
  const phase = useExportStore((s) => s.phase)

  // Esc đóng hộp thoại (khi không đang xuất)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeExportDialog()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && phase !== 'running' && closeExportDialog()}>
      <div className="modal" role="dialog" aria-modal="true">
        {phase === 'idle' && <SettingsView />}
        {phase === 'running' && <ProgressView />}
        {phase === 'finished' && <ResultView />}
      </div>
    </div>
  )
}

// ───────── Màn hình 1: cài đặt ─────────

function SettingsView(): React.JSX.Element {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const encoders = useExportStore((s) => s.encoders)
  const lastPath = useExportStore((s) => s.lastOutputPath)

  const [outputPath, setOutputPath] = useState<string | null>(lastPath)
  const [resolution, setResolution] = useState<Resolution>(project.settings.resolution)
  const [fps, setFps] = useState<FrameRate>(project.settings.fps)
  const [quality, setQuality] = useState<ExportQuality>('standard')
  const [encoder, setEncoder] = useState<'auto' | EncoderId>('auto')

  const duration = projectDuration(project)
  const size = canvasSize(project.settings.aspectRatio, resolution)
  const autoEncoder = encoders?.[0]

  const onExport = async (): Promise<void> => {
    // Chưa chọn nơi lưu → hỏi trước
    const path = outputPath ?? (await chooseOutputPath(null))
    if (!path) return
    setOutputPath(path)
    // Nhớ độ phân giải / fps vào dự án cho lần sau
    if (resolution !== project.settings.resolution || fps !== project.settings.fps) updateSettings({ resolution, fps })
    await startExport({ outputPath: path, resolution, fps, quality, encoder })
  }

  return (
    <>
      <h2 className="modal-title">{t('export.title')}</h2>
      <div className="form">
        <div className="field">
          <span>{t('export.file')}</span>
          <div className="path-row">
            <span className="path" title={outputPath ?? ''}>
              {outputPath ? fileNameOf(outputPath) : t('export.noPath')}
            </span>
            <button onClick={async () => setOutputPath((await chooseOutputPath(outputPath)) ?? outputPath)}>
              {t('export.choose')}
            </button>
          </div>
        </div>

        <div className="field">
          <span>{t('settings.aspectRatio')}</span>
          <div className="segmented">
            {ASPECT_RATIOS.map((r) => (
              <button
                key={r}
                className={r === project.settings.aspectRatio ? 'active' : ''}
                onClick={() => updateSettings({ aspectRatio: r })}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="field-row">
          <label className="field">
            <span>{t('settings.resolution')}</span>
            <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)}>
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {t(`settings.resolutions.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('settings.fps')}</span>
            <select value={fps} onChange={(e) => setFps(Number(e.target.value) as FrameRate)}>
              {FRAME_RATES.map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span>{t('export.quality')}</span>
          <div className="segmented">
            {QUALITIES.map((q) => (
              <button key={q} className={q === quality ? 'active' : ''} onClick={() => setQuality(q)} title={t(`export.qualityHint.${q}`)}>
                {t(`export.qualities.${q}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>{t('export.encoder')}</span>
          <select value={encoder} onChange={(e) => setEncoder(e.target.value as 'auto' | EncoderId)} disabled={!encoders}>
            <option value="auto">
              {encoders
                ? t('export.auto', { name: autoEncoder ? t(`export.encoders.${autoEncoder}`) : 'CPU' })
                : t('export.detecting')}
            </option>
            {encoders?.map((e) => (
              <option key={e} value={e}>
                {t(`export.encoders.${e}`)}
              </option>
            ))}
          </select>
        </label>

        <p className="hint">
          {t('export.summary', { width: size.width, height: size.height, fps, duration: formatDuration(duration) })}
        </p>
      </div>

      <div className="modal-actions">
        <button onClick={closeExportDialog}>{t('export.cancel')}</button>
        <button className="primary" onClick={() => void onExport()} disabled={duration === 0}>
          {duration === 0 ? t('export.empty') : t('export.start')}
        </button>
      </div>
    </>
  )
}

// ───────── Màn hình 2: đang xuất ─────────

function ProgressView(): React.JSX.Element {
  const { t } = useTranslation()
  const progress = useExportStore((s) => s.progress)
  const path = useExportStore((s) => s.lastOutputPath)
  const percent = Math.round((progress?.progress ?? 0) * 100)

  return (
    <>
      <h2 className="modal-title">{t('export.running')}</h2>
      <p className="path" title={path ?? ''}>
        {path ? fileNameOf(path) : ''}
      </p>
      <div className="export-bar">
        <div style={{ width: `${percent}%` }} />
      </div>
      <dl className="info-list">
        <div>
          <dt>{t('export.percent')}</dt>
          <dd>{percent}%</dd>
        </div>
        <div>
          <dt>{t('export.elapsed')}</dt>
          <dd>{progress ? formatSeconds(progress.elapsedSec) : '…'}</dd>
        </div>
        <div>
          <dt>{t('export.eta')}</dt>
          <dd>{progress?.etaSec != null ? formatSeconds(progress.etaSec) : '…'}</dd>
        </div>
        <div>
          <dt>{t('export.speed')}</dt>
          <dd>{progress?.speed != null ? `${progress.speed.toFixed(1)}×` : '…'}</dd>
        </div>
        <div>
          <dt>{t('export.encoder')}</dt>
          <dd>{progress ? t(`export.encoders.${progress.encoder}`) : '…'}</dd>
        </div>
      </dl>
      <p className="hint">{t('export.backgroundHint')}</p>
      <div className="modal-actions">
        <button onClick={cancelExport}>{t('export.stop')}</button>
        <button onClick={closeExportDialog}>{t('export.runInBackground')}</button>
      </div>
    </>
  )
}

// ───────── Màn hình 3: kết quả ─────────

function errorMessage(result: Extract<ExportResult, { status: 'error' }>, t: TFunction): string {
  if (result.message === 'empty') return t('export.errors.empty')
  if (result.message.startsWith('missing:')) return t('export.errors.missing', { files: result.message.slice(8) })
  return t('export.errors.ffmpeg')
}

function ResultView(): React.JSX.Element {
  const { t } = useTranslation()
  const result = useExportStore((s) => s.result)
  if (!result) return <></>

  return (
    <>
      {result.status === 'done' && (
        <>
          <h2 className="modal-title success">✔ {t('export.done')}</h2>
          <p className="path" title={result.outputPath}>
            {fileNameOf(result.outputPath)}
          </p>
          <p className="hint">
            {t('export.doneDetail', {
              size: formatBytes(result.sizeBytes),
              time: formatSeconds(result.elapsedSec),
              encoder: t(`export.encoders.${result.encoder}`)
            })}
          </p>
        </>
      )}
      {result.status === 'cancelled' && <h2 className="modal-title">{t('export.cancelled')}</h2>}
      {result.status === 'error' && (
        <>
          <h2 className="modal-title error">✖ {t('export.failed')}</h2>
          <p>{errorMessage(result, t)}</p>
          {result.detail && (
            <details>
              <summary className="hint">{t('export.details')}</summary>
              <pre className="error-detail">{result.detail}</pre>
            </details>
          )}
        </>
      )}
      <div className="modal-actions">
        {result.status === 'done' && (
          <button onClick={() => window.cutcap.revealInFolder(result.outputPath)}>{t('export.reveal')}</button>
        )}
        <button className="primary" onClick={closeExportDialog}>
          {t('export.close')}
        </button>
      </div>
    </>
  )
}
