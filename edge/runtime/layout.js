'use strict';

const fs = require('fs');
const {
  dataRoot,
  runtimeDir,
  configDataDir,
  licenceDataDir,
  platformDataDir,
  coachDataDir,
  backupDir,
  auditDir,
  logDir,
  overlayDir,
  ttsDataDir,
  ttsCacheDir,
  announceDataDir
} = require('../../shared/paths');

function ensureRuntimeLayout() {
  for (const dir of [
    dataRoot(),
    runtimeDir(),
    configDataDir(),
    licenceDataDir(),
    platformDataDir(),
    coachDataDir(),
    backupDir(),
    auditDir(),
    ttsDataDir(),
    ttsCacheDir(),
    announceDataDir()
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  for (const dir of [ttsDataDir(), ttsCacheDir(), announceDataDir()]) {
    try {
      fs.chmodSync(dir, 0o770);
    } catch {
      /* ignore when not owner */
    }
  }
  try {
    fs.mkdirSync(overlayDir(), { recursive: true });
  } catch {
    /* /etc may be unwritable in local tests */
  }
  try {
    fs.mkdirSync(logDir(), { recursive: true });
  } catch {
    /* /var/log may be unwritable in local tests */
  }
}

module.exports = { ensureRuntimeLayout };
