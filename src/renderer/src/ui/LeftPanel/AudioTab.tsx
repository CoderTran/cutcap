// Tab Âm thanh (giống CapCut): cột trái chọn mục – "Của bạn" (âm thanh đã nhập), "Hiệu ứng âm thanh" (Cutcap tự tạo)
// và "Thư viện của bạn" (thư mục âm thanh trên máy) theo nhóm; bên phải là danh sách.
// Bấm một dòng để nghe thử, bấm + để thêm vào timeline tại đầu phát.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SFX_CATEGORIES, SFX_LIST, type SfxCategory } from '@shared/audio/sfxCatalog'
import { SOUND_LIBRARY_CATEGORIES, type SoundLibraryCategory, type SoundLibraryItem } from '@shared/audio/soundLibrary'
import { formatDuration } from '@shared/project/time'
import {
  addLibrarySoundToTimeline,
  addSfxToTimeline,
  clearSoundLibrary,
  loadSoundLibrary,
  pickSoundLibraryFolder,
  rescanSoundLibrary,
  stopSfxPreview,
  toggleLibraryPreview,
  toggleSfxPreview,
  useSfxAdding,
  useSfxPlaying,
  useSoundLibrary,
  useSoundLibraryScanning
} from '../../state/sfxActions'
import { useFavorites } from '../../state/favoritesStore'
import { FavoriteStar } from '../Favorites'
import { HelpTip } from '../HelpTip'
import { Icon } from '../icons'
import { MediaBin } from '../MediaBin/MediaBin'

type Section = 'favorites' | 'yours' | 'sfx' | 'library'

export function AudioTab(): React.JSX.Element {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('yours')
  const [sfxCategory, setSfxCategory] = useState<SfxCategory | 'all'>('all')
  const [libCategory, setLibCategory] = useState<SoundLibraryCategory | 'all'>('all')
  const library = useSoundLibrary()
  // Rời tab → dừng âm thanh đang nghe thử
  useEffect(() => () => stopSfxPreview(), [])
  useEffect(() => {
    if (!library) void loadSoundLibrary()
  }, [library])

  const favCount = useFavorites('sfx').length + useFavorites('sound').length
  const libCounts = new Map<SoundLibraryCategory, number>()
  for (const i of library?.items ?? []) libCounts.set(i.category, (libCounts.get(i.category) ?? 0) + 1)

  const group = (id: Section, label: string): React.JSX.Element => (
    <button
      className={`audio-nav-item group ${section === id ? 'active' : ''}`}
      onClick={() => {
        stopSfxPreview()
        setSection(id)
      }}
    >
      <span>{label}</span>
      {id === 'favorites' && favCount > 0 && <small>{favCount}</small>}
      {(id === 'sfx' || id === 'library') && (
        <Icon name="chevronDown" size={12} style={{ transform: section === id ? 'rotate(180deg)' : undefined }} />
      )}
    </button>
  )

  return (
    <div className="audio-tab">
      <nav className="audio-nav">
        {group('favorites', `★ ${t('favorites.title')}`)}
        {group('yours', t('sfx.yours'))}
        {group('sfx', t('sfx.title'))}
        {section === 'sfx' &&
          (['all', ...SFX_CATEGORIES] as const).map((c) => (
            <button key={c} className={`audio-nav-sub ${sfxCategory === c ? 'active' : ''}`} onClick={() => setSfxCategory(c)}>
              {t(`sfx.categories.${c}`)}
            </button>
          ))}
        {group('library', t('soundLibrary.title'))}
        {section === 'library' &&
          (library?.items.length ?? 0) > 0 &&
          (['all', ...SOUND_LIBRARY_CATEGORIES] as const)
            .filter((c) => c === 'all' || libCounts.has(c))
            .map((c) => (
              <button key={c} className={`audio-nav-sub ${libCategory === c ? 'active' : ''}`} onClick={() => setLibCategory(c)}>
                <span>{t(`soundLibrary.categories.${c}`)}</span>
                <small>{c === 'all' ? library?.items.length : libCounts.get(c)}</small>
              </button>
            ))}
      </nav>
      <div className="audio-body">
        {section === 'favorites' && <FavoriteSounds />}
        {section === 'yours' && <MediaBin only="audio" />}
        {section === 'sfx' && <SfxList category={sfxCategory} />}
        {section === 'library' && <LibraryList category={libCategory} />}
      </div>
    </div>
  )
}

