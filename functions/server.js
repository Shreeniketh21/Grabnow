const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const {
  extractMediaDetails,
  resolveUrl,
  normalizeVkUrl,
  ytDlpPath,
  getCommonArgs,
  getDownloadArgs,
  ffmpegDir,
  hasFfmpeg,
  BROWSER_USER_AGENT
} = require('./extractor');
const { crawlBulkMedia } = require('./bulk_crawler');

const app = express();
const PORT = process.env.PORT || 3000;

const isCloud = Boolean(
  process.env.FUNCTION_TARGET ||
  process.env.K_SERVICE ||
  process.env.FIREBASE_CONFIG ||
  process.env.VERCEL
);

const DOWNLOADS_DIR = isCloud
  ? path.join('/tmp', 'downloads')
  : path.join(__dirname, 'downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

const userCookiePath = isCloud
  ? path.join('/tmp', 'user_cookies.txt')
  : path.join(__dirname, 'user_cookies.txt');

const downloadJobs = new Map();

// Helper to decode HTML entities in titles
function unescapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

// Helper to sanitize URLs (remove &amp; etc.)
function cleanMediaUrl(raw) {
  if (!raw) return '';
  return String(raw).trim().replace(/&amp;/g, '&');
}

// Periodic cleanup of downloads older than 25 minutes
setInterval(() => {
  const now = Date.now();
  fs.readdir(DOWNLOADS_DIR, (err, files) => {
    if (err) return;
    for (const file of files) {
      const filePath = path.join(DOWNLOADS_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && now - stats.mtimeMs > 25 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    }
  });
}, 10 * 60 * 1000);

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', engine: 'online', mode: 'firebase-functions' }));

// Save or clear custom Netscape / browser cookies for auth-protected media (e.g. Hotstar, YouTube Members)
app.post('/api/cookies/save', (req, res) => {
  const { cookies } = req.body;
  if (!cookies || !cookies.trim()) {
    if (fs.existsSync(userCookiePath)) {
      try { fs.unlinkSync(userCookiePath); } catch (_) {}
    }
    return res.json({ success: true, active: false, message: 'Custom session cookies cleared.' });
  }

  let formatted = cookies.trim();
  if (!formatted.startsWith('# Netscape HTTP Cookie File')) {
    if (formatted.includes('=')) {
      // Convert raw browser cookie string (key=val; key2=val2) into Netscape format
      const pairs = formatted.split(';');
      const netscapeLines = ['# Netscape HTTP Cookie File'];
      for (const pair of pairs) {
        const [k, ...v] = pair.trim().split('=');
        if (k && v.length > 0) {
          const val = v.join('=');
          netscapeLines.push(`.instagram.com\tTRUE\t/\tTRUE\t2147483647\t${k.trim()}\t${val.trim()}`);
        }
      }
      formatted = netscapeLines.join('\n');
    } else {
      formatted = `# Netscape HTTP Cookie File\n${formatted}`;
    }
  }

  fs.writeFileSync(userCookiePath, formatted, 'utf8');
  console.log('[Cookies] Saved user custom cookies to ' + userCookiePath);
  res.json({ success: true, active: true, message: 'Custom session cookies saved successfully!' });
});

// Check if custom cookies are currently configured
app.get('/api/cookies/status', (req, res) => {
  const exists = fs.existsSync(userCookiePath);
  res.json({ active: exists });
});

// Helper to detect bulk/collection links
function isBulkUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (/reddit\.com\/r\/[^\/]+(\/(?:top|hot|new))?\/?(\?.*)?$/i.test(lower)) return true;
  if (/reddit\.com\/user\/[^\/]+\/?(\?.*)?$/i.test(lower)) return true;
  if (/youtube\.com\/(?:@[^\/]+|c\/[^\/]+|channel\/[^\/]+|user\/[^\/]+)\/?(?:videos|shorts|featured)?\/?(\?.*)?$/i.test(lower)) return true;
  if (/youtube\.com\/playlist\?list=/i.test(lower)) return true;
  if (/tiktok\.com\/@[^\/]+\/?(\?.*)?$/i.test(lower)) return true;
  if (/instagram\.com\/(?!p\/|reel\/|tv\/|stories\/)[a-zA-Z0-9._]+\/?(\?.*)?$/i.test(lower)) return true;
  return false;
}

// Robust Video / Media Information Extractor (with bulk crawl fallback)
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  
  // If obviously a bulk/collection URL, prioritize bulk crawler
  if (isBulkUrl(url)) {
    console.log(`[API /api/info] Detected bulk target: ${url}`);
    try {
      const bulkResult = await crawlBulkMedia(url);
      if (bulkResult && bulkResult.items && bulkResult.items.length > 0) {
        console.log(`[API /api/info] Bulk harvester succeeded immediately: ${bulkResult.items.length} items`);
        return res.json(bulkResult);
      }
    } catch (err) {
      console.warn('[API /api/info] Bulk harvester failed, falling back to single extractor:', err.message);
    }
    if (/instagram\.com/i.test(url)) {
      return res.status(422).json({
        error: 'Instagram requires session authentication to view this profile. Please use the ⚡ Live Tab Harvester directly from your Chrome tab or sync your session cookies in Cookies & Auth.',
        isInstagramAuthRequired: true
      });
    }
  }

  try {
    const data = await extractMediaDetails(url);
    res.json(data);
  } catch (err) {
    console.log('[API /api/info] Primary extraction failed, trying bulk crawl fallback...');
    try {
      const bulkResult = await crawlBulkMedia(url);
      if (bulkResult && bulkResult.items && bulkResult.items.length > 0) {
        console.log(`[API /api/info] Bulk crawl fallback succeeded: ${bulkResult.items.length} items`);
        return res.json(bulkResult);
      }
    } catch (bulkErr) {
      console.error('[API /api/info] Bulk crawl fallback also failed:', bulkErr.message);
    }
    console.error('[API /api/info Error]:', err.message);
    const isIgAuth = Boolean(err.isInstagramAuthRequired || (/instagram\.com/i.test(url) && (err.message || '').includes('Instagram requires session authentication')));
    res.status(422).json({
      error: err.message || 'Unable to extract media from this link.',
      isInstagramAuthRequired: isIgAuth
    });
  }
});

