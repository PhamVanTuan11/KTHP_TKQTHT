const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'evidence');

function runCmd(bin, args) {
  return execFileSync(bin, args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function main() {
  // 1. Check non-root UIDs
  const appId = runCmd('docker', ['exec', 'ro-app', 'id']);
  const nginxId = runCmd('docker', ['exec', 'ro-nginx', 'id']);
  const lokiUid = runCmd('docker', ['inspect', 'ro-loki', '--format', '{{.Config.User}}']);
  const promtailUid = runCmd('docker', ['inspect', 'ro-promtail', '--format', '{{.Config.User}}']);

  // 2. Check ReadonlyRootfs, CapDrop, SecurityOpt on ro-app and ro-nginx
  const appHostCfg = JSON.parse(runCmd('docker', ['inspect', 'ro-app', '--format', '{{json .HostConfig}}']));
  const nginxHostCfg = JSON.parse(runCmd('docker', ['inspect', 'ro-nginx', '--format', '{{json .HostConfig}}']));

  // 3. Check internal network ro_database_network and postgres PortBindings
  const dbNetInternal = runCmd('docker', ['network', 'inspect', 'ro_database_network', '--format', '{{.Internal}}']);
  const pgPortBindings = runCmd('docker', ['inspect', 'ro-postgres', '--format', '{{json .HostConfig.PortBindings}}']);
  const appPortBindings = runCmd('docker', ['inspect', 'ro-app', '--format', '{{json .HostConfig.PortBindings}}']);

  // 4. Check PostgreSQL least privilege for ro_app
  const roleGrantsRaw = runCmd('docker', [
    'exec',
    'ro-postgres',
    'psql',
    '-U',
    'postgres',
    '-d',
    'ro_db',
    '-t',
    '-A',
    '-c',
    "SELECT DISTINCT privilege_type FROM information_schema.role_table_grants WHERE grantee = 'ro_app' ORDER BY privilege_type;"
  ]);
  const roleGrants = roleGrantsRaw.split(/\r?\n/).filter(Boolean);

  // Verify ro_app cannot CREATE TABLE in public schema
  let createTableBlocked = false;
  try {
    runCmd('docker', [
      'exec',
      'ro-postgres',
      'psql',
      '-U',
      'ro_app',
      '-d',
      'ro_db',
      '-c',
      'CREATE TABLE hack_test(id int);'
    ]);
  } catch (err) {
    createTableBlocked = true;
  }

  // 5. Check nginx -t syntax & config test
  const nginxTest = runCmd('docker', ['exec', 'ro-nginx', 'nginx', '-t']);

  // 6. Check git check-ignore on sensitive paths
  const ignoredPaths = ['.env', 'certs/server.key', 'backups/latest_ro_db_backup.sql'];
  const gitIgnored = {};
  for (const p of ignoredPaths) {
    try {
      runCmd('git', ['check-ignore', p]);
      gitIgnored[p] = true;
    } catch (_) {
      gitIgnored[p] = false;
    }
  }

  const report = {
    verified_at: new Date().toISOString(),
    topic: 'Đề 12: Hệ thống Quản lý Nhà hàng / Order',
    checks: {
      non_root_containers: {
        ro_app_id: appId,
        ro_nginx_id: nginxId,
        ro_loki_user: lokiUid,
        ro_promtail_user: promtailUid,
        passed: appId.includes('uid=1000(node)') && nginxId.includes('uid=101(nginx)') && lokiUid === '10001:10001'
      },
      readonly_rootfs_and_capabilities: {
        ro_app_readonly_rootfs: appHostCfg.ReadonlyRootfs,
        ro_app_cap_drop: appHostCfg.CapDrop,
        ro_app_security_opt: appHostCfg.SecurityOpt,
        ro_nginx_readonly_rootfs: nginxHostCfg.ReadonlyRootfs,
        ro_nginx_cap_drop: nginxHostCfg.CapDrop,
        ro_nginx_security_opt: nginxHostCfg.SecurityOpt,
        passed:
          appHostCfg.ReadonlyRootfs === true &&
          nginxHostCfg.ReadonlyRootfs === true &&
          Array.isArray(appHostCfg.CapDrop) &&
          appHostCfg.CapDrop.includes('ALL')
      },
      network_isolation: {
        ro_database_network_internal: dbNetInternal === 'true',
        ro_postgres_port_bindings: pgPortBindings,
        ro_app_port_bindings: appPortBindings,
        passed: dbNetInternal === 'true' && pgPortBindings === '{}' && appPortBindings === '{}'
      },
      database_least_privilege: {
        ro_app_privileges: roleGrants,
        ddl_create_table_blocked: createTableBlocked,
        passed:
          roleGrants.length === 4 &&
          ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].every((p) => roleGrants.includes(p)) &&
          createTableBlocked === true
      },
      nginx_config_test: {
        output: nginxTest,
        passed: true
      },
      secrets_excluded_from_git: {
        ignored: gitIgnored,
        passed: Object.values(gitIgnored).every(Boolean)
      }
    }
  };

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'hardening_verification.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('[verify_hardening] Kết quả kiểm chứng Hardening:');
  console.log(JSON.stringify(report.checks, null, 2));
}

main();
