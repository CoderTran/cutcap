// "Lưới an toàn" cho giao diện: một phần giao diện gặp lỗi thì hiện thông báo kèm nội dung lỗi
// (để gửi cho người sửa) và nút Tải lại – thay vì cả cửa sổ trắng/đen trơn.
// Dự án vẫn còn trong bản tự động lưu, tải lại sẽ thấy ở Trang chủ.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

interface State {
  error: Error | null
  componentStack: string
  copied: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, componentStack: '', copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Cutcap] Giao diện gặp lỗi:', error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? '' })
  }

  private details(): string {
    const { error, componentStack } = this.state
    return [`${error?.name}: ${error?.message}`, error?.stack ?? '', 'Component:', componentStack.trim()].join('\n')
  }

  render(): ReactNode {
    const { error, copied } = this.state
    if (!error) return this.props.children
    const t = i18n.t.bind(i18n)
    return (
      <div className="crash">
        <div className="crash-box">
          <h2>{t('crash.title')}</h2>
          <p className="hint">{t('crash.text')}</p>
          <pre className="error-detail crash-detail">{this.details()}</pre>
          <div className="modal-actions">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(this.details())
                this.setState({ copied: true })
              }}
            >
              {copied ? t('crash.copied') : t('crash.copy')}
            </button>
            <button className="primary" onClick={() => window.location.reload()}>
              {t('crash.reload')}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