/** Một dòng âm thanh: biểu tượng, tên, nhóm · độ dài, nút +. Bấm dòng = nghe thử. */
function SoundRow({
  name,
  detail,
  playing,
  addDisabled,
  fav,
  onPreview,
  onAdd
}: {
  name: string
  detail: string
  playing: boolean
  addDisabled: boolean
  /** ★ Yêu thích: hiệu ứng (id) hoặc âm thanh trong Thư viện của bạn (đường dẫn file). */
  fav: { kind: 'sfx' | 'sound'; id: string }
  onPreview: () => void
  onAdd: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className={`sfx-row ${playing ? 'playing' : ''}`} onClick={onPreview} title={t('sfx.previewHint')}>
      <span className="sfx-icon">
        <Icon name={playing ? 'pause' : 'audio'} size={15} />
      </span>
      <span className="sfx-text">
        <b title={name}>{name}</b>
        <small>{detail}</small>
      </span>
      <FavoriteStar kind={fav.kind} id={fav.id} />
      <button
        className="icon sfx-add"
        title={t('sfx.add')}
        disabled={addDisabled}
        onClick={(e) => {
          e.stopPropagation()
          onAdd()
        }}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  )
}

const duration = (us: number): string => formatDuration(Math.max(1_000_000, Math.round(us / 1_000_000) * 1_000_000))

function SearchBox({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}): React.JSX.Element {
  return <input className="sfx-search" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
}

function SfxList({ category }: { category: SfxCategory | 'all' }): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const playing = useSfxPlaying()
  const adding = useSfxAdding()
  const q = query.trim().toLowerCase()
  const items = SFX_LIST.filter((s) => category === 'all' || s.categories.includes(category)).filter(
    (s) => q === '' || t(`sfx.items.${s.id}`).toLowerCase().includes(q)
  )

  return (
    <div className="left-scroll sfx-list">
      <SearchBox value={query} onChange={setQuery} placeholder={t('sfx.search')} />
      <h4 className="left-heading">{t(`sfx.categories.${category}`)}</h4>
      {items.map((s) => {
        const name = t(`sfx.items.${s.id}`)
        return (
          <SoundRow
            key={s.id}
            name={name}
            detail={`${t(`sfx.categories.${s.categories[0]}`)} · ${duration(s.duration * 1_000_000)}`}
            playing={playing === s.id}
            addDisabled={adding !== null}
            fav={{ kind: 'sfx', id: s.id }}
            onPreview={() => void toggleSfxPreview(s.id)}
            onAdd={() => void addSfxToTimeline(s.id, name)}
          />
        )
      })}
      {items.length === 0 && <p className="hint">{t('sfx.empty')}</p>}
      <p className="hint sfx-note">{t('sfx.note')}</p>
    </div>
  )
}

