// Yêu thích: lưu ở <thư mục dữ liệu của app>/favorites.json – dùng chung cho mọi dự án.
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, ipcMain } from 'electron'
import { parseFavorites, type Favorites } from '@shared/favorites'
import { IpcChannels } from '@shared/ipc'
import { writeTextAtomic } from '../project/projectIO'

export function registerFavoritesHandlers(): void {
  const file = join(app.getPath('userData'), 'favorites.json')
  // Ghi lần lượt (bấm ★ liên tục không làm hai lần ghi chen nhau)
  let writing: Promise<void> = Promise.resolve()

  ipcMain.handle(IpcChannels.favoritesGet, async (): Promise<Favorites> => {
    try {
      return parseFavorites(JSON.parse(await readFile(file, 'utf8')))
    } catch {
      return parseFavorites(null)
    }
  })
  ipcMain.handle(IpcChannels.favoritesSave, (_event, raw: unknown): Promise<void> => {
    const favs = parseFavorites(raw)
    writing = writing
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(file), { recursive: true })
        await writeTextAtomic(file, JSON.stringify(favs, null, 1))
      })
    return writing
  })
}