let latestHarvestSession = null;

// Endpoint for In-Page Live Harvester to import media harvested in browser tab
app.post('/api/bulk/import-harvest', (req, res) => {
  const { title, uploader, webpage_url, thumbnail, itemCount, extractor, items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No media items provided in payload' });
  }

  latestHarvestSession = {
    type: 'bulk_gallery',
    id: 'live_harvest_' + Date.now().toString(36),
    title: title || `Live Harvest Collection (${items.length} Items)`,
    uploader: uploader || 'Instagram User',
    thumbnail: thumbnail || (items[0] && (items[0].thumbnail || items[0].url)) || '',
    itemCount: items.length,
    webpage_url: webpage_url || '',
    extractor: extractor || 'Instagram Live Harvester',
    items: items,
    timestamp: Date.now()
  };

  console.log(`[LiveHarvester] ✅ Received ${items.length} live media items from ${uploader}`);
  res.json({ success: true, sessionId: latestHarvestSession.id, count: items.length });
});

// Endpoint for frontend to check / poll for new live harvested sessions
app.get('/api/bulk/latest-harvest', (req, res) => {
  const consume = req.query.consume === 'true';
  if (!latestHarvestSession) {
    return res.json({ active: false });
  }
  const session = { ...latestHarvestSession, active: true };
  if (consume) {
    latestHarvestSession = null;
  }
  res.json(session);
});

// Dedicated 10x Bulk Media Harvester API — uses crawlBulkMedia as primary engine
app.post('/api/bulk/extract', async (req, res) => {
  const { url, limit, mode } = req.body;
  try {
    console.log(`[Bulk Harvest] Incoming request for: ${url}`);
    // Try dedicated bulk crawler first
    const bulkResult = await crawlBulkMedia(url);
    if (bulkResult && bulkResult.items && bulkResult.items.length > 0) {
      console.log(`[Bulk Harvest] Success: ${bulkResult.items.length} items from ${bulkResult.extractor}`);
      return res.json(bulkResult);
    }
    
    // If it's an Instagram profile link and crawler couldn't read it
    if (isBulkUrl(url) && /instagram\.com/i.test(url)) {
      return res.status(422).json({
        error: 'Instagram requires login to view this profile. Please use the GrabNow 1-Click Live Harvester from your browser tab or sync your cookies in Settings.',
        isInstagramAuthRequired: true
      });
    }

    // Fallback to single media extractor
    console.log('[Bulk Harvest] Bulk crawl returned no items, falling back to single media extractor...');
    const data = await extractMediaDetails(url);
    res.json(data);
  } catch (err) {
    console.error('[API /api/bulk/extract Error]:', err.message);
    res.status(422).json({
      error: err.message || 'Unable to harvest bulk media from this link.'
    });
  }
});

// Stream single image directly to user's computer with proper headers & filename
app.get('/api/download/image', async (req, res) => {
  const imageUrl = req.query.url;
  const requestedName = req.query.filename || 'image.jpg';

  if (!imageUrl) {
    return res.status(400).send('Image URL is required');
  }

  try {
    const safeName = requestedName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const imageRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Referer': imageUrl
      }
    });

    if (!imageRes.ok) {
      return res.status(imageRes.status).send(`Failed to fetch remote image: ${imageRes.statusText}`);
    }

    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

    const arrayBuffer = await imageRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('[API /api/download/image Error]:', err);
    res.status(500).send('Failed to proxy image download');
  }
});