/** Thư viện của bạn: thư mục âm thanh trên máy (chọn / quét lại / bỏ) + danh sách theo nhóm. */
function LibraryList({ category }: { category: SoundLibraryCategory | 'all' }): React.JSX.Element {
  const { t } = useTranslation()
  const library = useSoundLibrary()
  const scanning = useSoundLibraryScanning()
  const playing = useSfxPlaying()
  const adding = useSfxAdding()
  const [query, setQuery] = useState('')

  if (!library?.folder) {
    return (
      <div className="left-scroll sound-library-empty">
        <h4 className="left-heading">{t('soundLibrary.title')}</h4>
        <p className="hint">{t('soundLibrary.intro')}</p>
        <button className="primary" disabled={scanning} onClick={() => void pickSoundLibraryFolder()}>
          {scanning ? t('soundLibrary.scanning') : t('soundLibrary.pick')}
        </button>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const items: SoundLibraryItem[] = library.items
    .filter((i) => category === 'all' || i.category === category)
    .filter((i) => q === '' || i.name.toLowerCase().includes(q))

  return (
    <div className="left-scroll sfx-list">
      <div className="sound-library-head">
        <span className="path" title={library.folder}>
          {library.folder.split(/[\\/]/).pop()}
        </span>
        <HelpTip
          text={t('soundLibrary.summary', {
            count: library.items.length,
            duplicates: library.duplicates,
            skipped: library.skipped,
            folder: library.folder
          })}
        />
        <button className="icon ghost" disabled={scanning} title={t('soundLibrary.rescan')} onClick={() => void rescanSoundLibrary()}>
          <Icon name="undo" size={13} />
        </button>
        <button className="link" disabled={scanning} onClick={() => void pickSoundLibraryFolder()}>
          {t('soundLibrary.change')}
        </button>
        <button className="link" disabled={scanning} onClick={() => void clearSoundLibrary()}>
          {t('soundLibrary.remove')}
        </button>
      </div>
      {scanning && <p className="hint">{t('soundLibrary.scanning')}</p>}
      <SearchBox value={query} onChange={setQuery} placeholder={t('soundLibrary.search')} />
      <h4 className="left-heading">{t(`soundLibrary.categories.${category}`)}</h4>
      {items.map((i) => (
        <SoundRow
          key={i.path}
          name={i.name}
          detail={`${t(`soundLibrary.categories.${i.category}`)} · ${duration(i.durationUs)}`}
          playing={playing === i.path}
          addDisabled={adding !== null}
          fav={{ kind: 'sound', id: i.path }}
          onPreview={() => void toggleLibraryPreview(i)}
          onAdd={() => void addLibrarySoundToTimeline(i)}
        />
      ))}
      {items.length === 0 && !scanning && <p className="hint">{t('sfx.empty')}</p>}
      <p className="hint sfx-note">{t('soundLibrary.note')}</p>
    </div>
  )
}

/** ★ Yêu thích: hiệu ứng âm thanh + âm thanh trong Thư viện của bạn đã đánh dấu (mới đánh dấu trước). */
function FavoriteSounds(): React.JSX.Element {
  const { t } = useTranslation()
  const sfxFavs = useFavorites('sfx')
  const soundFavs = useFavorites('sound')
  const library = useSoundLibrary()
  const playing = useSfxPlaying()
  const adding = useSfxAdding()
  const sfx = sfxFavs.map((id) => SFX_LIST.find((s) => s.id === id)).filter((s) => s !== undefined)
  const sounds = soundFavs.map((path) => library?.items.find((i) => i.path === path)).filter((i) => i !== undefined)

  return (
    <div className="left-scroll sfx-list">
      <h4 className="left-heading">★ {t('favorites.title')}</h4>
      {sfx.map((s) => {
        const name = t(`sfx.items.${s.id}`)
        return (
          <SoundRow
            key={s.id}
            name={name}
            detail={`${t(`sfx.categories.${s.categories[0]}`)} · ${duration(s.duration * 1_000_000)}`}
            playing={playing === s.id}
            addDisabled={adding !== null}
            fav={{ kind: 'sfx', id: s.id }}
            onPreview={() => void toggleSfxPreview(s.id)}
            onAdd={() => void addSfxToTimeline(s.id, name)}
          />
        )
      })}
      {sounds.map((i) => (
        <SoundRow
          key={i.path}
          name={i.name}
          detail={`${t('soundLibrary.title')} · ${duration(i.durationUs)}`}
          playing={playing === i.path}
          addDisabled={adding !== null}
          fav={{ kind: 'sound', id: i.path }}
          onPreview={() => void toggleLibraryPreview(i)}
          onAdd={() => void addLibrarySoundToTimeline(i)}
        />
      ))}
      {sfx.length + sounds.length === 0 && <p className="hint">{t('favorites.empty')}</p>}
    </div>
  )
}
