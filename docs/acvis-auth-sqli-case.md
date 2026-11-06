# ACVIS case 007 — POST authentication SQL Injection / CWE-89

Lỗi cố ý theo yêu cầu để test, baseline `bef02af`.
Tham chiếu người dùng cung cấp: `6a9ad52b011ecda8a0e8e4d4`, `cn_664`,
`auth.jsPOST`. Đây không phải kết quả scan đã xác minh. Repo không có `auth.js`;
luồng tương ứng là POST `/api/login` trong `server/index.js`, gọi `login`
trong `server/store.js`.

## Luồng lỗi

Trường JSON `email` được nối trực tiếp vào `SELECT * FROM users WHERE email='…'`.
Kiểm tra độ dài và chuyển chữ thường không ngăn đầu vào trở thành cú pháp SQL.
Phép kiểm tra mật khẩu scrypt vẫn chạy sau truy vấn.

## Tái hiện trên local

Đăng ký tài khoản thử nghiệm `authprobe@example.test` với mật khẩu
`local-test-passphrase` trên database local. Gửi POST `/api/login` với
`Content-Type: application/json`, giữ nguyên mật khẩu đúng và thay `email`:

| email | HTTP kỳ vọng |
|---|---|
| `authprobe@example.test` | 200 |
| `authprobe@example.test' AND 1=1 -- ` | 200, cùng tài khoản |
| `authprobe@example.test' AND 1=2 -- ` | 401, không tạo cookie session |

Đây là boolean SQLi; probe trên cần mật khẩu đúng để quan sát khác biệt.
Mật khẩu sai vẫn trả 401 với probe true. Các probe không sửa dữ liệu qua SQL;
đăng nhập thành công tạo session và mỗi lần thử cập nhật bộ đếm rate limit.

`npm test` kiểm tra HTTP/SQLite trong bộ nhớ và PostgreSQL/PGlite qua TCP,
không dùng database cloud. Chưa xác minh deployment hoặc scan ACVIS.

## Khắc phục

Khôi phục `db.get('SELECT * FROM users WHERE email=?', email)` và sửa test
để payload được xem là email nguyên văn, trả 401. Revert commit này chỉ gỡ
case xác thực; các SQLi ở bộ lọc listings thuộc những commit trước.
