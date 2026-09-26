# Đo độ ồn (Decibel Meter)

Ứng dụng web đo độ ồn bằng micro của trình duyệt. Toàn bộ xử lý âm thanh diễn ra phía client bằng Web Audio API — không có backend, không dữ liệu nào rời khỏi máy của bạn.

## ⚠️ Yêu cầu quan trọng: HTTPS hoặc localhost

Trình duyệt chỉ cho phép truy cập micro (`getUserMedia`) trên các trang phục vụ qua **HTTPS** hoặc trên **localhost**. Khi deploy lên production, hãy đảm bảo domain của bạn có SSL/TLS hợp lệ, nếu không tính năng đo sẽ không hoạt động.

## Bắt đầu

```bash
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) trên trình duyệt (ưu tiên thử trên điện thoại thật để có kết quả micro chính xác nhất).

Kiểm tra type/lint và build production:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Web Audio API: `getUserMedia` + `AnalyserNode` (+ `IIRFilterNode` cho A-weighting)
- Không có thư viện chart — biểu đồ realtime vẽ trực tiếp bằng Canvas 2D

## Cấu trúc code

- `src/hooks/useDecibelMeter.ts` — hook quản lý toàn bộ vòng đời đo: xin quyền micro, dựng audio graph, tính RMS → dBFS → dB tham khảo, làm mượt, thống kê phiên, wake lock, cleanup.
- `src/lib/aWeighting.ts` — thiết kế bộ lọc A-weighting (IEC 61672) chính xác bằng phép biến đổi song tuyến tính (bilinear transform) cho `IIRFilterNode`, có fallback bằng chuỗi `BiquadFilterNode` cho trình duyệt không hỗ trợ `IIRFilterNode`.
- `src/lib/dbScale.ts` — định nghĩa các mức độ ồn (ngưỡng dB, màu sắc, nhãn tiếng Việt, ví dụ).
- `src/components/Gauge.tsx` — đồng hồ đo dạng bán nguyệt (SVG), 30–120 dB.
- `src/components/LiveChart.tsx` — biểu đồ đường realtime 60 giây gần nhất (Canvas).
- `src/components/StatsPanel.tsx` — thống kê Min / Trung bình (theo năng lượng) / Max / Peak / thời gian đo + nút Reset.
- `src/components/CalibrationPanel.tsx` — hiệu chỉnh offset dB (lưu localStorage) và chọn trọng số Z / A.

## Ghi chú về độ chính xác

Micro của điện thoại và laptop **không được hiệu chuẩn** để đo dB SPL tuyệt đối chính xác như máy đo chuyên dụng. Giá trị hiển thị chỉ mang tính tham khảo. Bạn có thể dùng ô "offset dB" trong phần Hiệu chỉnh để căn chỉnh gần hơn với một máy đo chuẩn nếu có.
