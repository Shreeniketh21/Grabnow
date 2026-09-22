/**
 * Postinstall script: Downloads the standalone yt-dlp Linux binary
 * into functions/bin/ during Cloud Build (or local npm install).
 * The standalone binary is a PyInstaller-compiled ELF — no Python needed at runtime.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const YT_DLP_PATH = path.join(BIN_DIR, 'yt-dlp');
const DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

// Skip on Windows (local dev already has yt-dlp.exe via pip)
if (process.platform === 'win32') {
  console.log('[postinstall] Windows detected — skipping yt-dlp Linux binary download.');
  process.exit(0);
}

// Skip if binary already exists
if (fs.existsSync(YT_DLP_PATH)) {
  const stat = fs.statSync(YT_DLP_PATH);
  if (stat.size > 1000000) {
    console.log('[postinstall] yt-dlp binary already exists (' + (stat.size / 1024 / 1024).toFixed(1) + ' MB). Skipping download.');
    process.exit(0);
  }
}

if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects <= 0) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    console.log('[postinstall] Downloading yt-dlp from:', url);
    const req = mod.get(url, { headers: { 'User-Agent': 'GrabNow-CloudBuild/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest, redirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          fs.chmodSync(dest, 0o755);
          const size = fs.statSync(dest).size;
          console.log('[postinstall] yt-dlp downloaded successfully (' + (size / 1024 / 1024).toFixed(1) + ' MB)');
          resolve();
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

download(DOWNLOAD_URL, YT_DLP_PATH)
  .then(() => process.exit(0))
  .catch((err) => {
    console.warn('[postinstall] WARNING: Could not download yt-dlp binary:', err.message);
    console.warn('[postinstall] Media extraction will be limited without yt-dlp.');
    process.exit(0); // Don't fail the build — let the function deploy without yt-dlp
  });
