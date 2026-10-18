// Nút "+" ở góc ô (Văn bản, Hiệu ứng, Chuyển tiếp…): bấm vào mới thêm. Bấm 1 lần vào ô chỉ CHỌN ô,
// bấm đúp vào ô cũng thêm (giống CapCut). Nằm trong nút của ô → là <span role="button"> và chặn sự kiện.
import { Icon } from './icons'

export function TileAdd({ onAdd, title }: { onAdd: () => void; title?: string }): React.JSX.Element {
  const add = (e: React.SyntheticEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    onAdd()
  }
  return (
    <span
      role="button"
      tabIndex={0}
      className="tile-add"
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()} // bấm đúp vào + không tính là bấm đúp vào ô
      onClick={add}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && add(e)}
    >
      <Icon name="plus" size={14} />
    </span>
  )
}
