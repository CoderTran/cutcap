// Chạy chương trình ngoài (ffmpeg / ffprobe) như một TIẾN TRÌNH RIÊNG.
// Vì chạy ở tiến trình khác, việc xử lý video nặng không bao giờ làm treo giao diện.
import { spawn } from 'node:child_process'

export interface RunOptions {
  /** Hủy giữa chừng (ví dụ người dùng xóa media khi đang tạo proxy). */
  signal?: AbortSignal
  /** Nhận từng dòng stdout ngay khi có (dùng để đọc tiến trình của ffmpeg). */
  onStdoutLine?: (line: string) => void
}

export interface RunResult {
  stdout: string
  stderr: string
}

export class ProcessError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string
  ) {
    super(message)
    this.name = 'ProcessError'
  }
}

/** Giữ tối đa bấy nhiêu ký tự output, tránh tốn bộ nhớ khi ffmpeg in rất nhiều. */
const MAX_OUTPUT = 2 * 1024 * 1024

export function runProcess(exe: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))

    const child = spawn(exe, args, {
      windowsHide: true, // không hiện cửa sổ đen (console) trên Windows
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let lineBuffer = ''

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk
      if (options.onStdoutLine) {
        lineBuffer += chunk
        const lines = lineBuffer.split(/\r?\n/)
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) options.onStdoutLine(line)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      // Chỉ giữ phần cuối – thông báo lỗi thật sự của ffmpeg luôn nằm ở cuối
      stderr = (stderr + chunk).slice(-MAX_OUTPUT)
    })

    const onAbort = (): void => {
      child.kill()
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    child.on('error', (err) => {
      options.signal?.removeEventListener('abort', onAbort)
      reject(err) // ví dụ: không tìm thấy ffmpeg.exe
    })
    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', onAbort)
      if (options.signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
      if (code === 0) return resolve({ stdout, stderr })
      const lastLines = stderr.trim().split(/\r?\n/).slice(-5).join('\n')
      reject(new ProcessError(`${exe} thoát với mã ${code}:\n${lastLines}`, code, stderr))
    })
  })
}

/**
 * Đọc tiến trình từ output "-progress pipe:1" của ffmpeg.
 * ffmpeg in các dòng dạng "out_time_us=1234567". Trả về micro-giây đã xử lý, hoặc null.
 */
export function parseProgressLine(line: string): number | null {
  const match = /^out_time_(?:us|ms)=(\d+)$/.exec(line.trim())
  // Lưu ý: "out_time_ms" của ffmpeg thực chất cũng là micro-giây (lỗi đặt tên lâu đời)
  return match ? Number(match[1]) : null
}