// Helper to instantiate ZipArchive across archiver versions
function createZipArchive(options = {}) {
  if (typeof archiver === 'function') {
    return archiver('zip', options);
  }
  if (archiver.ZipArchive) {
    return new archiver.ZipArchive(options);
  }
  throw new Error('Archiver zip module unavailable');
}

// Batch ZIP creation for carousel images or multi-item selections
app.post('/api/download/batch-zip', async (req, res) => {
  const { items, title } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items provided for batch download' });
  }

  const albumTitle = (title || 'GrabNow_Collection').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const zipFilename = `${albumTitle}_${Date.now()}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  let archive;
  try {
    archive = createZipArchive({ zlib: { level: 6 } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  archive.on('error', (err) => {
    console.error('[Archiver Error]:', err);
    if (!res.headersSent) {
      res.status(500).send({ error: err.message });
    }
  });

  archive.pipe(res);

  console.log(`[Batch ZIP] Bundling ${items.length} items for "${albumTitle}"...`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemUrl = item.url;
    const ext = item.ext || 'jpg';
    const itemName = item.filename || `${albumTitle}_${i + 1}.${ext}`;

    try {
      const response = await fetch(itemUrl, {
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          'Referer': itemUrl
        }
      });

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        archive.append(buffer, { name: itemName });
      }
    } catch (err) {
      console.warn(`[Batch ZIP] Failed to download item ${i + 1} (${itemUrl}):`, err.message);
    }
  }

  await archive.finalize();
  console.log(`[Batch ZIP] Archive finalized and sent: ${zipFilename}`);
});

// Build format-specific yt-dlp arguments (reusable for retries)
function buildFormatArgs({ formatId, type, quality, isVk = false }) {
  const args = [];
  const isAudio = type === 'audio';

  if (isAudio) {
    args.push('-x');
    args.push('--audio-format', 'mp3');
    args.push('--audio-quality', '0');
    if (formatId && formatId !== 'best' && !formatId.startsWith('direct')) {
      args.push('-f', `${formatId}/bestaudio/ba/b`);
    } else {
      args.push('-f', 'bestaudio/ba/b');
    }
  } else {
    if (isVk) {
      if (formatId && formatId !== 'best' && !formatId.startsWith('direct')) {
        args.push('-f', `${formatId}/best[ext=mp4]/best/b`);
      } else {
        // Direct pre-muxed mp4 formats download 3x-5x faster with no FFmpeg muxing delay
        args.push('-f', 'best[ext=mp4]/best/b/bestvideo+bestaudio');
      }
    } else {
      if (formatId && formatId !== 'best' && !formatId.startsWith('direct')) {
        args.push('-f', `${formatId}+ba/b[format_id=${formatId}]/${formatId}/best[ext=mp4]/best/b`);
      } else if (quality && quality.includes('p')) {
        const h = quality.replace('p', '');
        args.push('-f', `best[height<=${h}][ext=mp4]/best[height<=${h}]/bv*[height<=${h}]+ba/b`);
      } else {
        // Prioritize single-stream MP4 first to download in seconds without heavy remuxing
        args.push('-f', 'best[ext=mp4]/best/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/b');
      }
    }
    args.push('--merge-output-format', 'mp4');
  }
  return args;
}

// Spawn a yt-dlp download child process and wire up progress tracking on the job
function spawnDownload(jobId, strategyArgs, targetUrl, outTemplate) {
  const args = [...strategyArgs, '--newline', '-o', outTemplate, targetUrl];
  console.log(`[Job ${jobId}] Spawning:`, ytDlpPath, args.join(' '));

  const job = downloadJobs.get(jobId);
  if (!job) return null;

  job.progress = 0;
  job.speed = '0 KiB/s';
  job.eta = '--:--';
  job.status = 'starting';
  job.error = null;

  const child = spawn(ytDlpPath, args);
  let lastStderr = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const j = downloadJobs.get(jobId);
    if (!j) return;

    const progressMatch = text.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/i);
    if (progressMatch) {
      j.status = 'downloading';
      j.progress = parseFloat(progressMatch[1]);
      j.fileSize = progressMatch[2];
      j.speed = progressMatch[3];
      j.eta = progressMatch[4];
    } else {
      const simplePercent = text.match(/\[download\]\s+([\d.]+)%/i);
      if (simplePercent) {
        j.status = 'downloading';
        j.progress = parseFloat(simplePercent[1]);
      }
    }

    const destMatch = text.match(/\[(?:download|Merger|ExtractAudio|ffmpeg)\]\s+(?:Destination:|Merging formats into)\s+["']?(.+?)["']?$/im);
    if (destMatch) {
      j.filePath = destMatch[1].trim();
      j.filename = path.basename(j.filePath);
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    lastStderr = text;
    console.log(`[Job ${jobId} stderr]:`, text.trim());
  });

  return { child, getLastStderr: () => lastStderr };
}

// Download direct media files (GIFs, WebM, MP4, MP3, etc.) using streaming HTTP
async function downloadDirectFile(jobId, downloadUrl, destPath, job, convertToAudio = false) {
  try {
    console.log(`[Job ${jobId}] Direct streaming download from: ${downloadUrl}`);
    const res = await fetch(downloadUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Referer': downloadUrl
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }

    const totalBytes = parseInt(res.headers.get('content-length') || '0', 10);
    const fileStream = fs.createWriteStream(destPath);
    let downloadedBytes = 0;
    let lastTime = Date.now();
    let lastDownloaded = 0;

    job.status = 'downloading';

    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      fileStream.write(Buffer.from(value));
      downloadedBytes += value.length;

      const now = Date.now();
      if (now - lastTime >= 350) {
        const timeDiffSec = (now - lastTime) / 1000;
        const bytesDiff = downloadedBytes - lastDownloaded;
        const speedBytes = timeDiffSec > 0 ? bytesDiff / timeDiffSec : 0;
        const speedStr = (speedBytes / (1024 * 1024)).toFixed(2) + ' MiB/s';

        if (totalBytes > 0) {
          const percent = (downloadedBytes / totalBytes) * 100;
          job.progress = Math.min(99, Math.round(percent * 10) / 10);
          job.fileSize = (totalBytes / (1024 * 1024)).toFixed(2) + ' MiB';
          const remainingSec = speedBytes > 0 ? Math.round((totalBytes - downloadedBytes) / speedBytes) : 0;
          const mins = Math.floor(remainingSec / 60);
          const secs = remainingSec % 60;
          job.eta = `${mins}:${secs.toString().padStart(2, '0')}`;
        } else {
          job.fileSize = (downloadedBytes / (1024 * 1024)).toFixed(2) + ' MiB';
          job.progress = 50;
        }
        job.speed = speedStr;
        lastTime = now;
        lastDownloaded = downloadedBytes;
      }
    }

    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
      fileStream.end();
    });

    if (convertToAudio && hasFfmpeg) {
      const audioDest = destPath.replace(/\.[^.]+$/, '.mp3');
      job.speed = 'Converting to MP3...';
      const ffmpegExe = path.join(ffmpegDir, 'ffmpeg.exe');
      await new Promise((resolve) => {
        const proc = spawn(ffmpegExe, ['-i', destPath, '-vn', '-ab', '192k', '-ar', '44100', '-y', audioDest]);
        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(audioDest)) {
            try { fs.unlinkSync(destPath); } catch (_) {}
            job.filePath = audioDest;
            job.filename = path.basename(audioDest);
          } else {
            job.filePath = destPath;
            job.filename = path.basename(destPath);
          }
          resolve();
        });
        proc.on('error', () => {
          job.filePath = destPath;
          job.filename = path.basename(destPath);
          resolve();
        });
      });
    } else {
      job.filePath = destPath;
      job.filename = path.basename(destPath);
    }

    job.status = 'ready';
    job.progress = 100;
    console.log(`[Job ${jobId}] ✅ Direct download completed:`, job.filename);
  } catch (err) {
    console.error(`[Job ${jobId}] Direct download error:`, err);
    job.status = 'error';
    job.error = err.message || 'Direct download failed.';
  }
}

// Start a background download task with automatic retry on failure
app.post('/api/download/start', async (req, res) => {
  const { url, formatId, type, quality, title, requiresImpersonate, usedLegacySSL, directUrl, isDirectDownload } = req.body;

  if (!url && !directUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Resolve and canonicalize URL
  const { finalUrl } = await resolveUrl(url || directUrl);
  let targetUrl = finalUrl || url || directUrl;

  const isVk = /vk\.com|vkvideo\.ru/i.test(targetUrl);
  if (isVk) {
    targetUrl = normalizeVkUrl(targetUrl);
  }

  const jobId = Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);

  if (directUrl && (directUrl.includes('.m3u8') || directUrl.includes('.mpd'))) {
    targetUrl = directUrl;
  }

  // Check if direct media file download (single binary asset like gif, jpg, mp3, mp4)
  const isDirect = (isDirectDownload || (formatId && formatId.startsWith('direct')) || /\.(gif|webp|png|jpe?g|mp4|webm|mp3)(\?.*)?$/i.test(targetUrl)) && !targetUrl.includes('.m3u8') && !targetUrl.includes('.mpd');

  if (isDirect) {
    const downloadMediaUrl = directUrl || targetUrl;
    let ext = 'mp4';
    try {
      const urlObj = new URL(downloadMediaUrl);
      const matchExt = urlObj.pathname.match(/\.([a-zA-Z0-9]+)$/);
      if (matchExt) ext = matchExt[1].toLowerCase();
    } catch (_) {}
    if (type === 'audio') ext = 'mp3';

    const safeTitle = (title || 'media').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const destPath = path.join(DOWNLOADS_DIR, `${jobId}_${safeTitle}.${ext}`);

    const job = {
      id: jobId,
      status: 'starting',
      progress: 0,
      speed: '0 KiB/s',
      eta: '--:--',
      fileSize: '--',
      filename: null,
      filePath: null,
      error: null,
      startTime: Date.now()
    };
    downloadJobs.set(jobId, job);

    downloadDirectFile(jobId, downloadMediaUrl, destPath, job, type === 'audio');

    return res.json({
      jobId,
      status: 'queued',
      message: 'Direct media download initiated'
    });
  }

  const outTemplate = path.join(DOWNLOADS_DIR, `${jobId}_%(title)s.%(ext)s`);
  const formatArgs = buildFormatArgs({ formatId, type, quality, isVk });

  // Build high-speed strategies list using getDownloadArgs
  const strategies = [];

  if (isVk) {
    strategies.push({ label: 'vk-direct-best', args: [...getDownloadArgs(false, false), ...formatArgs] });
    strategies.push({ label: 'vk-impersonate-chosen', args: [...getDownloadArgs(true, false), ...formatArgs] });
    strategies.push({ label: 'vk-direct-best-fallback', args: [...getDownloadArgs(false, false), '-f', 'best/b/bestvideo+bestaudio', '--merge-output-format', 'mp4'] });
  } else if (usedLegacySSL) {
    strategies.push({ label: 'legacy-ssl', args: [...getDownloadArgs(false, true), ...formatArgs] });
    strategies.push({ label: 'standard', args: [...getDownloadArgs(false, false), ...formatArgs] });
    strategies.push({ label: 'impersonate', args: [...getDownloadArgs(true, false), ...formatArgs] });
  } else if (requiresImpersonate !== false) {
    strategies.push({ label: 'impersonate', args: [...getDownloadArgs(true, false), ...formatArgs] });
    strategies.push({ label: 'legacy-ssl', args: [...getDownloadArgs(false, true), ...formatArgs] });
    strategies.push({ label: 'standard', args: [...getDownloadArgs(false, false), ...formatArgs] });
  } else {
    strategies.push({ label: 'standard', args: [...getDownloadArgs(false, false), ...formatArgs] });
    strategies.push({ label: 'impersonate', args: [...getDownloadArgs(true, false), ...formatArgs] });
    strategies.push({ label: 'legacy-ssl', args: [...getDownloadArgs(false, true), ...formatArgs] });
  }

  downloadJobs.set(jobId, {
    id: jobId,
    status: 'starting',
    progress: 0,
    speed: '0 KiB/s',
    eta: '--:--',
    fileSize: '--',
    filename: null,
    filePath: null,
    error: null,
    startTime: Date.now()
  });

  // Try each strategy sequentially with auto-backoff
  function tryStrategy(index) {
    if (index >= strategies.length) {
      const job = downloadJobs.get(jobId);
      if (job) {
        job.status = 'error';
        job.error = job.error || 'All download strategies failed. The site may be blocking automated downloads.';
      }
      return;
    }

    const strategy = strategies[index];
    console.log(`[Job ${jobId}] Trying strategy: ${strategy.label} (attempt ${index + 1}/${strategies.length})`);

    const { child, getLastStderr } = spawnDownload(jobId, strategy.args, targetUrl, outTemplate);
    if (!child) return;

    child.on('close', (code) => {
      const job = downloadJobs.get(jobId);
      if (!job) return;

      if (code === 0) {
        try {
          const files = fs.readdirSync(DOWNLOADS_DIR);
          const matched = files.find(f => f.startsWith(jobId));
          if (matched) {
            job.filePath = path.join(DOWNLOADS_DIR, matched);
            job.filename = matched.replace(`${jobId}_`, '');
            job.status = 'ready';
            job.progress = 100;
            console.log(`[Job ${jobId}] ✅ Completed with strategy: ${strategy.label}`);
            return;
          }
        } catch (err) {
          console.error('File match error:', err);
        }
        job.status = 'ready';
        job.progress = 100;
      } else {
        const stderr = getLastStderr();
        console.log(`[Job ${jobId}] ❌ Strategy "${strategy.label}" failed: ${stderr.trim()}`);

        try {
          const files = fs.readdirSync(DOWNLOADS_DIR);
          files.filter(f => f.startsWith(jobId)).forEach(f => {
            try { fs.unlinkSync(path.join(DOWNLOADS_DIR, f)); } catch (_) {}
          });
        } catch (_) {}

        if (index + 1 < strategies.length) {
          job.error = null;
          job.status = 'starting';
          job.speed = 'Retrying with alternative engine...';
          setTimeout(() => tryStrategy(index + 1), 1000);
        } else {
          job.status = 'error';
          job.error = stderr || 'The download could not be completed for this format.';
        }
      }
    });
  }

  tryStrategy(0);

  res.json({
    jobId,
    status: 'queued',
    message: 'Download job initiated'
  });
});

// Check download job status
app.get('/api/download/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = downloadJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job expired or not found.' });
  }

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    speed: job.speed,
    eta: job.eta,
    fileSize: job.fileSize,
    filename: job.filename,
    error: job.error,
    downloadUrl: job.status === 'ready' ? `/api/download/file/${job.id}` : null
  });
});

// Serve the finished single file
app.get('/api/download/file/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = downloadJobs.get(jobId);

  if (!job || !job.filePath || !fs.existsSync(job.filePath)) {
    try {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      const matched = files.find(f => f.startsWith(jobId));
      if (matched) {
        const targetPath = path.join(DOWNLOADS_DIR, matched);
        const displayName = matched.replace(`${jobId}_`, '');
        return res.download(targetPath, displayName);
      }
    } catch (e) {}
    return res.status(404).json({ error: 'File is not ready or has already been downloaded.' });
  }

  const downloadName = job.filename || path.basename(job.filePath);
  res.download(job.filePath, downloadName, (err) => {
    if (!err) {
      setTimeout(() => {
        try {
          if (fs.existsSync(job.filePath)) {
            fs.unlinkSync(job.filePath);
          }
          downloadJobs.delete(jobId);
        } catch (e) {}
      }, 60 * 1000);
    }
  });
});

// =========================================================
// 4. MULTI-THREADED PLAYLIST BATCH PROCESSOR
// =========================================================
const batchJobs = new Map();

// Helper to trigger worker slots
function processBatchQueue(batchId) {
  const batch = batchJobs.get(batchId);
  if (!batch || batch.status === 'ready' || batch.status === 'cancelled') return;

  const MAX_CONCURRENT = 4;
  const activeItems = batch.items.filter(it => it.status === 'downloading');
  if (activeItems.length >= MAX_CONCURRENT) return;

  const availableSlots = MAX_CONCURRENT - activeItems.length;
  const queuedItems = batch.items.filter(it => it.status === 'queued').slice(0, availableSlots);

  if (queuedItems.length === 0 && activeItems.length === 0) {
    // All items processed! Finalize batch packaging.
    finalizeBatch(batchId);
    return;
  }

  for (const item of queuedItems) {
    downloadBatchItem(batchId, item);
  }
}

// Download individual item within a batch
function downloadBatchItem(batchId, item) {
  const batch = batchJobs.get(batchId);
  if (!batch) return;

  item.status = 'downloading';
  item.progress = 0;
  item.speed = 'Connecting...';
  item.error = null;

  const cleanUrl = cleanMediaUrl(item.url);
  const isVk = /vk\.com|vkvideo\.ru/i.test(cleanUrl);
  const targetUrl = isVk ? normalizeVkUrl(cleanUrl) : cleanUrl;
  const decodedTitle = unescapeHtml(item.title);
  item.title = decodedTitle;
  const safeItemTitle = (decodedTitle || `video_${item.index}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const itemFilePrefix = `${batchId}_item_${item.index}_${safeItemTitle}`;
  const outTemplate = path.join(DOWNLOADS_DIR, `${itemFilePrefix}.%(ext)s`);

  const formatArgs = buildFormatArgs({
    formatId: batch.quality || 'best',
    type: batch.format || 'video',
    quality: batch.quality || 'best',
    isVk: isVk
  });

  let appliedFormatArgs = formatArgs;
  if (item.retryCount > 0) {
    appliedFormatArgs = ['-f', 'best/b/bestvideo+bestaudio', '--merge-output-format', 'mp4'];
  }

  const downloadArgs = [
    ...getDownloadArgs(item.retryCount > 0, false),
    ...appliedFormatArgs,
    '--newline',
    '-o', outTemplate,
    targetUrl
  ];

  console.log(`[Batch ${batchId}] Spawning item #${item.index} (${item.title}):`, downloadArgs.join(' '));

  const child = spawn(ytDlpPath, downloadArgs);
  let lastStderr = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const progressMatch = text.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/i);
    if (progressMatch) {
      item.progress = parseFloat(progressMatch[1]);
      item.fileSize = progressMatch[2];
      item.speed = progressMatch[3];
      item.eta = progressMatch[4];
    } else {
      const simplePercent = text.match(/\[download\]\s+([\d.]+)%/i);
      if (simplePercent) {
        item.progress = parseFloat(simplePercent[1]);
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    lastStderr = chunk.toString();
  });

  child.on('close', (code) => {
    const currentBatch = batchJobs.get(batchId);
    if (!currentBatch) return;

    if (code === 0) {
      try {
        const files = fs.readdirSync(DOWNLOADS_DIR);
        const matched = files.find(f => f.startsWith(itemFilePrefix));
        if (matched) {
          item.filePath = path.join(DOWNLOADS_DIR, matched);
          item.filename = matched.replace(`${batchId}_item_${item.index}_`, `${String(item.index).padStart(2, '0')}_`);
          item.status = 'complete';
          item.progress = 100;
          item.speed = 'Complete';
          console.log(`[Batch ${batchId}] ✅ Item #${item.index} finished: ${item.filename}`);
        } else {
          item.status = 'complete';
          item.progress = 100;
        }
      } catch (err) {
        item.status = 'complete';
        item.progress = 100;
      }
    } else {
      console.log(`[Batch ${batchId}] ❌ Item #${item.index} failed (retry ${item.retryCount}/2):`, lastStderr.trim());
      if (item.retryCount < 2) {
        item.retryCount++;
        item.status = 'retrying';
        item.speed = `Auto-retrying (${item.retryCount}/2)...`;
        setTimeout(() => {
          if (batchJobs.has(batchId)) {
            item.status = 'queued';
            processBatchQueue(batchId);
          }
        }, 1500 * item.retryCount);
        return;
      } else {
        item.status = 'failed';
        item.error = lastStderr || 'Download failed after retries.';
        item.speed = 'Failed';
      }
    }

    // Process remaining slots in queue
    processBatchQueue(batchId);
  });
}

