# Thông báo giấy phép bên thứ ba – Cutcap

Cutcap được phát hành theo giấy phép **GNU GPL phiên bản 3 hoặc mới hơn** (GPL-3.0-or-later),
xem file `LICENSE`. Cutcap có sử dụng các phần mềm sau:

## FFmpeg (đóng gói kèm bộ cài)

- Bản build GPL "shared" của BtbN/FFmpeg-Builds cho Windows 64-bit
- Giấy phép: **GNU GPL v3** – nguyên văn trong `resources/ffmpeg/LICENSE.txt`
- Phiên bản, nguồn tải và checksum chính xác: `resources/ffmpeg/ffmpeg-build.json`
- Mã nguồn FFmpeg: https://ffmpeg.org/download.html
- Script build (để dựng lại đúng bản đã dùng): https://github.com/BtbN/FFmpeg-Builds
- Bản build này có kèm các thư viện như x264, x265, libvpx, opus… Mỗi thư viện có giấy phép riêng,
  tương thích GPL; danh sách đầy đủ xem trong mã nguồn FFmpeg-Builds ở trên.

Theo GPL, nếu bạn phân phối lại Cutcap, bạn phải cung cấp (hoặc chỉ rõ nơi lấy) mã nguồn tương ứng
của Cutcap và của FFmpeg.

## Electron & Chromium

- Electron – giấy phép MIT – https://github.com/electron/electron
- Chromium và các thành phần đi kèm: xem file `LICENSES.chromium.html` trong thư mục cài đặt Cutcap.

## Thư viện JavaScript (đã gộp vào mã giao diện)

| Thư viện | Giấy phép |
|---|---|
| React, React DOM | MIT |
| Zustand | MIT |
| Immer | MIT |
| i18next, react-i18next | MIT |
