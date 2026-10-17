// Liệt kê font cài trong Windows (cả font hệ thống lẫn font người dùng tự cài).
// Dùng .NET (System.Drawing.InstalledFontCollection) qua PowerShell – có sẵn trên mọi máy Windows 10/11,
// trả về đúng TÊN HỌ FONT (vd. "Segoe UI") mà canvas dùng được, không cần thư viện ngoài.
import { runProcess } from './media/processRunner'

/** Dùng tạm nếu không đọc được danh sách (rất hiếm). */
const FALLBACK_FONTS = ['Arial', 'Calibri', 'Cambria', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana']

const SCRIPT = [
  // In tên font bằng UTF-8 để tên font tiếng Việt / tiếng Nhật… không bị lỗi ký tự
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Drawing',
  '(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'
].join('; ')

let cached: Promise<string[]> | null = null

/** Danh sách font A→Z (chỉ đọc 1 lần mỗi lần mở app, mất khoảng 1 giây). */
export function listSystemFonts(): Promise<string[]> {
  cached ??= (async () => {
    try {
      const { stdout } = await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT])
      const names = [...new Set(stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))]
      return names.length > 0 ? names.sort((a, b) => a.localeCompare(b)) : FALLBACK_FONTS
    } catch {
      return FALLBACK_FONTS
    }
  })()
  return cached
}