// Finalize batch and package successful files into ZIP
async function finalizeBatch(batchId) {
  const batch = batchJobs.get(batchId);
  if (!batch || batch.status === 'ready' || batch.isPackaging) return;

  const completed = batch.items.filter(it => it.status === 'complete' && it.filePath && fs.existsSync(it.filePath));
  console.log(`[Batch ${batchId}] Finalizing batch. Completed: ${completed.length}/${batch.items.length}`);

  if (completed.length === 0) {
    batch.status = 'failed';
    batch.error = 'All selected videos failed to download. Check network or site restrictions.';
    return;
  }

  batch.isPackaging = true;
  batch.status = 'packaging';

  const safeTitle = (batch.title || 'GrabNow_Playlist').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const zipFilename = `${safeTitle}_Playlist_${Date.now()}.zip`;
  const zipPath = path.join(DOWNLOADS_DIR, zipFilename);

  const output = fs.createWriteStream(zipPath);
  let archive;
  try {
    archive = createZipArchive({ zlib: { level: 5 } });
  } catch (err) {
    batch.status = 'error';
    batch.error = 'Failed to initialize ZIP packager: ' + err.message;
    return;
  }

  archive.pipe(output);

  for (const item of completed) {
    const entryName = item.filename || path.basename(item.filePath);
    archive.file(item.filePath, { name: entryName });
  }

  output.on('close', () => {
    batch.zipPath = zipPath;
    batch.zipFilename = zipFilename;
    batch.zipReady = true;
    batch.status = 'ready';
    batch.isPackaging = false;
    console.log(`[Batch ${batchId}] 🎉 Playlist ZIP Package ready: ${zipFilename}`);
  });

  archive.on('error', (err) => {
    console.error(`[Batch ${batchId}] Archiver error:`, err);
    batch.status = 'error';
    batch.error = err.message;
    batch.isPackaging = false;
  });

  await archive.finalize();
}

