# THÙY AI VIDEO — PixVerse Auto Pipeline

## Mục tiêu

Luồng mới:

`Nhập ý tưởng → Gemini/Apps Script chia cảnh → chọn 1 ảnh nhân vật → PixVerse Fusion tạo các cảnh → tự chờ kết quả → tự gọi Lip Sync TTS cho lời thoại.`

## 1. Cloudflare Worker

File Worker mới là `pixverse-worker.js`.

Tạo một Worker riêng, ví dụ:

`thuy-ai-video-pixverse`

Không nên thay Worker Gemini hiện tại cho đến khi bản mới đã chạy thử.

Trong **Settings → Variables and Secrets**, tạo secret:

`PIXVERSE_API_KEY`

Giá trị là API key lấy từ PixVerse Platform.

Sau đó Deploy Worker.

Kiểm tra:

`GET https://TEN-WORKER-CUA-CHI.workers.dev/health`

Phải trả JSON có:

`ok: true`

## 2. Front-end

Mở `pixverse-auto.html`.

Trong phần đầu JavaScript có:

`const PIXVERSE_WORKER_URL = "https://thuy-ai-video-pixverse.phuongthuy-lotteria.workers.dev";`

Nếu tên Worker khác, chỉ sửa đúng URL này.

## 3. PixVerse API

Pipeline dùng:

- Upload Image
- V6 Fusion / Reference-to-Video
- Video Status
- Lip Sync TTS

Ảnh tham chiếu được dùng như `main_character` để giữ nhân vật xuyên các cảnh.

## 4. Lưu ý chi phí

PixVerse API **không phải API miễn phí không giới hạn**. API credits tách riêng với membership trên PixVerse Web.

Bản này mặc định 720p. Có thể đổi 540p để giảm chi phí thử nghiệm.

## 5. Kiểm thử an toàn

Nên thử 1 video 30 giây / 4 cảnh trước.

Không đưa API key vào `index.html` hoặc `pixverse-auto.html`.

API key chỉ đặt trong Cloudflare Worker Secret `PIXVERSE_API_KEY`.
