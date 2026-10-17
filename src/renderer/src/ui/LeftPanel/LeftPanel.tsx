// Bảng trái kiểu CapCut: hàng tab có biểu tượng ở trên, nội dung của tab bên dưới.
// Chỉ có những tab đã có chức năng; Nhãn dán, Hiệu ứng, Chú thích, Mẫu… sẽ thêm khi làm xong.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../icons'
import { MediaBin } from '../MediaBin/MediaBin'
import { FiltersTab } from './FiltersTab'
import { TextTab } from './TextTab'
import { TransitionsTab } from './TransitionsTab'

type Tab = 'media' | 'audio' | 'text' | 'transitions' | 'filters'

const TABS: { id: Tab; icon: IconName }[] = [
  { id: 'media', icon: 'media' },
  { id: 'audio', icon: 'audio' },
  { id: 'text', icon: 'text' },
  { id: 'transitions', icon: 'transition' },
  { id: 'filters', icon: 'filter' }
]

export function LeftPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('media')

  return (
    <section className="panel left-panel">
      <nav className="left-tabs">
        {TABS.map(({ id, icon }) => (
          <button key={id} className={`left-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <Icon name={icon} size={20} />
            <span>{t(`leftPanel.${id}`)}</span>
          </button>
        ))}
      </nav>
      <div className="left-content">
        {tab === 'media' && <MediaBin />}
        {tab === 'audio' && <MediaBin only="audio" />}
        {tab === 'text' && <TextTab />}
        {tab === 'transitions' && <TransitionsTab />}
        {tab === 'filters' && <FiltersTab />}
      </div>
    </section>
  )
}