// Start a multi-threaded playlist batch download
app.post('/api/download/playlist-batch', async (req, res) => {
  const { playlistTitle, items, format, quality } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items provided for playlist batch download.' });
  }

  const batchId = 'batch_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);

  const batchItems = items.map((it, idx) => ({
    id: it.id || `item_${idx + 1}`,
    index: it.index || idx + 1,
    title: it.title || `Video ${idx + 1}`,
    url: it.url,
    status: 'queued', // queued | downloading | retrying | complete | failed
    progress: 0,
    speed: '--',
    eta: '--:--',
    fileSize: '--',
    filePath: null,
    filename: null,
    error: null,
    retryCount: 0
  }));

  const batch = {
    id: batchId,
    title: playlistTitle || 'Media Playlist',
    format: format || 'video',
    quality: quality || 'best',
    items: batchItems,
    total: batchItems.length,
    status: 'processing', // processing | packaging | ready | failed
    isPackaging: false,
    zipReady: false,
    zipPath: null,
    zipFilename: null,
    error: null,
    startTime: Date.now()
  };

  batchJobs.set(batchId, batch);
  console.log(`[Batch ${batchId}] Started batch for "${batch.title}" with ${batch.total} items (concurrency: 3)`);

  // Start processing queue
  processBatchQueue(batchId);

  res.json({
    batchId,
    total: batch.total,
    status: 'processing',
    message: `Batch download started for ${batch.total} items.`
  });
});

