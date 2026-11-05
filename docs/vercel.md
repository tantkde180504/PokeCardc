# Vercel + PostgreSQL

Frontend vẫn là JavaScript thuần. Vercel phục vụ `public/` qua CDN, chuyển `/api/*` tới `api/index.js`; backend lưu dữ liệu trong PostgreSQL qua driver `pg`. Không ghi SQLite vào filesystem Vercel.

## Thiết lập trên dashboard

1. Mở [Vercel New Project](https://vercel.com/new), đăng nhập và import repo private `tantkde180504/PokeCardc`. Nếu repo không hiển thị, cấp GitHub App của Vercel quyền truy cập repo này.
2. Tên project: `pokecardc`. Root directory: gốc repo. Framework: **Other**. Node.js: **24.x**. Install command: `npm ci`. Build command: `npm run build`. Output directory: `public`. `vercel.json` đã khai báo build/output và routing.
3. Tạo một PostgreSQL dành riêng cho PokeCard từ [Vercel Marketplace — Neon](https://vercel.com/marketplace/neon), hoặc dùng PostgreSQL riêng của bạn. Chọn khu vực gần function. Kiểm tra gói/giới hạn hiển thị trước khi xác nhận; ứng dụng không yêu cầu gói trả phí.
4. Kết nối database vào project. Trong Settings → Environment Variables, kiểm tra có **`DATABASE_URL`** cho Production. Dùng connection string pooled do provider cung cấp, giữ nguyên các tùy chọn TLS của provider. Nếu integration chỉ tạo tên biến khác, thêm `DATABASE_URL` với cùng connection string. Không dùng database ACVIS.
5. Deploy hoặc redeploy sau khi kết nối database. Nếu project đã deploy trước khi có database, build vẫn có thể thành công nhưng API trả 503 có thông báo thiếu `DATABASE_URL`. Cần redeploy sau khi cấu hình biến môi trường.
6. Mở URL production để kiểm tra đăng ký, thêm bộ sưu tập, bán card và đặt hàng. Dữ liệu cloud bắt đầu mới, không có tài khoản local mặc định.

Preview cần database/branch riêng nếu muốn thử nghiệm tách biệt. Chỉ bật biến `DATABASE_URL` cho những environment có database tương ứng; không tự dùng chung dữ liệu production cho preview.

## CLI

CLI chưa cài toàn cục cũng có thể chạy:

```sh
npx vercel@65.11.0 login
npx vercel@65.11.0 link --project pokecardc
npx vercel@65.11.0 env pull .env.vercel.local --environment=production
npx vercel@65.11.0 pull --yes --environment=production
npx vercel@65.11.0 build --prod
npx vercel@65.11.0 deploy --prebuilt --prod
```

File `.env.vercel.local` và `.vercel/` đã được loại khỏi Git. Không in giá trị `DATABASE_URL` vào chat hoặc commit. Các lệnh trên cần tài khoản Vercel đã phê duyệt đăng nhập và project đã có database. Có thể dùng deployment trực tiếp `npx vercel@65.11.0 --prod` sau khi đã link project/cấu hình môi trường thay vì build trên máy.

## Kiểm tra trước khi phát hành

```sh
npm ci
npm run build
npm test
npm run test:browser
```

`npm run build` kiểm tra cú pháp; frontend không cần bundler. Vercel thực hiện việc đóng gói Node.js Function. Build này không kết nối hoặc tạo database. Lần gọi API đầu tiên tạo các bảng và dữ liệu mẫu; tài khoản database cần quyền tạo bảng trong database riêng.

Kiểm tra cloud: `/api/me` trả JSON, `/api/listings` có card, đăng ký trả cookie `Secure; HttpOnly; SameSite=Strict`, đăng nhập lại vẫn thấy bộ sưu tập, giỏ hàng và đơn hàng. Việc build thành công chưa xác minh PostgreSQL cloud hoặc luồng trên deployment thật.

## Nguồn

- [SQLite trên Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel): local filesystem không cung cấp persistence phù hợp cho database.
- [Node.js trên Vercel](https://vercel.com/docs/functions/runtimes/node-js).
- [Cấu hình vercel.json](https://vercel.com/docs/project-configuration/vercel-json).
- [PostgreSQL trên Vercel Marketplace](https://vercel.com/docs/postgres).
- [Giao dịch với node-postgres](https://node-postgres.com/features/transactions).
