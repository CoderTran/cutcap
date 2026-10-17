# Cutcap

Phần mềm chỉnh sửa video cho Windows 10/11 – dễ dùng, xuất nhanh. Electron + React + TypeScript + FFmpeg.
Giấy phép: GPL-3.0-or-later (xem `LICENSE` và `THIRD_PARTY_NOTICES.md`).

## Cài môi trường (một lần)

- Node.js LTS ≥ 22.12 (64-bit), Git, VS Code
- Trong thư mục dự án:

```
npm install
npm run setup:ffmpeg     # tải FFmpeg (GPL, ~90 MB) vào resources/ffmpeg
npm run icons            # tạo icon vào build/ (đã có sẵn trong git, chỉ cần khi sửa icon)
```

## Lệnh hằng ngày

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy app ở chế độ phát triển (giao diện tự cập nhật khi sửa code; sửa `src/main` thì chạy lại) |
| `npm test` | Chạy toàn bộ test (cần FFmpeg cho các test xuất video thật) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run dist` | Tạo bộ cài `dist/Cutcap-Setup-<version>.exe` |

Đổi phiên bản: sửa `"version"` trong `package.json` trước khi `npm run dist`.

## Cấu trúc

```
src/shared/     Mô hình dự án + logic dùng chung (timeline, chuyển cảnh, màu, chữ…) – hàm thuần, có test
src/main/       Tiến trình chính: file, FFmpeg (probe, proxy, xuất video), font, tự động lưu
src/preload/    Cầu nối an toàn main ↔ giao diện (window.cutcap)
src/renderer/   Giao diện React: state (zustand), engine preview (canvas + Web Audio), UI
tests/          Vitest – gồm test xuất video thật và so điểm ảnh/âm lượng
scripts/        setup-ffmpeg, make-icons, dist
resources/      FFmpeg (không đưa vào git)
build/          Icon cho bộ cài
```

Nguyên tắc quan trọng: preview và xuất video dùng CHUNG công thức (`src/shared/`), nên video xuất ra
giống preview. Mọi thay đổi dự án đi qua `projectStore.apply(...)` để có Undo/Redo.
