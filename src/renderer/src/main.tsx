// Điểm khởi động của giao diện React.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './styles/global.css'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { initPreviewQuality } from './state/previewQuality'

// Báo chất lượng Xem trước đã nhớ cho main TRƯỚC khi nạp media (để không tạo nhầm bản proxy)
void initPreviewQuality()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
