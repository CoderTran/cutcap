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

## Mô hình khử ồn RNNoise (đóng gói kèm bộ cài)

- File `resources/models/rnnoise-mp.rnnn` – mô hình "marathon-prescription" từ
  https://github.com/GregorR/rnnoise-models, chạy bằng bộ lọc `arnndn` của FFmpeg
- Theo README của kho gốc, các file mô hình không thuộc diện bản quyền. Chi tiết: `resources/models/README.md`

## whisper.cpp & mô hình nhận dạng giọng nói (Phụ đề tự động)

- whisper.cpp – giấy phép **MIT** – https://github.com/ggml-org/whisper.cpp
  (đóng gói kèm bộ cài ở `resources/whisper/`, nguyên văn giấy phép trong `LICENSE.txt` ở đó)
- Mô hình dò tiếng nói Silero VAD (bản ggml) – MIT – https://huggingface.co/ggml-org/whisper-vad
- Mô hình Whisper `ggml-small-q5_1.bin` (OpenAI Whisper, bản ggml) – MIT –
  https://huggingface.co/ggerganov/whisper.cpp – không đóng gói, app tải về khi dùng lần đầu

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