// Get real-time status of batch and each individual item
app.get('/api/download/batch-status/:batchId', (req, res) => {
  const { batchId } = req.params;
  const batch = batchJobs.get(batchId);

  if (!batch) {
    return res.status(404).json({ error: 'Batch job not found or expired.' });
  }

  const completedCount = batch.items.filter(it => it.status === 'complete').length;
  const failedCount = batch.items.filter(it => it.status === 'failed').length;
  const downloadingCount = batch.items.filter(it => it.status === 'downloading' || it.status === 'retrying').length;
  const queuedCount = batch.items.filter(it => it.status === 'queued').length;

  const totalProgress = batch.items.reduce((acc, it) => acc + (it.progress || 0), 0) / batch.total;

  res.json({
    batchId: batch.id,
    title: batch.title,
    status: batch.status,
    total: batch.total,
    completedCount,
    failedCount,
    downloadingCount,
    queuedCount,
    progress: Math.round(totalProgress * 10) / 10,
    zipReady: batch.zipReady,
    zipDownloadUrl: batch.zipReady ? `/api/download/batch-file/${batch.id}` : null,
    error: batch.error,
    items: batch.items.map(it => ({
      id: it.id,
      index: it.index,
      title: it.title,
      status: it.status,
      progress: it.progress,
      speed: it.speed,
      eta: it.eta,
      fileSize: it.fileSize,
      error: it.error,
      downloadUrl: it.status === 'complete' && it.filePath && fs.existsSync(it.filePath) ? `/api/download/batch-item/${batch.id}/${it.id}` : null,
      filename: it.filename
    }))
  });
});

