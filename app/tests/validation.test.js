const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateMenuItemInput,
  validateTableInput,
  validateOrderInput,
  calculateOrderTotal
} = require('../src/validation');

test('validateMenuItemInput accepts valid dish data and normalizes code', () => {
  const res = validateMenuItemInput({
    code: 'mn-009',
    name: 'Lẩu gà lá é Phú Yên',
    category: 'Lẩu & Nướng',
    price: '280000',
    unit: 'Nồi',
    description: 'Gà ta thả vườn nấu lá é tươi'
  });
  assert.equal(res.valid, true);
  assert.equal(res.cleaned.code, 'MN-009');
  assert.equal(res.cleaned.price, 280000);
});

test('validateMenuItemInput rejects negative price and invalid category', () => {
  const res = validateMenuItemInput({
    code: 'X',
    name: 'A',
    category: 'Không hợp lệ',
    price: -5000
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.length >= 3);
});

test('validateTableInput validates capacity and status', () => {
  const validRes = validateTableInput({
    table_code: 'tb-08',
    table_name: 'Bàn 08 - Sân thượng',
    area: 'Khu vực Sân vườn',
    capacity: '6',
    status: 'Available'
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.cleaned.table_code, 'TB-08');
  assert.equal(validRes.cleaned.capacity, 6);

  const invalidRes = validateTableInput({
    table_code: 'TB-08',
    table_name: 'Bàn 08',
    capacity: '99',
    status: 'InvalidStatus'
  });
  assert.equal(invalidRes.valid, false);
});

test('validateOrderInput checks order_code, table_id, guest_count and status', () => {
  const res = validateOrderInput({
    order_code: 'ord-010',
    table_id: '2',
    customer_name: 'Phạm Văn Tuân',
    guest_count: '4',
    status: 'Preparing',
    payment_method: 'Chuyển khoản QR'
  });
  assert.equal(res.valid, true);
  assert.equal(res.cleaned.order_code, 'ORD-010');
  assert.equal(res.cleaned.table_id, 2);
});

test('calculateOrderTotal computes exact VND sum from order items', () => {
  const total = calculateOrderTotal([
    { quantity: 2, unit_price: 65000 },
    { quantity: 1, unit_price: 350000 },
    { quantity: 4, unit_price: 45000 }
  ]);
  assert.equal(total, 660000);
});
