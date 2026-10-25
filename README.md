# Đề 12: Hệ thống Quản lý Nhà hàng / Order (Restaurant & Order Management)

Báo cáo và mã nguồn thực hành kết thúc học phần **Triển khai và Quản trị Hệ thống Phần mềm**.

## 1. Thông tin Sinh viên & Đề tài

| Thông tin | Chi tiết |
| :--- | :--- |
| **Họ và tên sinh viên** | **Phạm Văn Tuân** |
| **Mã số sinh viên (MSSV)** | **DTC245200485** |
| **Lớp** | **CNTT K23I** |
| **Giảng viên hướng dẫn** | **Lê Khánh Dương** |
| **Đề số & Tên đề tài** | **Đề 12: Hệ thống Quản lý Nhà hàng / Order** |
| **Phần mềm triển khai** | Website quản lý thực đơn món ăn, đơn hàng (Order), sơ đồ bàn ăn và nhật ký kiểm toán |
| **Cơ sở dữ liệu & Quản trị** | **PostgreSQL 16** (`ro_db`) + **pgAdmin 4** |
| **Hạ tầng & Observability** | Docker Compose, Nginx Reverse Proxy (HTTPS TLS tự ký + Security Headers), Prometheus, Grafana, cAdvisor, Nginx/PostgreSQL Exporters, Loki + Promtail (LogQL) |

---

## 2. Kiến trúc Dịch vụ & Danh sách Cổng (Ports)

> **Lưu ý về cổng trên máy thực nghiệm:** Trên máy chủ thực nghiệm đã có một project khác đang chạy và chiếm cổng `3000` (`grafana`), `5433` (`duanttcs_n5_postgres`), `9100` (`node-exporter`). Để giữ nguyên trạng project khác trên máy, toàn bộ dịch vụ của **Đề 12** sử dụng tiền tố container `ro-*` và ánh xạ **Grafana sang cổng `3002`** (`127.0.0.1:3002`).

| Dịch vụ (Container) | Image / Nền tảng | Cổng Host (Bind `127.0.0.1`) | Mạng Docker | Vai trò chính |
| :--- | :--- | :--- | :--- | :--- |
| `ro-app` | Node 22 Alpine (`./app/Dockerfile`) | *Không publish* (`3000` nội bộ) | `ro_web_network`, `ro_database_network` | Ứng dụng Express + EJS quản lý món ăn, đơn hàng, bàn ăn, session PostgreSQL |
| `ro-postgres` | `postgres:16-alpine` | *Không publish* (`5432` nội bộ) | `ro_database_network` (`internal: true`) | Cơ sở dữ liệu `ro_db` (7 bảng dữ liệu), tài khoản least-privilege `ro_app` |
| `ro-pgadmin` | `dpage/pgadmin4:8.14` | `127.0.0.1:8081` | `ro_database_network`, `ro_management_network` | Công cụ quản trị cơ sở dữ liệu PostgreSQL trên giao diện Web |
| `ro-nginx` | `nginx:1.27-alpine` | `127.0.0.1:8080` (HTTP)<br>`127.0.0.1:8443` (HTTPS) | `ro_web_network`, `ro_monitoring_network` | Reverse proxy, chuyển hướng 301 HTTP -> HTTPS RSA 3072-bit, gắn security headers |
| `ro-cadvisor` | `ghcr.io/google/cadvisor:0.55.1` | *Không publish* (`8080` nội bộ) | `ro_monitoring_network` | Thu thập metrics CPU, RAM, Network của các container |
| `ro-nginx-exporter` | `nginx/nginx-prometheus-exporter:1.4.1` | *Không publish* (`9113` nội bộ) | `ro_monitoring_network` | Đọc `stub_status` nội bộ (`nginx:8082`) xuất metrics cho Prometheus |
| `ro-postgres-exporter` | `prometheuscommunity/postgres-exporter:v0.16.0` | *Không publish* (`9187` nội bộ) | `ro_database_network`, `ro_monitoring_network` | Thu thập chỉ số kết nối và giao dịch từ PostgreSQL `ro_db` |
| `ro-prometheus` | `prom/prometheus:latest` | `127.0.0.1:9090` | `ro_monitoring_network` | Thu thập, lưu trữ chuỗi thời gian và đánh giá quy tắc cảnh báo |
| `ro-grafana` | `grafana/grafana:latest` | `127.0.0.1:3002` | `ro_monitoring_network` | Hiển thị Dashboard giám sát và truy vấn nhật ký Loki qua Explore |
| `ro-loki` | `grafana/loki:3.4.2` | *Không publish* (`3100` nội bộ) | `ro_monitoring_network` | Lưu trữ và lập chỉ mục nhật ký tập trung (TSDB schema v13) |
| `ro-promtail` | `grafana/promtail:3.4.2` | *Không publish* (`9080` nội bộ) | `ro_monitoring_network` | Đọc file log JSON từ named volumes (`:ro`) và đẩy tới Loki |
| `ro-init-logs` | `busybox:1.37.0` | *Không nối mạng* | `none` | Khởi tạo file log vật lý và phân quyền UID `1000` / `101` rồi thoát (`Exited 0`) |

---

## 3. Cấu trúc Thư mục

