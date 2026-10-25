const VALID_CATEGORIES = ['Khai vị', 'Món chính', 'Lẩu & Nướng', 'Đồ uống', 'Tráng miệng'];
const VALID_TABLE_STATUSES = ['Available', 'Occupied', 'Reserved', 'Cleaning'];
const VALID_ORDER_STATUSES = ['Pending', 'Preparing', 'Served', 'Paid', 'Cancelled'];
const VALID_PAYMENT_METHODS = ['Tiền mặt', 'Chuyển khoản QR', 'Thẻ ngân hàng'];

function validateMenuItemInput(data = {}) {
  const errors = [];
  const code = String(data.code || '').trim().toUpperCase();
  const name = String(data.name || '').trim();
  const category = String(data.category || '').trim();
  const price = Number(data.price);
  const unit = String(data.unit || 'Phần').trim();
  const description = String(data.description || '').trim();
  const is_available = data.is_available === 'false' || data.is_available === false ? false : true;

  if (!code || !/^[A-Z0-9_-]{3,20}$/.test(code)) {
    errors.push('Mã món ăn không hợp lệ (3-20 ký tự chữ in hoa, số, gạch ngang).');
  }
  if (!name || name.length < 2 || name.length > 150) {
    errors.push('Tên món ăn phải từ 2 đến 150 ký tự.');
  }
  if (!VALID_CATEGORIES.includes(category)) {
    errors.push('Danh mục món ăn không hợp lệ.');
  }
  if (!Number.isFinite(price) || price < 0 || price > 50000000) {
    errors.push('Đơn giá món ăn phải là số không âm hợp lệ.');
  }

  return {
    valid: errors.length === 0,
    errors,
    cleaned: { code, name, category, price: Math.round(price || 0), unit: unit || 'Phần', is_available, description }
  };
}

function validateTableInput(data = {}) {
  const errors = [];
  const table_code = String(data.table_code || '').trim().toUpperCase();
  const table_name = String(data.table_name || '').trim();
  const area = String(data.area || 'Tầng 1 - Sảnh chính').trim();
  const capacity = Number.parseInt(data.capacity, 10);
  const status = String(data.status || 'Available').trim();
  const note = String(data.note || '').trim();

  if (!table_code || !/^[A-Z0-9_-]{3,20}$/.test(table_code)) {
    errors.push('Mã bàn ăn không hợp lệ (ví dụ TB-07).');
  }
  if (!table_name || table_name.length < 2 || table_name.length > 80) {
    errors.push('Tên bàn ăn phải từ 2 đến 80 ký tự.');
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) {
    errors.push('Sức chứa bàn phải từ 1 đến 30 khách.');
  }
  if (!VALID_TABLE_STATUSES.includes(status)) {
    errors.push('Trạng thái bàn không hợp lệ.');
  }

  return {
    valid: errors.length === 0,
    errors,
    cleaned: { table_code, table_name, area, capacity: capacity || 4, status, note }
  };
}

function validateOrderInput(data = {}) {
  const errors = [];
  const order_code = String(data.order_code || '').trim().toUpperCase();
  const table_id = Number.parseInt(data.table_id, 10);
  const customer_name = String(data.customer_name || 'Khách lẻ').trim();
  const guest_count = Number.parseInt(data.guest_count || '2', 10);
  const status = String(data.status || 'Pending').trim();
  const payment_method = String(data.payment_method || 'Tiền mặt').trim();
  const note = String(data.note || '').trim();

  if (!order_code || !/^[A-Z0-9_-]{3,30}$/.test(order_code)) {
    errors.push('Mã đơn hàng không hợp lệ (ví dụ ORD-005).');
  }
  if (!Number.isInteger(table_id) || table_id <= 0) {
    errors.push('Phải chọn bàn ăn hợp lệ cho đơn hàng.');
  }
  if (!customer_name || customer_name.length < 2 || customer_name.length > 120) {
    errors.push('Tên khách hàng / đoàn khách phải từ 2 đến 120 ký tự.');
  }
  if (!Number.isInteger(guest_count) || guest_count < 1 || guest_count > 50) {
    errors.push('Số lượng khách phải từ 1 đến 50.');
  }
  if (!VALID_ORDER_STATUSES.includes(status)) {
    errors.push('Trạng thái đơn hàng không hợp lệ.');
  }
  if (!VALID_PAYMENT_METHODS.includes(payment_method)) {
    errors.push('Phương thức thanh toán không hợp lệ.');
  }

  return {
    valid: errors.length === 0,
    errors,
    cleaned: { order_code, table_id, customer_name, guest_count, status, payment_method, note }
  };
}

function calculateOrderTotal(items = []) {
  return items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    if (qty <= 0 || price < 0) return sum;
    return sum + Math.round(qty * price);
  }, 0);
}

module.exports = {
  VALID_CATEGORIES,
  VALID_TABLE_STATUSES,
  VALID_ORDER_STATUSES,
  VALID_PAYMENT_METHODS,
  validateMenuItemInput,
  validateTableInput,
  validateOrderInput,
  calculateOrderTotal
};
