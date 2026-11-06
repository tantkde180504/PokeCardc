# PokeCard

Ứng dụng quản lý và mua bán card Pokémon dùng làm dự án thử nghiệm cho ACVIS. Frontend HTML/CSS/JavaScript thuần, backend Node.js; SQLite cho local và PostgreSQL cho Vercel.

## Chạy trên máy

Vercel dùng Node.js **24.x**; kiểm thử local cũng đã chạy trên Node.js 26. Cài dependency theo lockfile trước khi chạy:

```sh
npm ci
npm start
```

Mở **http://127.0.0.1:3000**. Dùng `npm run dev` để tự khởi động lại backend khi sửa file. Frontend cần tải lại trang sau khi sửa.

## Luồng sử dụng

1. Khám phá, tìm kiếm và lọc các tin bán mẫu theo hệ, giá, tên và bộ thẻ.
2. Đăng ký tài khoản với email giả lập và mật khẩu ít nhất 10 ký tự. Không có tài khoản mặc định hoặc thông tin xác thực thật trong mã nguồn.
3. Thêm card đang sở hữu trong **Bộ sưu tập**. Đây là tính năng ghi nhận bộ sưu tập cá nhân, không phải giao dịch mua.
4. Đăng bán card từ bộ sưu tập; số lượng được giữ riêng khỏi card đang sở hữu. Dừng bán để nhận lại số lượng chưa bán.
5. Thêm tin bán của người khác vào giỏ hàng, thay đổi số lượng và xác nhận đặt hàng.
6. Xem đơn mua và lịch sử bán trong **Đơn hàng**. Card mua được chuyển vào bộ sưu tập. Giá tính lại phía server, đơn hàng được ghi trong một giao dịch SQLite.

Thanh toán, giao hàng và giá đều là **giả lập**. Hình card là minh họa CSS nội bộ, không sử dụng ảnh card thật hay dịch vụ bên ngoài. Chưa có chat, upload ảnh, thanh toán, vận chuyển hoặc quản trị danh mục trong giao diện. Danh mục khởi tạo nằm trong `server/catalog.js`.

## Dữ liệu

Khi không có `DATABASE_URL`, SQLite tạo tự động tại `data/pokecard.sqlite`, được loại khỏi Git. Tài khoản, giỏ hàng, bộ sưu tập và đơn hàng còn nguyên sau khi khởi động lại. Muốn bắt đầu lại: dừng server, sao lưu nếu cần, đổi tên thư mục `data`, rồi chạy `npm start`; ứng dụng tạo dữ liệu mẫu mới. Không có nút reset công khai có thể xóa dữ liệu của người khác.

Khi có `DATABASE_URL`, backend dùng PostgreSQL. Bảng và card mẫu được khởi tạo bằng giao dịch với khóa đồng bộ. Dữ liệu SQLite cũ không tự sao chép sang PostgreSQL.

## Triển khai Vercel

Đã có `vercel.json`, API function và cấu hình Node.js 24.x. Xem [hướng dẫn Vercel + PostgreSQL](docs/vercel.md). Cần PostgreSQL riêng và biến môi trường `DATABASE_URL`; ứng dụng trên Vercel không dùng SQLite tạm để lưu tài khoản/đơn hàng.

Project Vercel: `poke-card/pokecardc`. URL: https://pokecardc.vercel.app. PostgreSQL Neon `pokecardc-db` được kết nối riêng cho Production; biến kết nối do integration quản lý, không nằm trong Git.

## Kiểm tra

```sh
npm run build
npm test
```

Test dùng HTTP thật, SQLite riêng trong bộ nhớ và PostgreSQL WASM (PGlite) qua TCP/driver `pg`, không truy cập ACVIS hay database cloud. PGlite xác minh cú pháp SQL và adapter, không thay thế kiểm tra isolation trên PostgreSQL nhiều tiến trình.

Kiểm thử trình duyệt tùy chọn: `npm run test:browser`. Script tự tìm Chrome/Edge trên Windows; nền tảng khác có thể đặt `BROWSER_PATH` trỏ tới Chromium/Chrome/Edge. Chạy với database tạm trong bộ nhớ, không sửa dữ liệu local. Ảnh desktop/mobile lưu ở `test-results/` và không đưa vào Git.

## ACVIS và GitHub

Bản chuẩn trước các lần thử IDOR/SQLi là commit `82617e0`. Theo yêu cầu, nhánh `main` có lỗi IDOR tại API xem đơn hàng ([case 002](docs/acvis-idor-case.md)) và SQL Injection tại bộ lọc người bán của API tin bán ([case 003](docs/acvis-sqli-case.md)); mỗi lỗi nằm trong commit riêng. Lỗi XSS cũ đã được hoàn tác và không khôi phục. Repository private: [tantkde180504/PokeCardc](https://github.com/tantkde180504/PokeCardc).

ACVIS tại `D:\ACVIS\ACVIS` hiện có template cho SQLi, XSS, Path Traversal, IDOR và Hardcoded Secrets. Không coi việc ACVIS không báo lỗi là chứng nhận an toàn. Chưa thực hiện quét ACVIS trong lần xây dựng này.

Backend mặc định chỉ nghe `127.0.0.1`. Không cần thay cấu hình ACVIS để chạy PokeCard. Tích hợp DAST sau này cần cân nhắc riêng: validator staging URL trong ACVIS yêu cầu HTTPS và chặn IP local/private. Không tự tắt cơ chế đó.

## Cấu trúc và giới hạn triển khai

- `public/`: giao diện responsive bằng JavaScript và CSS thuần.
- `server/index.js`: HTTP API, session cookie, CSRF, giới hạn request, static files theo danh sách cố định.
- `server/store.js`: lưu trữ, xác thực và quy tắc giao dịch.
- `server/database.js`: adapter SQLite/PostgreSQL, connection pool và giao dịch.
- `api/index.js`: entry point cho Vercel Function.
- `server/catalog.js`: danh mục card minh họa.
- `test/`: kiểm thử tích hợp.

Mật khẩu băm bằng scrypt và salt ngẫu nhiên. Session HttpOnly/SameSite, token CSRF cho thao tác tài khoản, truy vấn SQL tham số hóa, giới hạn thử đăng nhập, CSP và render văn bản có escape. Đây là baseline cho thử nghiệm local, chưa qua audit bảo mật độc lập.

Vercel luôn dùng cookie Secure và chỉ tin header IP do Vercel cung cấp khi `VERCEL=1`. Rate limit lưu trong database dùng chung giữa các instance. Chế độ local dùng IP socket, bỏ qua header proxy. Triển khai trên nền tảng khác cần thiết kế proxy/TLS và backup phù hợp. Biến môi trường: `DATABASE_URL` (PostgreSQL), `HOST`, `PORT`, `COOKIE_SECURE` (local). File `.env` không tự nạp: có thể chạy `node --env-file=.env server/index.js`; không commit file này.
