# FFmpeg cho Cutcap

## Cài tự động (khuyên dùng)

```
npm run setup:ffmpeg
```

Script [scripts/setup-ffmpeg.mjs](../../scripts/setup-ffmpeg.mjs) sẽ tải bản build **GPL, shared**
của BtbN (~90 MB), kiểm tra checksum SHA-256, rồi chép vào thư mục này:

- `ffmpeg.exe`, `ffprobe.exe` và các file `*.dll` dùng chung
- `LICENSE.txt` – giấy phép của FFmpeg
- `ffmpeg-build.json` – ghi lại bản build nào, tải từ đâu, checksum (phục vụ tuân thủ GPL)

Tùy chọn:

- `npm run setup:ffmpeg -- --force`: tải lại
- `npm run setup:ffmpeg -- --version 9.0`: dùng nhánh FFmpeg khác

Các file này không được đưa vào git (xem `.gitignore`); trên máy mới chỉ cần chạy lại lệnh trên.

## Giấy phép

Bản build GPL bắt buộc ứng dụng phát hành theo giấy phép tương thích GPL
(Cutcap dùng GPL-3.0-or-later). Khi phát hành bộ cài, phải kèm `LICENSE.txt`
của FFmpeg và ghi rõ nơi lấy mã nguồn của đúng bản build đã dùng (có trong `ffmpeg-build.json`).
