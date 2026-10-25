-- ============================================================================
-- ĐỀ 12: HỆ THỐNG QUẢN LÝ NHÀ HÀNG / ORDER (RESTAURANT & ORDER MANAGEMENT)
-- Lược đồ Cơ sở dữ liệu PostgreSQL 16 (7 bảng dữ liệu)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'manager',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dining_tables (
    id SERIAL PRIMARY KEY,
    table_code VARCHAR(20) UNIQUE NOT NULL,
    table_name VARCHAR(80) NOT NULL,
    area VARCHAR(80) NOT NULL DEFAULT 'Tầng 1 - Sảnh chính',
    capacity INTEGER NOT NULL CHECK (capacity > 0 AND capacity <= 30),
    status VARCHAR(30) NOT NULL DEFAULT 'Available'
        CHECK (status IN ('Available', 'Occupied', 'Reserved', 'Cleaning')),
    note TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(60) NOT NULL
        CHECK (category IN ('Khai vị', 'Món chính', 'Lẩu & Nướng', 'Đồ uống', 'Tráng miệng')),
    price NUMERIC(12, 0) NOT NULL CHECK (price >= 0),
    unit VARCHAR(30) NOT NULL DEFAULT 'Phần',
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_code VARCHAR(30) UNIQUE NOT NULL,
    table_id INTEGER NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
    customer_name VARCHAR(120) NOT NULL DEFAULT 'Khách lẻ',
    guest_count INTEGER NOT NULL DEFAULT 2 CHECK (guest_count > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Preparing', 'Served', 'Paid', 'Cancelled')),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Tiền mặt'
        CHECK (payment_method IN ('Tiền mặt', 'Chuyển khoản QR', 'Thẻ ngân hàng')),
    total_amount NUMERIC(12, 0) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    note TEXT DEFAULT '',
    created_by VARCHAR(60) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 0) NOT NULL CHECK (unit_price >= 0),
    item_status VARCHAR(30) NOT NULL DEFAULT 'Queued'
        CHECK (item_status IN ('Queued', 'Cooking', 'Served')),
    note VARCHAR(255) DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(60) NOT NULL,
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50) DEFAULT '',
    details TEXT NOT NULL,
    ip_address VARCHAR(64) DEFAULT '127.0.0.1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "session" (
    "sid" VARCHAR NOT NULL COLLATE "default",
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
