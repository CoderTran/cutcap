// Khung panel dùng chung: tiêu đề + nội dung.
import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  className?: string
  children?: ReactNode
}

export function Panel({ title, className = '', children }: PanelProps): React.JSX.Element {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">{title}</header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
