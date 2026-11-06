# ACVIS case 002 — IDOR / CWE-639

Theo yêu cầu ngày 2026-11-06: thêm một lỗi khác trong commit riêng để kiểm thử ACVIS. Bản gốc trước lần thay đổi này: `82617e0`. Lỗi XSS cũ đã được hoàn tác trước đó; không khôi phục trong case này.

## Lỗi có chủ đích

`GET /api/orders?userId=<id>` yêu cầu đăng nhập nhưng cho phép chọn tài khoản bằng tham số `userId`, rồi gọi `store.orders(requestedUserId)` mà không đối chiếu với tài khoản của session. Người dùng có thể đọc đơn mua và lịch sử bán của tài khoản khác. Việc kiểm tra `userId` là số nguyên không thay thế kiểm tra quyền sở hữu.

Không truyền `userId` thì vẫn đọc đơn của chính mình. Các endpoint ghi dữ liệu, xác thực, database, CSP và giao diện không bị thay đổi.

## Tái hiện

1. Đăng ký hai tài khoản thử nghiệm A và B trên cùng môi trường.
2. Dùng A mua một card bằng luồng đặt hàng giả lập, ghi lại ID tài khoản A từ response `/api/me`.
3. Đăng nhập B. `GET /api/orders` trả về đơn của B, ban đầu trống.
4. Vẫn dùng session B, gọi `GET /api/orders?userId=<ID_A>`. API trả về đơn của A với HTTP 200.
5. Nếu không đăng nhập, API vẫn trả HTTP 401; lỗi nằm ở phân quyền giữa các tài khoản, không phải bỏ đăng nhập.

Endpoint production sau khi deployment mới sẵn sàng: `https://pokecardc.vercel.app/api/orders?userId=<ID_A>`. Cần session của tài khoản thử nghiệm B. Không kiểm tra bằng dữ liệu của tài khoản khác ngoài hai tài khoản bạn dùng cho case.

## Kiểm chứng và kỳ vọng ACVIS

`npm test` có kiểm thử HTTP tái hiện trực tiếp bằng database riêng: A tạo đơn, B thấy giỏ đơn riêng trống rồi đọc được đúng đơn của A bằng `userId`. Không dùng hoặc thay đổi dữ liệu cloud để chạy test này.

Kỳ vọng SAST phát hiện CWE-639 (missing ownership check). DAST cần cung cấp đúng tham số `userId` và session/identity của hai tài khoản; request không có session trả 401 không chứng minh lỗi đã được khắc phục. Chỉ gọi GET để kiểm tra đọc chéo tài khoản. Kết quả quét thực tế cần đọc từ scan job ACVIS, không suy ra từ việc push thành công.

## Khắc phục

Loại bỏ override `userId` và luôn gọi `store.orders(session.user.id)`. Đổi kiểm thử thành yêu cầu B không thấy đơn của A. Có thể revert riêng commit đưa lỗi IDOR vào.
