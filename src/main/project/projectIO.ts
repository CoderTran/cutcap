// Đọc/ghi file dự án trên ổ đĩa.
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { parseProjectJson, serializeProject } from '@shared/project/migrate'
import type { Project } from '@shared/project/schema'

export async function readProjectFile(filePath: string): Promise<Project> {
  const text = await readFile(filePath, 'utf8')
  // Bỏ ký tự BOM nếu file từng được mở/lưu bằng Notepad
  return parseProjectJson(text.replace(/^﻿/, ''))
}

/** Ghi dự án an toàn (xem writeTextAtomic). */
export async function writeProjectFile(filePath: string, project: Project): Promise<void> {
  await writeTextAtomic(filePath, serializeProject(project))
}

/**
 * Ghi file an toàn: ghi ra file tạm trước rồi mới đổi tên đè lên file thật.
 * Nhờ vậy nếu máy mất điện/crash giữa chừng, file cũ vẫn còn nguyên.
 */
export async function writeTextAtomic(filePath: string, text: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  await writeFile(tmpPath, text, 'utf8')
  try {
    await renameWithRetry(tmpPath, filePath)
  } catch (err) {
    await rm(tmpPath, { force: true })
    throw err
  }
}

/**
 * Trên Windows, đổi tên có thể thất bại tạm thời (EPERM/EBUSY) khi phần mềm diệt virus
 * hoặc OneDrive đang đọc file. Thử lại vài lần trước khi báo lỗi.
 */
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!retryable || i >= attempts) throw err
      await new Promise((resolve) => setTimeout(resolve, 100 * i))
    }
  }
}
