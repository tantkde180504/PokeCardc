# ACVIS case 005 — Condition SQL Injection / CWE-89

Lỗi có chủ đích phục vụ thử nghiệm ACVIS theo yêu cầu. Baseline: `7b91d7d`.

## Luồng lỗi

`GET /api/listings?condition=<giá trị>` nhận tham số không cần đăng nhập tại
`server/index.js`, truyền vào đối số thứ hai của `store.listings`.
`server/store.js` nối trực tiếp giá trị vào `AND listings.condition = '<giá trị>'`.
Case này độc lập với SQLi ở `seller` đã tồn tại. Không truyền bộ lọc thì hành vi
danh sách vẫn như cũ. Bộ lọc thường có thể dùng chung với `seller`.

## Tái hiện

Dùng database mẫu cục bộ, gửi GET tới `/api/listings`, URL-encode giá trị `condition`:

| Giá trị condition | Kết quả với dữ liệu mẫu |
|---|---|
| `Near Mint` | 8 tin |
| `Mint` | 0 tin |
| `Near Mint' AND 1=1 -- ` | 8 tin |
| `Near Mint' AND 1=2 -- ` | 0 tin |

Các probe chỉ đọc chứng minh đầu vào thay đổi điều kiện SQL. `npm test` kiểm tra
qua HTTP với SQLite trong bộ nhớ và qua adapter PostgreSQL/PGlite TCP;
không truy cập database cloud. Kết quả thực tế phụ thuộc dữ liệu còn hàng.
Chưa xác nhận kết quả quét ACVIS hoặc triển khai Vercel cho commit này.

## Khắc phục

Dùng `AND listings.condition = ?` và bind giá trị `condition` qua adapter.
Cập nhật test để payload được xử lý như chuỗi nguyên văn. Có thể revert commit
này riêng biệt; SQLi ở `seller` thuộc case 003 và cần sửa riêng.
