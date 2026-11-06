# ACVIS case 006 — Numeric SQL Injection / CWE-89

Lỗi cố ý theo yêu cầu để test ACVIS. Baseline: `2d42457`.

## Luồng lỗi

`GET /api/listings?cardId=1` nhận `cardId` từ URL không cần đăng nhập.
`server/index.js` truyền chuỗi vào đối số thứ ba của `store.listings`;
`server/store.js` nối thẳng vào `AND listings.card_id = <cardId>` mà không
kiểm tra số nguyên hoặc bind parameter. Đầu vào được thực thi như biểu thức SQL.
Đây là case mới, độc lập với SQLi ở `seller` và `condition`.

## Tái hiện cục bộ

Chạy `npm start`, gửi GET tới `http://127.0.0.1:3000/api/listings`.
URL-encode giá trị của `cardId` khi gửi:

| cardId | Kết quả với dữ liệu mẫu |
|---|---|
| `1` | 1 tin bán card 1 |
| `1 AND 1=1` | Cùng dữ liệu baseline |
| `1 AND 1=2` | Mảng rỗng |
| `999` | Mảng rỗng |

Các probe chỉ đọc, không thay đổi dữ liệu. Số lượng kết quả phụ thuộc dữ liệu
còn hàng. Không truyền `cardId` thì danh sách hoạt động như trước.

`npm test` kiểm chứng qua HTTP/SQLite trong bộ nhớ và adapter PostgreSQL với
PGlite qua TCP, bao gồm dùng chung ba bộ lọc. Không dùng database cloud.
Chưa xác minh deployment Vercel hoặc kết quả quét ACVIS cho case này.

## Khắc phục

Kiểm tra `cardId` là số nguyên hợp lệ và dùng `AND listings.card_id = ?`
với bind parameter. Sửa test để biểu thức SQL bị từ chối. Revert riêng commit
này sẽ gỡ case 006; hai case SQLi trước cần xử lý riêng.
