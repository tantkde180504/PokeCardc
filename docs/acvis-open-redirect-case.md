# ACVIS: Open Redirect / CWE-601 ngoài dataset

Ngày 2026-11-20, theo yêu cầu tạo một lỗi không có trong dataset để test.
Baseline PokeCard: `9e724ce`, nhánh `test/acvis-cwe-22-798-20261113`.

## Đối chiếu dataset local

Đọc và parse toàn bộ 9 file JSONL tại `D:\ACVIS\ACVIS\dataset`:

| File | Số bản ghi |
|---|---:|
| `acvis_test_gold.jsonl` | 400 |
| `acvis_test_gt.jsonl` | 715 |
| `acvis_train_gt.jsonl` | 5749 |
| `acvis_val_gt.jsonl` | 715 |
| `test_sft_chatml.jsonl` | 3500 |
| `train_sft_chatml.jsonl` | 5749 |
| `val_sft_chatml.jsonl` | 715 |
| `vuln_dataset_10krecord.jsonl` | 10000 |
| `vuln_test_dataset_3500.jsonl` | 3500 |

Kiểm tra nhãn `cwe` và JSON trong câu trả lời assistant đối với các file ChatML;
đồng thời tìm toàn văn theo `CWE[-_ ]?601\b` và
`open[ _-]?redirect|unvalidated[ _-]?redirect`, không phân biệt hoa/thường.
Tất cả file đều có 0 kết quả CWE-601 và 0 kết quả tên lỗi nêu trên.
Đây là bằng chứng cho bản dataset local đã đọc; không xác minh dataset của model
đang được host, nguồn pretraining hoặc mọi mẫu chuyển hướng không được gắn nhãn.

## Luồng lỗi

`GET /api/continue?next=<destination>` lấy trực tiếp tham số `next` và truyền vào
header `Location` của response HTTP 302 trong `server/index.js`. Không kiểm tra
origin hoặc giới hạn đường dẫn nội bộ, nên người dùng có thể bị chuyển sang một
website bên ngoài. Endpoint không cần đăng nhập. Thiếu hoặc rỗng `next` trả về `/`.

## Tái hiện

Chạy `npm start`, sau đó dùng PowerShell:

```powershell
curl.exe -i "http://127.0.0.1:3000/api/continue?next=https%3A%2F%2Fexample.org%2Facvis-cwe-601"
```

Kỳ vọng response chứa:

```http
HTTP/1.1 302 Found
Location: https://example.org/acvis-cwe-601
```

`curl.exe` không dùng `-L`, nên chỉ xem response của ứng dụng local.
Nếu mở URL này trong trình duyệt, trình duyệt sẽ theo chuyển hướng ra ngoài.
Đầu vào `next=%2F%2Fexample.org%2Facvis-cwe-601` cũng trả `Location` bên ngoài
ở dạng không chỉ định protocol. `next=%2F%23cards` trả đường dẫn nội bộ `/#cards`.

## Kiểm chứng và giới hạn

- `npm.cmd run build`: đạt.
- `npm.cmd test`: 22/22 đạt, gồm kiểm thử mới qua HTTP thật với SQLite riêng trong bộ nhớ.
- Test mới kiểm tra đường dẫn nội bộ, URL HTTPS bên ngoài, URL dạng `//host/path`,
  giá trị mặc định và không tạo session. Tất cả dùng `redirect: 'manual'`, không
  gửi request ra website ngoài.
- Chưa commit, push, deploy hay quét ACVIS cho case này.

Không thể suy ra khả năng tổng quát hóa của model chỉ từ việc có/không có finding:
dataset là một phần của pipeline; cần phân biệt kết quả AST, chính sách phạm vi
CWE, RAG và suy luận model khi đánh giá. Không sửa cấu hình hoặc dataset ACVIS.

## Gỡ lỗi thử nghiệm

Xóa nhánh xử lý `/api/continue` và test CWE-601 tương ứng để bỏ case này.
Nếu triển khai tính năng chuyển hướng thật, chỉ chấp nhận đường dẫn nội bộ đã
chuẩn hóa hoặc origin nằm trong danh sách cho phép; từ chối URL bên ngoài và
dạng `//host/path`, rồi đổi test thành kiểm tra các đầu vào đó bị từ chối.
