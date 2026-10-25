# Truy vấn LogQL Thực nghiệm — Đề 12: Hệ thống Quản lý Nhà hàng / Order

## 1. Xem nhật ký truy cập (Access Logs) qua Nginx Reverse Proxy

```logql
{job="nginx"}
```

- **Ý nghĩa:** Truy xuất toàn bộ các dòng access log định dạng JSON (`json_combined`) từ volume `ro_nginx_logs` do Promtail thu gom và đẩy sang Loki.
- **Sự kiện kiểm chứng:** Truy cập Dashboard (`/`), Thực đơn (`/menu`), Đơn hàng (`/orders`), Bàn ăn (`/tables`), Healthcheck (`/health`).

## 2. Lọc các Request lỗi HTTP (Mã trạng thái từ 400 trở lên)

```logql
{job="nginx"} | json | status >= 400
```

- **Ý nghĩa:** Phân tích cú pháp JSON của log Nginx và lọc các request trả về mã lỗi client/server (`401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Server Error`).
- **Sự kiện kiểm chứng:** Truy cập đường dẫn không tồn tại `/not-found-page-xyz-999` (sinh `status: 404`) và gửi POST thiếu CSRF token (sinh `status: 403`).

## 3. Tìm sự kiện Đăng nhập thất bại hoặc Thao tác Nghiệp vụ trong Ứng dụng

```logql
{job="app"} | json | event="login_failed"
```

- **Ý nghĩa:** Giải mã JSON luồng nhật ký ứng dụng (`ro-app`) và lọc chính xác các sự kiện cảnh báo xác thực thất bại (`level="warn"`, `status=401`), ghi nhận tài khoản thử nghiệm và địa chỉ IP mà không làm lộ mật khẩu.
- **Truy vấn mở rộng cho thao tác nghiệp vụ nhà hàng (Order / Menu):**

```logql
{job="app"} | json | event=~"order_created|menu_created|order_status_updated"
```

> **Lưu ý về vòng đời công cụ (EOL):** Theo thông báo của Grafana Labs, Promtail bước vào giai đoạn kết thúc vòng đời hỗ trợ (EOL) năm 2026 để chuyển sang Grafana Alloy. Hệ thống vẫn triển khai đầy đủ Loki + Promtail theo yêu cầu bắt buộc của đề bài và định hướng nâng cấp sang Grafana Alloy trong môi trường sản xuất.
