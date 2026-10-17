// Tìm lại file media bị mất (bị di chuyển / đổi thư mục).
// Khi người dùng chỉ ra vị trí mới của MỘT file, ta thử tìm các file bị mất khác có cùng tên
// trong cùng thư mục mới – thường cả thư mục dự án được chép sang chỗ khác.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileNameOf } from '@shared/media/formats'

/**
 * @param folder    thư mục mới
 * @param oldPaths  đường dẫn cũ của các file đang bị mất
 * @returns đường dẫn cũ → đường dẫn mới (chỉ những file tìm thấy)
 */
export function findInFolder(folder: string, oldPaths: string[]): Record<string, string> {
  const found: Record<string, string> = {}
  for (const oldPath of oldPaths) {
    const candidate = join(folder, fileNameOf(oldPath))
    if (existsSync(candidate)) found[oldPath] = candidate
  }
  return found
}
