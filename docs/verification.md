# Kiểm tra bản đầu — 2026-11-05

## Phạm vi

Baseline hoạt động bình thường theo `docs/scope.md`. Không cố tình tạo lỗi, không sửa ACVIS, không tạo commit hay push lên GitHub. Không thực hiện quét ACVIS hoặc kiểm chứng trên môi trường production.

## Kết quả local

- `npm run check`: đạt, kiểm tra cú pháp backend và frontend.
- `npm test`: 10/10 đạt. API chạy trên HTTP thật với SQLite tách biệt. Bao phủ tài khoản, phiên, CSRF, từ chối nguồn khác, quyền sở hữu, mua/bán, tổng tiền server, hết hàng, tính nguyên tử, đầu vào không hợp lệ, static-file isolation và persistence.
- `npm run test:browser`: đạt bằng Chrome headless. Bao phủ tìm kiếm, viewport desktop 1440×1000 và mobile 390×844, không tràn ngang, đăng ký, thêm bộ sưu tập, bán, hủy bán, giỏ hàng, checkout, quay lại anchor bằng Back và đăng nhập lại khi phiên hết hiệu lực.
- Đã xem ảnh desktop và mobile. Hình minh họa card được tạo bằng CSS; không xác nhận tương đồng với card thật.
- Browser không có exception hoặc console error ngoài HTTP 401 dự kiến trong tình huống cố ý hết phiên.

## Review

Hai lượt review độc lập theo chất lượng mã và phạm vi yêu cầu. Đã sửa và kiểm tra hồi quy các phát hiện: giải mã UTF-8 qua nhiều HTTP chunk, giữ nguyên khoảng trắng mật khẩu, phục hồi khi phiên hết hạn và điều hướng `#cards` bằng nút Back. Không còn phát hiện chặn hoàn thành trong phần đã rà soát.

## Giới hạn bằng chứng

Không có kết nối thanh toán, vận chuyển, email hay dịch vụ bên ngoài; giao dịch chỉ mô phỏng. Browser test chạy bằng database riêng trong bộ nhớ. Chưa chạy CI từ xa, audit bảo mật đầy đủ hoặc kiểm thử tải. Source và dữ liệu vận hành đã tách bằng `.gitignore`.

## Xuất bản source theo yêu cầu tiếp theo

Người dùng đã yêu cầu tạo repo và đẩy mã nguồn lên GitHub sau khi hoàn thành bản đầu. Repo private: [tantkde180504/PokeCardc](https://github.com/tantkde180504/PokeCardc), nhánh `main`. Kiểm tra cú pháp và 10 kiểm thử tích hợp được chạy lại, đều đạt. Không đưa `data/`, tài khoản local, session, SQLite hoặc `test-results/` vào Git. Việc xuất bản source không đồng nghĩa đã kết nối hoặc quét bằng ACVIS.

## Chuẩn bị Vercel + PostgreSQL

- Theo yêu cầu tiếp theo, thêm PostgreSQL cho deployment, giữ SQLite khi chạy local; frontend vẫn JavaScript thuần.
- `npm run build`, 13 kiểm thử và browser smoke đều đạt sau thay đổi. Ba kiểm thử mới xác minh SQL/driver PostgreSQL qua PGlite TCP, body JSON đã parse trong Vercel và cookie Secure, cùng lỗi 503 khi chưa cấu hình database.
- Hai reviewer độc lập không còn phát hiện chặn hoàn thành trong mã đã kiểm tra. PGlite không chứng minh isolation của PostgreSQL nhiều tiến trình.
- Đã tạo project `poke-card/pokecardc` và kết nối GitHub. Build trực tiếp trên Vercel đạt; build Vercel local trên Windows không chạy được vì thiếu quyền symlink trong cache CLI. Chuyển build lên cloud, không thay quyền hệ thống.
- Người dùng đã tự phê duyệt Vercel CLI và điều khoản Neon. Đã tạo `pokecardc-db`, gói `free_v3`, vùng `sin1`, chỉ kết nối Production. API luôn yêu cầu PostgreSQL và không dùng database tạm khi deploy.
- URL production: https://pokecardc.vercel.app. Việc tạo database và build đạt chưa thay thế xác minh giao dịch trên deployment; kết quả cloud được ghi sau khi kiểm tra.