// Download an individual completed video file directly to device
app.get('/api/download/batch-item/:batchId/:itemId', (req, res) => {
  const { batchId, itemId } = req.params;
  const batch = batchJobs.get(batchId);

  if (!batch) {
    return res.status(404).json({ error: 'Batch job not found or expired.' });
  }

  const item = batch.items.find(it => String(it.id) === String(itemId) || String(it.index) === String(itemId));
  if (!item || !item.filePath || !fs.existsSync(item.filePath)) {
    return res.status(404).json({ error: 'Item file is not ready or has expired.' });
  }

  const filename = item.filename || path.basename(item.filePath);
  res.download(item.filePath, filename);
});

// Package whatever items have finished so far into ZIP on-demand
app.post('/api/download/batch-package-now/:batchId', async (req, res) => {
  const { batchId } = req.params;
  const batch = batchJobs.get(batchId);

  if (!batch) {
    return res.status(404).json({ error: 'Batch job not found.' });
  }

  const completed = batch.items.filter(it => it.status === 'complete' && it.filePath && fs.existsSync(it.filePath));
  if (completed.length === 0) {
    return res.status(400).json({ error: 'No videos have finished downloading yet.' });
  }

  try {
    await finalizeBatch(batchId);
    res.json({ success: true, message: `Packaging ${completed.length} completed videos now.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download finished playlist ZIP file
app.get('/api/download/batch-file/:batchId', (req, res) => {
  const { batchId } = req.params;
  const batch = batchJobs.get(batchId);

  if (!batch || !batch.zipPath || !fs.existsSync(batch.zipPath)) {
    return res.status(404).json({ error: 'Batch archive is not ready or has expired.' });
  }

  const filename = batch.zipFilename || 'Playlist_Collection.zip';
  res.download(batch.zipPath, filename);
});

// Manually retry a specific failed item in the batch
app.post('/api/download/batch-retry/:batchId/:itemId', (req, res) => {
  const { batchId, itemId } = req.params;
  const batch = batchJobs.get(batchId);

  if (!batch) {
    return res.status(404).json({ error: 'Batch not found.' });
  }

  const item = batch.items.find(it => String(it.id) === String(itemId) || String(it.index) === String(itemId));
  if (!item) {
    return res.status(404).json({ error: 'Item not found in batch.' });
  }

  item.status = 'queued';
  item.retryCount = 0;
  item.error = null;
  item.progress = 0;
  item.speed = 'Queued for retry...';

  if (batch.status === 'ready' || batch.status === 'failed') {
    batch.status = 'processing';
    batch.zipReady = false;
  }

  processBatchQueue(batchId);

  res.json({ success: true, message: `Item #${item.index} queued for retry.` });
});

// Only start listening when running standalone directly (node server.js)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`🚀 GrabNow Advanced Engine running on http://localhost:${PORT}`);
    console.log(`⚡ Powered by yt-dlp, gallery-dl & FFmpeg`);
    console.log(`===========================================`);
  });
}

// Export for Vercel serverless functions
module.exports = app;

