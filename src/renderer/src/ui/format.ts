// Định dạng số liệu để hiển thị (dùng chung nhiều màn hình).

/** 6912345678 → "6,4 GB", 12345678 → "11,8 MB". */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: i >= 2 ? 1 : 0 })} ${units[i]}`
}

/** Thời điểm sửa: "Hôm nay 08:30" / "Hôm qua 21:05" / "15/10/2026". */
export function formatWhen(iso: string, labels: { today: string; yesterday: string }): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.floor((startOfToday.getTime() - date.getTime()) / 86_400_000) + 1
  if (date >= startOfToday) return `${labels.today} ${time}`
  if (days <= 1) return `${labels.yesterday} ${time}`
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
