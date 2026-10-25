-- ============================================================================
-- DỮ LIỆU KHỞI TẠO MẪU (SEED DATA) - ĐỀ 12: QUẢN LÝ NHÀ HÀNG / ORDER
-- ============================================================================

INSERT INTO users (username, email, password_hash, full_name, role)
VALUES
    ('admin', 'dtc245200485@ictu.edu.vn', '$2a$10$wK1N6y9v2R8qP3mX5zL7e.8hJ4kF6gD2sA9wE1rT3yU5iO7pA0bC2', 'Phạm Văn Tuân (Quản trị viên)', 'admin'),
    ('quanly_ca', 'quanly.nhahang@ictu.edu.vn', '$2a$10$wK1N6y9v2R8qP3mX5zL7e.8hJ4kF6gD2sA9wE1rT3yU5iO7pA0bC2', 'Nguyễn Hoàng Nam (Quản lý ca)', 'manager'),
    ('thungan_01', 'thungan01.nhahang@ictu.edu.vn', '$2a$10$wK1N6y9v2R8qP3mX5zL7e.8hJ4kF6gD2sA9wE1rT3yU5iO7pA0bC2', 'Lê Thu Hà (Thu ngân)', 'cashier')
ON CONFLICT (username) DO NOTHING;

INSERT INTO dining_tables (table_code, table_name, area, capacity, status, note)
VALUES
    ('TB-01', 'Bàn 01 - Cửa sổ', 'Tầng 1 - Sảnh chính', 4, 'Occupied', 'Đang phục vụ gia đình 4 khách'),
    ('TB-02', 'Bàn 02 - Trung tâm', 'Tầng 1 - Sảnh chính', 4, 'Occupied', 'Khách gọi món chính & đồ uống'),
    ('TB-03', 'Bàn 03 - Gia đình', 'Tầng 1 - Sảnh chính', 6, 'Available', 'Đã dọn sạch sau khi thanh toán'),
    ('TB-04', 'Phòng VIP 01 - Hoa Sen', 'Tầng 2 - Phòng VIP', 10, 'Occupied', 'Đoàn khách Công ty Sao Việt (8 khách)'),
    ('TB-05', 'Phòng VIP 02 - Hoàng Gia', 'Tầng 2 - Phòng VIP', 12, 'Reserved', 'Đặt trước 19h30 - Khách hàng thân thiết'),
    ('TB-06', 'Bàn 06 - Sân vườn', 'Khu vực Sân vườn', 6, 'Available', 'Khu vực thoáng mát ngoài trời')
ON CONFLICT (table_code) DO NOTHING;

INSERT INTO menu_items (code, name, category, price, unit, is_available, description)
VALUES
    ('MN-001', 'Gỏi cuốn tôm thịt đặc biệt', 'Khai vị', 65000, 'Đĩa', TRUE, 'Tôm sú tươi, thịt ba chỉ luộc cuốn bánh tráng rau sống chấm tương đậu phộng'),
    ('MN-002', 'Salad cá hồi sốt mè rang', 'Khai vị', 95000, 'Đĩa', TRUE, 'Cá hồi Na Uy áp chảo ăn kèm rau mầm Đà Lạt và sốt mè rang Nhật Bản'),
    ('MN-003', 'Bò lúc lắc khoai tây chiên', 'Món chính', 185000, 'Đĩa', TRUE, 'Thăn bò Úc áp chảo sốt tiêu đen kèm ớt chuông và khoai tây chiên giòn'),
    ('MN-004', 'Cá lăng nướng muối ớt', 'Món chính', 240000, 'Phần', TRUE, 'Cá lăng sông Đà tẩm ướp muối ớt rừng nướng than hoa thơm lừng'),
    ('MN-005', 'Cơm chiên hải sản hoàng kim', 'Món chính', 120000, 'Phần', TRUE, 'Cơm chiên trứng muối cùng tôm sú, mực ống tươi và đậu Hà Lan'),
    ('MN-006', 'Lẩu Thái hải sản chua cay', 'Lẩu & Nướng', 350000, 'Nồi', TRUE, 'Nước dùng Tomyum cốt dừa kèm tôm sú, mực, nghêu, nấm kim châm và bún tươi'),
    ('MN-007', 'Trà đào cam sả nhiệt đới', 'Đồ uống', 45000, 'Ly', TRUE, 'Hồng trà ủ lạnh kết hợp đào miếng giòn, cam vàng và hương sả tươi'),
    ('MN-008', 'Chè khúc bạch hạnh nhân', 'Tráng miệng', 40000, 'Chén', TRUE, 'Khúc bạch phô mai béo ngậy ăn cùng nhãn lồng và hạnh nhân lát nướng')
