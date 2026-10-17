// Thư viện media (tab "Tệp phương tiện" và "Âm thanh" của bảng trái):
// nút Nhập, tìm kiếm, lọc theo loại, kéo thả file từ Windows Explorer, lưới thẻ media.
import { useMemo, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { fileNameOf } from '@shared/media/formats'
import type { MediaKind } from '@shared/project/schema'
import { dismissImportErrors, importPaths, pickAndImport } from '../../state/mediaActions'
import { pathKey, useMediaStore } from '../../state/mediaStore'
import { useProjectStore } from '../../state/projectStore'
import { Icon } from '../icons'
import { MediaCard } from './MediaCard'

type Filter = 'all' | MediaKind
const FILTERS: Filter[] = ['all', 'video', 'image', 'audio']

/** Kéo thả có chứa file từ bên ngoài (Explorer) không – phân biệt với kéo thẻ media nội bộ. */
const hasExternalFiles = (e: DragEvent): boolean => e.dataTransfer.types.includes('Files')

/** @param only chỉ hiện một loại media (tab Âm thanh dùng only="audio") */
export function MediaBin({ only }: { only?: MediaKind }): React.JSX.Element {
  const { t } = useTranslation()
  const assetsById = useProjectStore((s) => s.project.assets)
  const importing = useMediaStore((s) => s.importing)
  const importErrors = useMediaStore((s) => s.importErrors)
  const missingCount = useMediaStore(
    (s) => Object.values(assetsById).filter((a) => s.previews[pathKey(a.path)]?.status === 'missing').length
  )
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [dragDepth, setDragDepth] = useState(0)
  const kind = only ?? filter

  const assets = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi')
    return Object.values(assetsById)
      .filter((a) => (kind === 'all' || a.kind === kind) && (!q || a.name.toLocaleLowerCase('vi').includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))
  }, [assetsById, kind, query])
  const total = Object.values(assetsById).filter((a) => !only || a.kind === only).length

  // dragenter/dragleave bắn cả khi di chuột qua phần tử con → đếm "độ sâu" để không bị nháy
  const onDragEnter = (e: DragEvent): void => {
    if (!hasExternalFiles(e)) return
    e.preventDefault()
    setDragDepth((d) => d + 1)
  }
  const onDragLeave = (e: DragEvent): void => {
    if (!hasExternalFiles(e)) return
    setDragDepth((d) => Math.max(0, d - 1))
  }
  const onDragOver = (e: DragEvent): void => {
    if (!hasExternalFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDrop = (e: DragEvent): void => {
    if (!hasExternalFiles(e)) return
    e.preventDefault()
    setDragDepth(0)
    const paths = [...e.dataTransfer.files].map((f) => window.cutcap.getPathForFile(f)).filter(Boolean)
    void importPaths(paths)
  }

  return (
    <div
      className={`media-bin ${dragDepth > 0 ? 'drag-over' : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="media-toolbar">
        <button className="primary import-button" onClick={() => void pickAndImport()} disabled={importing}>
          <Icon name="plus" size={15} /> {importing ? t('media.importing') : t('media.import')}
        </button>
        <label className="search-box">
          <Icon name="search" size={14} />
          <input
            type="search"
            placeholder={t(only === 'audio' ? 'media.searchAudio' : 'media.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!only && (
          <select className="compact" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} title={t('media.filterTitle')}>
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {t(`media.filter.${f}`)}
              </option>
            ))}
          </select>
        )}
      </div>

      {missingCount > 0 && !only && <div className="notice warn">⚠ {t('media.missingNotice', { count: missingCount })}</div>}

      {importErrors.length > 0 && (
        <div className="notice error" role="alert">
          <div className="notice-head">
            <strong>{t('media.importErrors', { count: importErrors.length })}</strong>
            <button className="icon" onClick={dismissImportErrors} title={t('media.dismiss')}>
              <Icon name="close" size={12} />
            </button>
          </div>
          <ul>
            {importErrors.slice(0, 5).map((e) => (
              <li key={e.path}>
                {fileNameOf(e.path)} – {t(`media.errors.${e.error}`)}
              </li>
            ))}
            {importErrors.length > 5 && <li>…</li>}
          </ul>
        </div>
      )}

      {total === 0 ? (
        <button className="media-empty" onClick={() => void pickAndImport()}>
          <Icon name="plus" size={28} />
          <span>{t(only === 'audio' ? 'media.dropHintAudio' : 'media.dropHint')}</span>
          <span className="hint">{t('media.formats')}</span>
        </button>
      ) : (
        <>
          <div className="hint media-count">{t(`media.filter.${kind}`)}</div>
          <div className="media-grid">
            {assets.map((asset) => (
              <MediaCard key={asset.id} asset={asset} />
            ))}
          </div>
        </>
      )}

      {dragDepth > 0 && <div className="drop-overlay">{t('media.dropHere')}</div>}
    </div>
  )
}
