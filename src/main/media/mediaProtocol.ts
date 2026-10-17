// Đăng ký giao thức "cutcap-media://" – phục vụ file media cho <video>, <audio>, <img>.
// Hỗ trợ "Range" (đọc một đoạn file) để video tua được nhanh.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { contentTypeFor } from '@shared/media/formats'
import { MEDIA_SCHEME, filePathFromMediaUrl } from './mediaUrl'
import { parseRange } from './range'

/** Phải gọi TRƯỚC khi app sẵn sàng (trước app.whenReady). */
export function registerMediaSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      // corsEnabled: cho phép fetch() đọc file (cần cho Web Audio / vẽ sóng âm ở các bước sau)
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

/**
 * Gắn bộ xử lý cho giao thức. Gọi SAU khi app sẵn sàng.
 * @param isAllowed hàm kiểm tra đường dẫn có được phép đọc không
 */
export function handleMediaProtocol(isAllowed: (filePath: string) => boolean): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    // Giao thức này chỉ trang của chính Cutcap gọi được, nên cho phép mọi origin (file:// khi đã
    // đóng gói, http://localhost khi dev). Việc chặn file nhạy cảm do isAllowed() đảm nhiệm.
    const cors = { 'Access-Control-Allow-Origin': '*' }
    const filePath = filePathFromMediaUrl(request.url)
    if (!filePath || !isAllowed(filePath)) return new Response('Forbidden', { status: 403, headers: cors })

    let size: number
    try {
      const s = await stat(filePath)
      if (!s.isFile()) return new Response('Not found', { status: 404, headers: cors })
      size = s.size
    } catch {
      return new Response('Not found', { status: 404, headers: cors })
    }

    const headers = new Headers({
      ...cors,
      'Content-Type': contentTypeFor(filePath),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    })

    const range = parseRange(request.headers.get('range'), size)
    if (range === 'invalid') {
      headers.set('Content-Range', `bytes */${size}`)
      return new Response(null, { status: 416, headers })
    }

    const start = range?.start ?? 0
    const end = range?.end ?? size - 1
    headers.set('Content-Length', String(end - start + 1))
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`)

    // Đọc file dạng luồng (stream): không nạp cả file video vài GB vào bộ nhớ
    const body = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>
    return new Response(body, { status: range ? 206 : 200, headers })
  })
}