ON CONFLICT (code) DO NOTHING;

INSERT INTO orders (order_code, table_id, customer_name, guest_count, status, payment_method, total_amount, note, created_by)
VALUES
    ('ORD-001', 1, 'Nguyễn Minh Hoàng', 4, 'Served', 'Chuyển khoản QR', 595000, 'Đã lên đủ món, khách dùng lẩu tại bàn TB-01', 'admin'),
    ('ORD-002', 2, 'Trần Thị Lan Anh', 2, 'Preparing', 'Tiền mặt', 370000, 'Ít cay cho món bò lúc lắc', 'quanly_ca'),
    ('ORD-003', 4, 'Đoàn khách Công ty Sao Việt', 8, 'Pending', 'Thẻ ngân hàng', 1070000, 'Xuất hóa đơn VAT sau khi thanh toán', 'admin'),
    ('ORD-004', 3, 'Lê Quốc Bảo', 4, 'Paid', 'Chuyển khoản QR', 465000, 'Đã thanh toán hoàn tất và bàn giao bàn', 'thungan_01')
ON CONFLICT (order_code) DO NOTHING;

INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, item_status, note)
VALUES
    (1, 1, 1, 65000, 'Served', 'Khai vị lên trước'),
    (1, 6, 1, 350000, 'Served', 'Nước lẩu cay vừa'),
    (1, 7, 4, 45000, 'Served', 'Ít đá'),
    (2, 2, 1, 95000, 'Served', 'Sốt mè để riêng'),
    (2, 3, 1, 185000, 'Cooking', 'Bò chín vừa (medium)'),
    (2, 7, 2, 45000, 'Served', 'Bình thường'),
    (3, 4, 2, 240000, 'Queued', 'Nướng nóng khi khách vào tiệc'),
    (3, 5, 2, 120000, 'Queued', 'Chia 2 đĩa lớn'),
    (3, 6, 1, 350000, 'Queued', 'Lên sau món nướng'),
    (4, 3, 1, 185000, 'Served', 'Hoàn tất'),
    (4, 5, 1, 120000, 'Served', 'Hoàn tất'),
    (4, 8, 4, 40000, 'Served', 'Tráng miệng cuối bữa');

INSERT INTO audit_logs (username, action, entity_type, entity_id, details, ip_address)
VALUES
    ('system', 'INIT_SCHEMA', 'database', 'ro_db', 'Khởi tạo lược đồ 7 bảng cơ sở dữ liệu Quản lý Nhà hàng / Order', '127.0.0.1'),
    ('admin', 'SEED_MENU', 'menu_items', 'MN-001..MN-008', 'Nạp 8 món ăn thực đơn nhà hàng thuộc 5 nhóm danh mục', '127.0.0.1'),
    ('admin', 'SEED_TABLES', 'dining_tables', 'TB-01..TB-06', 'Khởi tạo 6 bàn ăn tại 3 khu vực phục vụ', '127.0.0.1'),
    ('admin', 'CREATE_ORDER', 'orders', 'ORD-001', 'Tạo đơn hàng ORD-001 cho Bàn 01 - Cửa sổ (595.000 VNĐ)', '127.0.0.1'),
    ('thungan_01', 'PAY_ORDER', 'orders', 'ORD-004', 'Xác nhận thanh toán đơn hàng ORD-004 qua Chuyển khoản QR (465.000 VNĐ)', '127.0.0.1');
