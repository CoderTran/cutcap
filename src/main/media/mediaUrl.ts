// Giao thức riêng "cutcap-media://" để giao diện đọc file trên ổ đĩa.
//
// Tại sao không dùng file:// ? Khi chạy "npm run dev", giao diện được tải từ http://localhost,
// và trình duyệt chặn trang http đọc file://. Giao thức riêng hoạt động giống nhau
// cả khi dev lẫn khi đã đóng gói, và cho phép ta kiểm soát file nào được đọc.

export const MEDIA_SCHEME = 'cutcap-media'

/** "C:\Videos\bien.mp4" → "cutcap-media://local/C%3A%5CVideos%5Cbien.mp4?v=…" */
export function mediaUrl(filePath: string, version?: string | number): string {
  const query = version !== undefined ? `?v=${encodeURIComponent(String(version))}` : ''
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(filePath)}${query}`
}

/** Ngược lại của mediaUrl(). null nếu URL sai dạng. */
export function filePathFromMediaUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.host !== 'local') return null
    return decodeURIComponent(parsed.pathname.slice(1))
  } catch {
    return null
  }
}