```text
KTHP_TKQTHT/
├── app/                            # Mã nguồn ứng dụng Node.js 22 + Express + EJS
│   ├── Dockerfile                  # Đóng gói container non-root (USER node - UID 1000)
│   ├── package.json                # Khai báo dependencies và script unit test
│   ├── public/styles.css           # Giao diện quản lý nhà hàng / order
│   ├── src/
│   │   ├── db.js                   # Kết nối PostgreSQL (tài khoản ro_app)
│   │   ├── logger.js               # Ghi log JSON có cấu trúc vào /app/logs/app.log
│   │   ├── validation.js           # Kiểm tra dữ liệu món ăn, bàn ăn, đơn hàng
│   │   ├── middleware/security.js  # CSRF token, requireAuth, rate limit
│   │   ├── models/restaurantModel.js # Truy vấn SQL tham số hóa ($1, $2...)
│   │   └── server.js               # Khởi tạo máy chủ Express và các route nghiệp vụ
│   ├── views/                      # Giao diện EJS (dashboard, menu, orders, order_detail, tables, audit, login)
│   └── tests/validation.test.js    # Unit tests kiểm tra logic nghiệp vụ
├── db/
│   ├── init/
│   │   ├── 01_schema.sql           # Khởi tạo 7 bảng (users, dining_tables, menu_items, orders, order_items, audit_logs, session)
│   │   ├── 02_seed.sql             # Nạp dữ liệu mẫu nhà hàng Việt Nam (8 món, 6 bàn, 4 đơn, 12 chi tiết món)
│   │   └── 03_roles.sh             # Thiết lập tài khoản least-privilege ro_app và postgres_exporter
│   └── pgadmin/servers.json        # Tự động đăng ký kết nối PostgreSQL trong pgAdmin 4
├── nginx/
│   └── nginx.conf                  # Cấu hình Reverse Proxy, TLS 1.2/1.3, Security Headers, JSON access log
├── monitoring/
│   ├── prometheus/
│   │   ├── prometheus.yml          # Scrape 4 jobs: prometheus, cadvisor, nginx, postgres
│   │   └── alert.rules.yml         # Quy tắc cảnh báo exporter/dịch vụ
│   └── grafana/
│       ├── dashboards/restaurant-overview.json
│       └── provisioning/           # Tự động nạp datasources (Prometheus, Loki) và dashboard
├── logging/
│   ├── loki/loki-config.yml        # Cấu hình Loki 3.4.2 (TSDB v13, retention 168h)
│   ├── promtail/promtail-config.yml # Thu gom log JSON từ volume ro_nginx_logs và ro_app_logs
│   └── logql-queries.md            # Ba truy vấn LogQL thực nghiệm
├── scripts/
│   ├── setup.js                    # Sinh .env ngẫu nhiên và chứng chỉ TLS RSA 3072-bit
│   ├── smoke_test.js               # Kiểm thử tích hợp tự động 15 ca kiểm thử qua HTTPS
│   ├── backup.js                   # Sao lưu pg_dump cơ sở dữ liệu ro_db ra backups/
│   ├── restore_test.js             # Phục hồi thử nghiệm vào DB độc lập ro_restore_test và đối chiếu
│   └── verify_hardening.js         # Kiểm chứng thực tế non-root, read-only, cap_drop, internal net, least privilege
├── docs/evidence/                  # Lưu trữ kết quả kiểm thử JSON và ảnh chụp minh chứng thực tế
├── compose.yaml                    # Điều phối App, PostgreSQL, pgAdmin, Nginx
├── compose.monitoring.yaml         # Điều phối Prometheus, Grafana, cAdvisor, Exporters
├── compose.logging.yaml            # Điều phối Loki và Promtail
└── .env.example                    # Mẫu biến môi trường (không chứa mật khẩu thật)
```

---

## 4. Hướng dẫn Cài đặt & Khởi chạy Hệ thống

### Bước 1: Sinh biến môi trường `.env` và chứng chỉ TLS tự ký

```bash
node scripts/setup.js
```

Lệnh trên sẽ tự động tạo file `.env` chứa các mật khẩu ngẫu nhiên độ mạnh cao và tạo cặp chứng chỉ RSA 3072-bit (`certs/server.crt`, `certs/server.key`) với SAN `DNS:localhost,IP:127.0.0.1`. (Thông tin đăng nhập cụ thể được lưu cục bộ trong file `.env`, không đẩy lên Git).

### Bước 2: Khởi chạy toàn bộ hệ thống bằng Docker Compose

```bash
docker compose -f compose.yaml -f compose.monitoring.yaml -f compose.logging.yaml up -d --build
```

Kiểm tra trạng thái các container:

```bash
docker compose -f compose.yaml -f compose.monitoring.yaml -f compose.logging.yaml ps
```

### Bước 3: Truy cập các dịch vụ

- **Website Quản lý Nhà hàng / Order (HTTPS):** `https://localhost:8443` (hoặc `http://localhost:8080` tự động chuyển hướng 301 sang `https://localhost:8443`)
- **Healthcheck API:** `https://localhost:8443/health`
- **pgAdmin 4:** `http://localhost:8081`
- **Prometheus UI:** `http://localhost:9090/targets`
- **Grafana Dashboard & Explore:** `http://localhost:3002`

*(Tài khoản và mật khẩu đăng nhập của từng dịch vụ xem trực tiếp trong file `.env` trên máy cục bộ).*

---

## 5. Kiểm thử, Sao lưu & Kiểm chứng Hardening

```bash
# 1. Chạy unit tests kiểm tra logic nghiệp vụ
node --test app/tests/validation.test.js

# 2. Chạy kiểm thử tích hợp end-to-end (15 ca kiểm thử qua HTTPS)
node scripts/smoke_test.js

# 3. Kiểm chứng cấu hình Hardening (Non-root, Read-only rootfs, CapDrop, Internal DB Net, Least Privilege)
node scripts/verify_hardening.js

# 4. Sao lưu cơ sở dữ liệu ro_db và phục hồi thử vào cơ sở dữ liệu độc lập ro_restore_test
node scripts/backup.js
node scripts/restore_test.js
```
