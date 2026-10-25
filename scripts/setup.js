const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const CERTS_DIR = path.join(ROOT, 'certs');
const BACKUPS_DIR = path.join(ROOT, 'backups');

function randomPassword(len = 20) {
  return crypto.randomBytes(len).toString('base64url').slice(0, len);
}

function generateEnvFile() {
  if (fs.existsSync(ENV_PATH) && !process.argv.includes('--force')) {
    console.log('[setup] File .env đã tồn tại, giữ nguyên cấu hình hiện tại.');
    return;
  }

  const content = [
    '# ============================================================================',
    '# ĐỀ 12: HỆ THỐNG QUẢN LÝ NHÀ HÀNG / ORDER - TỰ ĐỘNG SINH BỞI scripts/setup.js',
    '# Sinh viên: Phạm Văn Tuân - MSSV: DTC245200485 - Lớp: CNTT K23I',
    '# ============================================================================',
    'NODE_ENV=production',
    'APP_PORT=3000',
    '',
    'STUDENT_NAME="Phạm Văn Tuân"',
    'STUDENT_ID="DTC245200485"',
    'STUDENT_CLASS="CNTT K23I"',
    'INSTRUCTOR_NAME="Lê Khánh Dương"',
    'TOPIC_CODE="Đề 12"',
    'TOPIC_TITLE="Hệ thống Quản lý Nhà hàng / Order"',
    '',
    'POSTGRES_DB=ro_db',
    'POSTGRES_USER=postgres',
    `POSTGRES_PASSWORD=${randomPassword(22)}`,
    '',
    'APP_DB_USER=ro_app',
    `APP_DB_PASSWORD=${randomPassword(22)}`,
    '',
    'EXPORTER_DB_USER=postgres_exporter',
    `EXPORTER_DB_PASSWORD=${randomPassword(22)}`,
    '',
    `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    'APP_ADMIN_USER=admin',
    `APP_ADMIN_PASSWORD=${randomPassword(18)}`,
    'APP_ADMIN_EMAIL=dtc245200485@ictu.edu.vn',
    '',
    'PGADMIN_DEFAULT_EMAIL=dtc245200485@ictu.edu.vn',
    `PGADMIN_DEFAULT_PASSWORD=${randomPassword(18)}`,
    'PGADMIN_LISTEN_PORT=8081',
    '',
    'NGINX_HTTP_PORT=8080',
    'NGINX_HTTPS_PORT=8443',
    '',
    'PROMETHEUS_PORT=9090',
    'GRAFANA_PORT=3002',
    'GRAFANA_ADMIN_USER=admin',
    `GRAFANA_ADMIN_PASSWORD=${randomPassword(18)}`,
    ''
  ].join('\n');

  fs.writeFileSync(ENV_PATH, content, { encoding: 'utf8', mode: 0o600 });
  console.log('[setup] Đã khởi tạo file .env với mật khẩu ngẫu nhiên an toàn.');
}

function findOpenSSL() {
  const candidates = [
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe'
  ];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['version'], { stdio: 'ignore' });
      return bin;
    } catch (_) {
      // try next
    }
  }
  throw new Error('Không tìm thấy công cụ openssl để tạo chứng chỉ TLS.');
}

function generateTlsCerts() {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
  const keyPath = path.join(CERTS_DIR, 'server.key');
  const crtPath = path.join(CERTS_DIR, 'server.crt');

  if (fs.existsSync(keyPath) && fs.existsSync(crtPath) && !process.argv.includes('--force')) {
    console.log('[setup] Chứng chỉ TLS tự ký trong certs/ đã tồn tại.');
    return;
  }

  const opensslBin = findOpenSSL();
  const cnfPath = path.join(CERTS_DIR, 'openssl_san.cnf');
  const cnf = [
    '[req]',
    'default_bits = 3072',
    'prompt = no',
    'default_md = sha256',
    'distinguished_name = dn',
    'x509_extensions = v3_req',
    '[dn]',
    'C = VN',
    'ST = ThaiNguyen',
    'L = ThaiNguyen',
    'O = ICTU_CNTT_K23I',
    'OU = De12_RestaurantOrder',
    'CN = localhost',
    '[v3_req]',
    'subjectAltName = @alt_names',
    'basicConstraints = CA:FALSE',
    'keyUsage = digitalSignature, keyEncipherment',
    'extendedKeyUsage = serverAuth',
    '[alt_names]',
    'DNS.1 = localhost',
    'IP.1 = 127.0.0.1'
  ].join('\n');

  fs.writeFileSync(cnfPath, cnf, 'utf8');

  execFileSync(
    opensslBin,
    [
      'req',
      '-x509',
      '-nodes',
      '-days',
      '365',
      '-newkey',
      'rsa:3072',
      '-keyout',
      keyPath,
      '-out',
      crtPath,
      '-config',
      cnfPath
    ],
    { stdio: 'inherit' }
  );

  fs.unlinkSync(cnfPath);
  fs.chmodSync(keyPath, 0o644);
  fs.chmodSync(crtPath, 0o644);
  console.log('[setup] Đã tạo chứng chỉ TLS tự ký RSA 3072-bit (SAN: localhost, 127.0.0.1) tại certs/.');
}

function main() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  generateEnvFile();
  generateTlsCerts();
  console.log('[setup] Hoàn tất chuẩn bị môi trường cho Đề 12 - Hệ thống Quản lý Nhà hàng / Order.');
}

main();
