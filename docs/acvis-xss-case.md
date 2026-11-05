# ACVIS case 001 — DOM XSS / CWE-79

Theo yêu cầu ngày 2026-11-06, cố tình thêm một điểm chèn HTML từ URL để kiểm thử ACVIS. Bản chuẩn trước thay đổi là commit `37b98c3`.

## Nguồn và sink

Trong `public/app.js`, `renderProducts()` lấy `q` từ `window.location.search` bằng `URLSearchParams`, sau đó gán trực tiếp vào `#results-count.innerHTML` mà không escape hay sanitize. Không có `q` thì ứng dụng hoạt động như trước.

## Tái hiện không thực thi JavaScript

Mở:

```text
https://pokecardc.vercel.app/?q=%3Cstrong%20id%3D%22acvis-xss-probe%22%3EACVIS_XSS_PROBE%3C%2Fstrong%3E
```

Sau khi phiên bản mới được deploy, phần mô tả kết quả sẽ chứa phần tử `<strong id="acvis-xss-probe">` trong DOM, thay vì hiển thị chuỗi thẻ như văn bản. `npm run test:browser` kiểm tra chính trường hợp này trên server local riêng; không ghi dữ liệu cloud.

## Kết quả kỳ vọng và giới hạn

- SAST: có thể phát hiện CWE-79 từ `window.location.search` tới `innerHTML` mà không có sanitize. Chưa xác nhận ACVIS thực sự báo finding; cần xem scan job sau push.
- CSP của ứng dụng vẫn được giữ. Việc chèn được HTML không chứng minh chạy được script; không gán nhãn Confirmed chỉ từ bằng chứng này.
- Template HTTP reflection thuần sẽ không thấy payload trong HTML trả về vì đây là DOM sink chạy sau khi tải trang. DAST cần browser/DOM inspection; có thể trả Inconclusive nếu template chỉ đọc HTTP hoặc CSP chặn thực thi.
- Chỉ một luồng cố tình gây lỗi; không thay xác thực, database hoặc chính sách CSP.

## Khắc phục sau thử nghiệm

Thay `.innerHTML = searchLabel` bằng `.textContent = searchLabel`, rồi đổi kiểm thử browser thành yêu cầu chuỗi được hiển thị như văn bản và không tạo phần tử probe. Có thể revert riêng commit đưa lỗi vào; dữ liệu PostgreSQL không bị ảnh hưởng.
