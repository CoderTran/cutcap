// Chuỗi hiển thị trong các hộp thoại của main process.
// (Giao diện React dùng i18next; main process đơn giản hơn nên chỉ cần bảng chữ nhỏ này.)
import type { ProjectFormatError } from '@shared/project/migrate'

const vi = {
  fileFilterProject: 'Dự án Cutcap',
  openTitle: 'Mở dự án',
  saveTitle: 'Lưu dự án',
  untitled: 'Dự án chưa đặt tên',
  unsavedTitle: 'Thay đổi chưa lưu',
  unsavedMessage: (name: string) => `Bạn có muốn lưu thay đổi của "${name}" không?`,
  unsavedDetail: 'Nếu không lưu, các thay đổi sẽ bị mất.',
  btnSave: 'Lưu',
  btnDiscard: 'Không lưu',
  btnCancel: 'Hủy',
  importTitle: 'Nhập media',
  rendererCrashed: 'Giao diện Cutcap vừa bị dừng đột ngột',
  rendererCrashedDetail: 'Dự án của bạn vẫn còn trong bản tự động lưu. Bấm "Tải lại" để mở lại giao diện. Nếu lỗi lặp lại, hãy cập nhật trình điều khiển card đồ họa (driver) và gửi dòng bên dưới cho người phát triển.',
  reload: 'Tải lại',
  extractAudioTitle: 'Chọn video để trích xuất âm thanh',
  coverTitle: 'Chọn ảnh bìa',
  soundLibraryTitle: 'Chọn thư mục chứa âm thanh của bạn',
  /** Thư mục con (trong thư mục dự án) chứa các file âm thanh tách từ video. */
  extractedAudioFolder: 'Âm thanh trích xuất',
  filterAllMedia: 'Tất cả media',
  filterVideo: 'Video',
  filterImage: 'Ảnh',
  filterAudio: 'Âm thanh',
  exportTitle: 'Xuất video',
  relinkTitle: (name: string) => `Tìm lại file "${name}"`,
  openErrorTitle: 'Không mở được dự án',
  saveErrorTitle: 'Không lưu được dự án',
  formatError: {
    'invalid-json': 'File bị hỏng hoặc không phải định dạng JSON.',
    'not-a-project': 'File này không phải dự án Cutcap.',
    'too-new': 'Dự án được tạo bằng phiên bản Cutcap mới hơn. Hãy cập nhật Cutcap.',
    corrupted: 'Dữ liệu dự án bị hỏng.'
  } satisfies Record<ProjectFormatError['code'], string>
}

export type Strings = typeof vi

/** Hiện tại chỉ có tiếng Việt; sau này chọn bảng chữ theo cài đặt ngôn ngữ. */
export const strings: Strings = vi
