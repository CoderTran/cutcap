# Mô hình AI dùng cho "Giảm tiếng ồn"

| File | Nguồn | Ghi chú |
|---|---|---|
| `rnnoise-mp.rnnn` | [GregorR/rnnoise-models](https://github.com/GregorR/rnnoise-models) – `marathon-prescription-2018-08-29/mp.rnnn` | RNNoise, "dùng chung trong môi trường ồn" (giọng nói + âm thanh khác, ồn đường phố / đám đông…) |

- SHA-256: `4e84a448a4baf937992aaf4d10c8258007ec5d24219b6647dfd5fb4b563ad231`
- Chạy bằng bộ lọc `arnndn` có sẵn trong FFmpeg (xem `DENOISE_AF` trong `src/shared/render/voices.ts`).
- Theo README của kho gốc: các file mô hình không phải tác phẩm sáng tạo nên không thuộc diện bản quyền
  (chỉ thư mục `tools/` và README mới có bản quyền).
- Đóng gói kèm bộ cài vào `<thư mục cài>/resources/models/` (xem `electron-builder.yml`).
