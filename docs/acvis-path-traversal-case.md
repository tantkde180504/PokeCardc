# ACVIS case 004 — Path Traversal / CWE-22

Theo yêu cầu: thêm một lỗi Path Traversal trong commit riêng và push lên GitHub. Baseline: `9df5b7c`. Giữ nguyên IDOR và SQLi đã có; không khôi phục XSS đã hoàn tác.

## Luồng lỗi

`GET /api/download?file=<filename>` lấy `file` từ URL, ghép bằng `resolve(root, 'server/assets/downloads', filename)` rồi gọi `readFile(filepath)`. Không kiểm tra đường dẫn đã resolve còn nằm trong thư mục downloads. `..` cho phép thoát khỏi thư mục được dự định phục vụ.

Kiểm tra độ dài tên file không ngăn traversal. Endpoint đọc tài liệu không cần đăng nhập; response là file đính kèm text/plain. Không có thao tác ghi/xóa file. Static-file allowlist cũ vẫn giữ nguyên.

## Tái hiện chỉ đọc với fixture vô hại

Sau khi deployment mới sẵn sàng:

| Request | Kỳ vọng |
|---|---|
| `/api/download?file=card-guide.txt` | HTTP 200, chứa `POKECARD_DOWNLOAD_GUIDE` |
| `/api/download?file=..%2Fpath-traversal-proof.txt` | HTTP 200, chứa `ACVIS_PATH_TRAVERSAL_PROOF_004` |
| `/api/download?file=missing-file.txt` | HTTP 404 |
| `/api/download` | HTTP 400 |

URL thử: `https://pokecardc.vercel.app/api/download?file=..%2Fpath-traversal-proof.txt`.

Fixture `server/assets/path-traversal-proof.txt` nằm ngoài `server/assets/downloads/` và không có credential hay dữ liệu người dùng. `vercel.json` đưa `server/assets/**` vào function bundle để cả file hợp lệ và fixture tồn tại trên Vercel. Không truy cập file hệ thống hoặc secret để xác minh.

`npm test` thực hiện request HTTP thực trên database riêng, kiểm tra marker của cả file hợp lệ và traversal, lỗi 400/404, cùng việc fixture không truy cập trực tiếp qua static route. Test dùng dấu `/` trên cả Windows/Linux; kiểm tra thêm `..\` chỉ thành công trên Windows.

## Kỳ vọng ACVIS và giới hạn

Kỳ vọng SAST phát hiện CWE-22 từ tham số `file` tới `readFile` mà không có kiểm tra phạm vi thư mục. DAST: GET, endpoint `/api/download`, tham số `file`, baseline `card-guide.txt`.

Template chỉ dò marker file hệ điều hành có thể không công nhận fixture này hoặc không tìm thấy file đó trong Vercel; không suy ra Mitigated chỉ từ kết quả ấy. Kết quả ACVIS và deployment cần được kiểm tra riêng sau push. Không tuyên bố đã đọc file bên ngoài function bundle trên Vercel.

## Khắc phục

Ưu tiên ánh xạ ID/tên tài liệu sang danh sách file cho phép. Nếu hỗ trợ đường dẫn con, resolve base và target rồi kiểm tra target thực sự thuộc base, có xử lý symlink thích hợp. Đổi kiểm thử để request `../` bị từ chối và không trả marker. Có thể revert riêng commit case 004.
