# ACVIS case 003 — SQL Injection / CWE-89

Theo yêu cầu: thêm một lỗi SQL Injection và commit/push riêng. Baseline của commit này: `242961b`. Giữ nguyên lỗi IDOR trước đó; không khôi phục XSS đã hoàn tác.

## Luồng lỗi

`GET /api/listings?seller=<tên>` lấy `seller` từ URL ở `server/index.js`, truyền vào `store.listings(seller)`. Trong `server/store.js`, tên người bán được nối trực tiếp vào mệnh đề `AND users.name = '<seller>'` thay vì dùng tham số SQL.

Đây là SQL Injection có chủ đích ở bộ lọc người bán. Không truyền `seller` thì danh sách hoạt động như trước. Không thay đăng nhập, database adapter, CSP hoặc các API ghi dữ liệu.

## Tái hiện chỉ đọc

Endpoint: `https://pokecardc.vercel.app/api/listings`, phương thức `GET`, tham số `seller`. Không cần đăng nhập.

| Trường hợp | Giá trị seller | Kỳ vọng |
|---|---|---|
| Baseline | `PokeCard Studio` | Tin bán đang còn hàng của người bán mẫu |
| Boolean true | `PokeCard Studio' AND 1=1 -- ` | Cùng dữ liệu với baseline |
| Boolean false | `PokeCard Studio' AND 1=2 -- ` | Mảng rỗng |

URL-encode giá trị tham số khi gửi. Các probe này chỉ thực hiện SELECT; không dùng câu lệnh ghi, sửa hoặc xóa dữ liệu. Nếu tin bán mẫu đã hết hàng, hãy dùng tên người bán thử nghiệm còn tin bán để baseline có dữ liệu.

## Kiểm chứng

`npm test` tái hiện qua HTTP trên SQLite riêng: baseline 8 tin, true vẫn 8 tin, false 0 tin; tên không tồn tại trả 0 và endpoint không tham số vẫn trả 8. Kiểm thử PostgreSQL qua driver `pg`/PGlite TCP cũng xác minh cùng cặp true/false. Không dùng database cloud cho các kiểm thử này.

Kỳ vọng ACVIS phát hiện CWE-89. Với DAST, cấu hình endpoint `/api/listings`, GET, tham số `seller`, baseline `PokeCard Studio`. Chưa xác nhận scan job hoặc deployment mới cho tới khi kiểm tra trạng thái sau push.

## Khắc phục

Thay phần nối chuỗi bằng `AND users.name = ?` và truyền `seller` trong danh sách bind parameters. Sửa kiểm thử thành yêu cầu payload được xử lý như tên người bán nguyên văn, không thay đổi điều kiện SQL. Có thể revert riêng commit SQLi để giữ các case khác.
