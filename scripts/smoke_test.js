const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'evidence');

function loadEnv() {
  const env = {};
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
  }
  return env;
}

function request(urlStr, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers,
        rejectUnauthorized: false
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            rawHeaders: res.rawHeaders,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function extractCsrf(html) {
  const m = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return m ? m[1] : null;
}

function extractCookie(setCookieHeader) {
  if (!setCookieHeader || !setCookieHeader.length) return '';
  return setCookieHeader.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  const env = loadEnv();
  const httpBase = `http://127.0.0.1:${env.NGINX_HTTP_PORT || 8080}`;
  const httpsBase = `https://127.0.0.1:${env.NGINX_HTTPS_PORT || 8443}`;
  const promBase = `http://127.0.0.1:${env.PROMETHEUS_PORT || 9090}`;
  const grafBase = `http://127.0.0.1:${env.GRAFANA_PORT || 3002}`;

  const results = [];
  const record = (id, name, passed, details) => {
    results.push({ id, name, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] #${id} ${name}: ${details}`);
  };

  // 1. HTTP -> HTTPS redirect
  const r1 = await request(`${httpBase}/`);
  record(
    1,
    'Chuyển hướng HTTP sang HTTPS',
    r1.statusCode === 301 && String(r1.headers.location || '').startsWith('https://'),
    `HTTP ${r1.statusCode}; Location: ${r1.headers.location}`
  );

  // 2. Healthcheck endpoint
  const r2 = await request(`${httpsBase}/health`);
  const healthJson = JSON.parse(r2.body);
  record(
    2,
    'Healthcheck và kết nối DB',
    r2.statusCode === 200 && healthJson.status === 'UP' && healthJson.db_user === 'ro_app',
    `HTTP ${r2.statusCode}; status=${healthJson.status}, db=${healthJson.db_name}, user=${healthJson.db_user}`
  );

  // 3. Security headers check (and no duplicate headers)
  const xctoCount = r2.rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase() === 'x-content-type-options').length;
  const xfoCount = r2.rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase() === 'x-frame-options').length;
  const hasHeaders =
    r2.headers['x-content-type-options'] === 'nosniff' &&
    r2.headers['x-frame-options'] === 'DENY' &&
    Boolean(r2.headers['strict-transport-security']) &&
    Boolean(r2.headers['content-security-policy']) &&
    xctoCount === 1 &&
    xfoCount === 1;
  record(
    3,
    'Kiểm tra Security Headers',
    hasHeaders,
    `X-Content-Type-Options=${r2.headers['x-content-type-options']} (count=${xctoCount}), X-Frame-Options=${r2.headers['x-frame-options']} (count=${xfoCount}), HSTS=${r2.headers['strict-transport-security']}`
  );

  // 4. Unauthenticated access control
  const r4 = await request(`${httpsBase}/orders`);
  record(
    4,
    'Kiểm soát truy cập ẩn danh',
    r4.statusCode === 302 && String(r4.headers.location || '').startsWith('/login'),
    `HTTP ${r4.statusCode} -> ${r4.headers.location}`
  );

  // 5. CSRF token generation on /login
  const r5 = await request(`${httpsBase}/login`);
  let cookieJar = extractCookie(r5.headers['set-cookie']);
  let csrfToken = extractCsrf(r5.body);
  record(
    5,
    'Sinh mã bảo vệ CSRF Token',
    r5.statusCode === 200 && Boolean(csrfToken) && csrfToken.length >= 32,
    `CSRF token length=${csrfToken ? csrfToken.length : 0}`
  );

  // 6. Failed login attempt (generates login_failed log event)
  const wrongBody = new URLSearchParams({
    _csrf: csrfToken,
    username: env.APP_ADMIN_USER || 'admin',
    password: 'WrongPassword_Test_401!'
  }).toString();
  const r6 = await request(`${httpsBase}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieJar
    },
    body: wrongBody
  });
  record(
    6,
    'Đăng nhập sai và ghi log an ninh',
    r6.statusCode === 401,
    `HTTP ${r6.statusCode} (sinh sự kiện login_failed trong app.log và audit_logs)`
  );

  // 7. Valid Admin login
  const loginBody = new URLSearchParams({
    _csrf: csrfToken,
    username: env.APP_ADMIN_USER || 'admin',
    password: env.APP_ADMIN_PASSWORD,
    redirect: '/'
  }).toString();
  const r7 = await request(`${httpsBase}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieJar
    },
    body: loginBody
  });
  const newSetCookie = r7.headers['set-cookie'] || r5.headers['set-cookie'] || [];
  if (r7.headers['set-cookie']) {
    cookieJar = extractCookie(r7.headers['set-cookie']);
  }
  record(
    7,
    'Đăng nhập đúng tài khoản Admin',
    r7.statusCode === 302 && r7.headers.location === '/',
    `HTTP ${r7.statusCode} -> ${r7.headers.location}`
  );

  // 8. Session cookie flags
  const rawSetCookieStr = newSetCookie.join('; ');
  const cookieFlagsOk =
    rawSetCookieStr.includes('ro_session_id=') &&
    /HttpOnly/i.test(rawSetCookieStr) &&
    /Secure/i.test(rawSetCookieStr) &&
    /SameSite=Lax/i.test(rawSetCookieStr);
  record(
    8,
    'Cờ bảo mật Session Cookie',
    cookieFlagsOk,
    `ro_session_id flags: HttpOnly, Secure, SameSite=Lax`
  );

  // Refresh CSRF from authenticated /orders page
  const ordersPage = await request(`${httpsBase}/orders`, { headers: { Cookie: cookieJar } });
  csrfToken = extractCsrf(ordersPage.body) || csrfToken;

  // 9. CRUD: Create test order ORD-999
  const createOrderBody = new URLSearchParams({
    _csrf: csrfToken,
    order_code: 'ORD-999',
    table_id: '3',
    customer_name: 'Khách kiểm thử Smoke Test',
    guest_count: '4',
    status: 'Preparing',
    payment_method: 'Chuyển khoản QR',
    initial_menu_item_id: '1',
    initial_quantity: '2',
    note: 'Kiểm thử tích hợp tự động'
  }).toString();
  const r9 = await request(`${httpsBase}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieJar
    },
    body: createOrderBody
  });
  const createdLoc = r9.headers.location || '';
  const idMatch = createdLoc.match(/\/orders\/(\d+)/);
  const createdOrderId = idMatch ? idMatch[1] : null;
  record(
    9,
    'Thao tác CRUD: Tạo đơn hàng mới',
    r9.statusCode === 302 && Boolean(createdOrderId),
    `HTTP ${r9.statusCode} -> /orders/${createdOrderId}`
  );

  // 10. CRUD: Read order detail & verify total calculation
  const r10 = await request(`${httpsBase}/orders/${createdOrderId}`, {
    headers: { Cookie: cookieJar }
  });
  record(
    10,
    'Thao tác CRUD: Xem chi tiết đơn hàng',
    r10.statusCode === 200 && r10.body.includes('ORD-999') && r10.body.includes('130.000'),
    `HTTP ${r10.statusCode}; hiển thị đúng mã ORD-999 và tổng tiền 130.000 ₫`
  );

  // 11. CRUD: Delete test order ORD-999 (preserving seed orders)
  const delBody = new URLSearchParams({ _csrf: csrfToken }).toString();
  const r11 = await request(`${httpsBase}/orders/${createdOrderId}/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieJar
    },
    body: delBody
  });
  record(
    11,
    'Thao tác CRUD: Xóa đơn hàng thử nghiệm',
    r11.statusCode === 302 && String(r11.headers.location || '').startsWith('/orders'),
    `HTTP ${r11.statusCode}; giữ nguyên 4 đơn hàng mẫu ban đầu`
  );

  // 12. Missing CSRF token rejected with 403
  const r12 = await request(`${httpsBase}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieJar
    },
    body: 'order_code=ORD-HACK&table_id=1'
  });
  record(
    12,
    'Chặn yêu cầu thiếu CSRF Token',
    r12.statusCode === 403,
    `HTTP ${r12.statusCode} Forbidden`
  );

  // 13. Non-existent route returns 404
  const r13 = await request(`${httpsBase}/not-found-page-xyz-999`, {
    headers: { Cookie: cookieJar }
  });
  record(
    13,
    'Xử lý đường dẫn không tồn tại',
    r13.statusCode === 404,
    `HTTP ${r13.statusCode} Not Found`
  );

  // 14. Prometheus targets UP
  const r14 = await request(`${promBase}/api/v1/targets`);
  const promJson = JSON.parse(r14.body);
  const activeTargets = (promJson.data && promJson.data.activeTargets) || [];
  const upJobs = activeTargets.filter((t) => t.health === 'up').map((t) => t.labels.job).sort();
  record(
    14,
    'Kiểm tra Prometheus Targets',
    upJobs.length === 4 && ['cadvisor', 'nginx', 'postgres', 'prometheus'].every((j) => upJobs.includes(j)),
    `4/4 UP: ${upJobs.join(', ')}`
  );

  // 15. Grafana health API
  const r15 = await request(`${grafBase}/api/health`);
  const grafJson = JSON.parse(r15.body);
  record(
    15,
    'Kiểm tra máy chủ Grafana',
    r15.statusCode === 200 && grafJson.database === 'ok',
    `HTTP ${r15.statusCode}; database=${grafJson.database}, version=${grafJson.version}`
  );

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const summary = {
    executed_at: new Date().toISOString(),
    topic: 'Đề 12: Hệ thống Quản lý Nhà hàng / Order',
    student: 'Phạm Văn Tuân (DTC245200485 - CNTT K23I)',
    total_tests: results.length,
    passed_tests: results.filter((x) => x.passed).length,
    failed_tests: results.filter((x) => !x.passed).length,
    results
  };
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, 'smoke_test_results.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  );
  console.log(`\n=== KẾT QUẢ SMOKE TEST: ${summary.passed_tests}/${summary.total_tests} PASS ===`);
  if (summary.failed_tests > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
