# whisper.cpp cho Cutcap (Phụ đề tự động)

## Cài tự động

```
npm run setup:whisper
```

Script [scripts/setup-whisper.mjs](../../scripts/setup-whisper.mjs) tải bản build Windows x64 của
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) (giấy phép **MIT**), kiểm tra SHA-256, rồi chép vào đây:

- `whisper-cli.exe` – chuyển giọng nói thành chữ
- `whisper-vad-speech-segments.exe` – tìm các đoạn có người nói
- `whisper.dll`, `ggml*.dll` – thư viện đi kèm (mỗi loại CPU một bản, tự chọn bản nhanh nhất)
- `ggml-silero-v6.2.0.bin` – mô hình dò tiếng nói Silero VAD (MIT, ~0,9 MB)
- `LICENSE.txt`, `whisper-build.json` – giấy phép và thông tin bản đã dùng

Các file này không đưa vào git (xem `.gitignore`).

## Mô hình nhận dạng giọng nói

`ggml-small-q5_1.bin` (~190 MB, Whisper của OpenAI chuyển sang ggml – MIT) **không** đóng gói kèm bộ cài:
app tự tải từ Hugging Face về `%APPDATA%\Cutcap\models\` khi người dùng bấm "Tạo" phụ đề lần đầu,
kiểm tra SHA-256 rồi mới dùng. Xem `src/main/captions/whisperModel.ts`.
