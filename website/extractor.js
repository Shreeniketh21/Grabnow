const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Discovered paths
const defaultYtDlp = 'C:\\Users\\G Shreeniketh\\AppData\\Local\\Programs\\Python\\Python313\\Scripts\\yt-dlp.exe';
const ytDlpPath = fs.existsSync(defaultYtDlp) ? defaultYtDlp : 'yt-dlp';
const defaultGalleryDl = 'C:\\Users\\G Shreeniketh\\AppData\\Local\\Programs\\Python\\Python313\\Scripts\\gallery-dl.exe';
const galleryDlPath = fs.existsSync(defaultGalleryDl) ? defaultGalleryDl : 'gallery-dl';
const pythonBin = 'C:\\Users\\G Shreeniketh\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
const igExtractorScript = path.join(__dirname, 'instagram_extractor.py');
const redditExtractorScript = path.join(__dirname, 'reddit_extractor.py');
const nodeBin = 'C:\\Program Files\\nodejs\\node.exe';
const ffmpegDir = 'C:\\Users\\G Shreeniketh\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin';
const hasFfmpeg = fs.existsSync(path.join(ffmpegDir, 'ffmpeg.exe'));

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// In-Memory Media & Playlist Cache (15-minute TTL)
const mediaCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

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

function getCachedMedia(url) {
  const cached = mediaCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  if (cached) mediaCache.delete(url);
  return null;
}

function setCachedMedia(url, data) {
  if (mediaCache.size > 100) {
    const oldestKey = mediaCache.keys().next().value;
    mediaCache.delete(oldestKey);
  }
  mediaCache.set(url, { data, timestamp: Date.now() });
}

// Common arguments for yt-dlp metadata extraction
function getCommonArgs(impersonate = true, legacySSL = false, allowPlaylist = false) {
  const args = [
    '--no-warnings',
    '--no-part',
    '--ignore-errors'
  ];
  if (!allowPlaylist) {
    args.push('--no-playlist');
  }
  if (legacySSL) {
    args.push('--legacy-server-connect');
  }
  if (impersonate && !legacySSL) {
    args.push('--impersonate', 'chrome');
  } else {
    args.push('--user-agent', BROWSER_USER_AGENT);
  }
  if (hasFfmpeg) {
    args.push('--ffmpeg-location', ffmpegDir);
  }
  const userCookiePath = path.join(__dirname, 'user_cookies.txt');
  if (fs.existsSync(userCookiePath)) {
    args.push('--cookies', userCookiePath);
  }
  return args;
}

// High-speed, multi-threaded download arguments
function getDownloadArgs(impersonate = false, legacySSL = false) {
  const args = [
    '--no-warnings',
    '--no-part',
    '--windows-filenames',
    '--no-mtime',
    '--concurrent-fragments', '4',
    '--buffer-size', '16M'
  ];
  if (legacySSL) {
    args.push('--legacy-server-connect');
  }
  if (impersonate && !legacySSL) {
    args.push('--impersonate', 'chrome');
  } else {
    args.push('--user-agent', BROWSER_USER_AGENT);
  }
  if (hasFfmpeg) {
    args.push('--ffmpeg-location', ffmpegDir);
  }
  const userCookiePath = path.join(__dirname, 'user_cookies.txt');
  if (fs.existsSync(userCookiePath)) {
    args.push('--cookies', userCookiePath);
  }
  return args;
}

// Normalize VKontakte URLs to bypass connection resets and uncanonical routes
function normalizeVkUrl(rawUrl) {
  let u = rawUrl.trim();

  // Handle VK Playlist / Album formats -> standardize to https://vkvideo.ru/playlist/ID_ALBUM
  // yt-dlp has dedicated vk:uservideos extractor for vkvideo.ru/playlist/...
  const playlistMatch = u.match(/(?:vkvideo\.ru|vk\.com)\/(?:video\/)?playlist\/(-?\d+)_(\d+)(?:\/.*)?/i);
  if (playlistMatch) {
    return `https://vkvideo.ru/playlist/${playlistMatch[1]}_${playlistMatch[2]}`;
  }

  const albumSectionMatch = u.match(/(?:vkvideo\.ru|vk\.com)\/videos(-?\d+)\?.*section=album_(\d+)/i);
  if (albumSectionMatch) {
    return `https://vkvideo.ru/playlist/${albumSectionMatch[1]}_${albumSectionMatch[2]}`;
  }

  // vk.com/clip-XXXX -> vk.com/video-XXXX
  const clipMatch = u.match(/(?:vkvideo\.ru|vk\.com)\/clip(-?\d+_\d+)/i);
  if (clipMatch) {
    return `https://vk.com/video${clipMatch[1]}`;
  }

  // Single video on vkvideo.ru -> vk.com/video-XXXX (vk.com/video works best with yt-dlp)
  const videoMatch = u.match(/(?:vkvideo\.ru|vk\.com)\/video(-?\d+_\d+)/i);
  if (videoMatch) {
    return `https://vk.com/video${videoMatch[1]}`;
  }

  return u;
}

const { crawlBulkMedia } = require('./bulk_crawler');

// Check if URL points to a playlist / collection / profile feed / search page
function isPlaylistUrl(url) {
  const lower = url.toLowerCase();
  return (
    lower.includes('playlist?list=') ||
    (lower.includes('&list=') && !lower.includes('watch?v=')) ||
    lower.includes('/playlist/') ||
    lower.includes('/playlist') ||
    lower.includes('section=album') ||
    lower.includes('/albums/') ||
    lower.includes('/sets/') ||
    lower.includes('/album/') ||
    lower.includes('/series/') ||
    lower.includes('/r/') ||
    lower.includes('/user/') ||
    lower.includes('/ifs/') ||
    lower.includes('/browse') ||
    lower.includes('/explore/') ||
    lower.includes('/search') ||
    /@[\w.-]+\/videos/i.test(lower) ||
    /youtube\.com\/channel\/[\w-]+\/videos/i.test(lower)
  );
}

// Unshorten / resolve redirects to get true destination URL
async function resolveUrl(inputUrl) {
  let cleanUrl = inputUrl.trim();

  // Unwrap reddit.com/media?url=... or google.com/url?q=... wrappers
  if (cleanUrl.includes('reddit.com/media') && cleanUrl.includes('url=')) {
    const match = cleanUrl.match(/[?&]url=([^&]+)/);
    if (match) {
      try { cleanUrl = decodeURIComponent(match[1]); } catch (e) {}
    }
  } else if (cleanUrl.includes('google.com/url') && cleanUrl.includes('url=')) {
    const match = cleanUrl.match(/[?&]url=([^&]+)/);
    if (match) {
      try { cleanUrl = decodeURIComponent(match[1]); } catch (e) {}
    }
  }

  // Check for VK URLs: directly normalize and bypass Node fetch (Node fetch fails TLS handshake on VK)
  if (/vk\.com|vkvideo\.ru/i.test(cleanUrl)) {
    const normalized = normalizeVkUrl(cleanUrl);
    return {
      finalUrl: normalized,
      status: 200,
      ok: true,
      isDirectMedia: false,
      isVk: true
    };
  }

  // Direct media URLs (mp4, webm, mp3, direct reddit preview, gif, webp, images)
  const isDirectMedia = /\.(mp4|webm|mkv|mov|mp3|m4a|wav|aac|gif|webp|png|jpe?g)(\?.*)?$/i.test(cleanUrl) ||
                        /preview\.redd\.it\/.+\bformat=mp4\b/i.test(cleanUrl) ||
                        /v\.redd\.it\/[a-zA-Z0-9]+/i.test(cleanUrl) ||
                        /i\.redd\.it\/[a-zA-Z0-9]+\.[a-zA-Z0-9]+/i.test(cleanUrl);

  if (isDirectMedia) {
    return {
      finalUrl: cleanUrl,
      status: 200,
      ok: true,
      isDirectMedia: true
    };
  }

  try {
    const res = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow'
    });
    return {
      finalUrl: res.url || cleanUrl,
      status: res.status,
      ok: res.ok,
      isDirectMedia: false
    };
  } catch (err) {
    return {
      finalUrl: cleanUrl,
      status: 0,
      ok: false,
      isDirectMedia: false,
      networkError: err.message
    };
  }
}

// Format duration helper
function formatDuration(sec) {
  if (!sec || isNaN(sec)) return 'Live';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Execute yt-dlp helper wrapped in promise with fast timeout
function runYtDlp(args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    execFile(ytDlpPath, args, { maxBuffer: 1024 * 1024 * 50, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (stdout && stdout.trim()) {
        try {
          const data = JSON.parse(stdout.trim());
          if (data && (data._type || data.formats || (data.entries && data.entries.length > 0) || data.id)) {
            return resolve(data);
          }
        } catch (err) {
          // If stdout had multiple JSON lines or leading warning, try finding the last JSON object
          try {
            const firstBrace = stdout.indexOf('{');
            const lastBrace = stdout.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const data = JSON.parse(stdout.slice(firstBrace, lastBrace + 1));
              if (data && (data._type || data.formats || (data.entries && data.entries.length > 0) || data.id)) {
                return resolve(data);
              }
            }
          } catch (innerErr) {}
        }
      }
      if (error) {
        return reject({ error, stderr: stderr ? stderr.trim() : error.message });
      }
      reject({ error: new Error('Empty response from extractor'), stderr: 'Empty response from yt-dlp' });
    });
  });
}

// Execute gallery-dl helper for image galleries and photo carousels (with strict timeout and zero retries)
function runGalleryDl(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!fs.existsSync(galleryDlPath)) return resolve(null);
    execFile(galleryDlPath, ['-j', '-R', '0', '--http-timeout', '8', url], { maxBuffer: 1024 * 1024 * 20, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error || !stdout) return resolve(null);
      try {
        const jsonStart = stdout.indexOf('[');
        if (jsonStart === -1) return resolve(null);
        const parsed = JSON.parse(stdout.slice(jsonStart));
        const images = [];
        let meta = {};
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item[0] === 2 && typeof item[1] === 'object') {
              meta = item[1];
            } else if (item[0] === 3 && typeof item[1] === 'string') {
              const imgUrl = item[1];
              const itemMeta = item[2] || {};
              const ext = itemMeta.extension || 'jpg';
              images.push({
                id: `img_${images.length + 1}`,
                url: imgUrl,
                thumbnail: imgUrl,
                resolution: itemMeta.width && itemMeta.height ? `${itemMeta.width}×${itemMeta.height}` : 'High-Res Image',
                ext: ext
              });
            }
          }
        }
        resolve(images.length ? { images, meta } : null);
      } catch (err) {
        resolve(null);
      }
    });
  });
}

// Instagram Photo / Carousel / Reel Extractor using dedicated Python Engine
function extractInstagramMedia(url) {
  return new Promise((resolve) => {
    if (!fs.existsSync(pythonBin) || !fs.existsSync(igExtractorScript)) {
      return resolve(null);
    }
    execFile(pythonBin, [igExtractorScript, url], { maxBuffer: 1024 * 1024 * 30 }, (error, stdout, stderr) => {
      if (error || !stdout) {
        if (stderr) console.log('[Instagram Extractor stderr]:', stderr);
        return resolve(null);
      }
      try {
        const data = JSON.parse(stdout.trim());
        if (data && !data.error && data.type) {
          return resolve(data);
        }
        resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  });
}

// Reddit Dedicated Extractor using Python Engine
function extractRedditMedia(url) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(pythonBin) || !fs.existsSync(redditExtractorScript)) {
      return resolve(null);
    }
    execFile(pythonBin, [redditExtractorScript, url], { maxBuffer: 1024 * 1024 * 30, timeout: 12000 }, (error, stdout, stderr) => {
      if (error || !stdout) {
        if (stderr) console.log('[Reddit Extractor stderr]:', stderr);
        return resolve(null);
      }
      try {
        const data = JSON.parse(stdout.trim());
        if (data) {
          if (data.error) {
            return reject(new Error(data.error));
          }
          if (data.type) {
            return resolve(data);
          }
        }
        resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  });
}


// Twitter / X Multi-Photo Extraction using Twitter Syndication API
async function extractTwitterMedia(url) {
  const match = url.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/i);
  if (!match) return null;
  const tweetId = match[2];
  const screenName = match[1];

  try {
    const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=1`;
    const res = await fetch(syndicationUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return null;
    const tweet = await res.json();

    const photos = tweet.photos || (tweet.mediaDetails ? tweet.mediaDetails.filter(m => m.type === 'photo') : []);
    if (!photos || photos.length === 0) return null;

    const items = photos.map((p, idx) => {
      const basePhotoUrl = p.url || p.media_url_https;
      const highResUrl = basePhotoUrl.includes('?') ? basePhotoUrl.replace(/\?.*$/, '?name=orig') : `${basePhotoUrl}?name=orig`;
      const width = p.width || p.original_info?.width;
      const height = p.height || p.original_info?.height;
      return {
        id: `tw_${tweetId}_${idx + 1}`,
        url: highResUrl,
        thumbnail: basePhotoUrl,
        resolution: width && height ? `${width}×${height}` : 'Original Photo',
        ext: 'jpg',
        title: `${tweet.user?.name || screenName} — Photo ${idx + 1}`
      };
    });

    return {
      type: 'carousel',
      id: `tweet_${tweetId}`,
      title: tweet.text ? tweet.text.slice(0, 100) : `X / Twitter post by @${screenName}`,
      uploader: tweet.user?.name ? `${tweet.user.name} (@${tweet.user.screen_name || screenName})` : `@${screenName}`,
      thumbnail: items[0].thumbnail,
      itemCount: items.length,
      webpage_url: url,
      extractor: 'X / Twitter Gallery',
      items: items
    };
  } catch (err) {
    return null;
  }
}

// Hotstar / JioHotstar Smart Zero-Friction Media Resolver
async function extractHotstarMedia(targetUrl) {
  console.log(`[HotstarResolver] Resolving Hotstar link automatically: ${targetUrl}`);

  let keywords = [];
  try {
    const parsed = new URL(targetUrl);
    const searchParam = parsed.searchParams.get('search_query');
    if (searchParam) {
      keywords.push(...searchParam.toLowerCase().split(/\s+/).filter(w => w.length > 1));
    }
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    for (const p of pathParts) {
      if (p.includes('-') && !/^\d+$/.test(p)) {
        const words = p.replace(/-/g, ' ').toLowerCase().split(' ').filter(w => w.length > 2 && w !== 'video' && w !== 'highlights' && w !== 'watch' && w !== 'short' && w !== 'sports' && w !== 'cricket');
        keywords.push(...words);
      }
    }
  } catch (e) {}

  keywords = [...new Set(keywords)];
  console.log('[HotstarResolver] Extracted keywords:', keywords);

  // Phase 1: Query official open sports networks (IPL / BCCI)
  const sportsSources = [
    { url: 'https://www.iplt20.com/videos', base: 'https://www.iplt20.com' },
    { url: 'https://www.bcci.tv/videos', base: 'https://www.bcci.tv' }
  ];

  for (const src of sportsSources) {
    try {
      const res = await fetch(src.url, { headers: { 'User-Agent': BROWSER_USER_AGENT } });
      if (!res.ok) continue;
      const html = await res.text();

      const videoLinks = html.match(/href=["'](\/videos\/[^"']+)["']/gi) || [];
      const cleanLinks = [...new Set(videoLinks.map(l => l.split('"')[1]))];

      let bestLink = null;
      let bestScore = -1;

      for (const link of cleanLinks) {
        const lowerLink = link.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (lowerLink.includes(kw)) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          bestLink = link;
        }
      }

      if (bestLink) {
        const fullLink = src.base + bestLink;
        console.log(`[HotstarResolver] Found sports match on ${src.base}: ${fullLink}`);
        const result = await deepScrapeMedia(fullLink);
        if (result && result.videoFormats && result.videoFormats.length > 0) {
          result.uploader = 'JioHotstar / Sports Stream';
          result.extractor = 'Hotstar Engine';
          result.webpage_url = targetUrl;
          return result;
        }
      }
    } catch (err) {
      console.log(`[HotstarResolver] Error querying ${src.url}:`, err.message);
    }
  }

  // Phase 2: Open Media Search Resolver (ytsearch1:<keywords>)
  if (keywords.length > 0) {
    const searchQuery = keywords.join(' ');
    console.log(`[HotstarResolver] Phase 2: Resolving via open media search: "${searchQuery}"`);
    try {
      const searchArgs = [...getCommonArgs(true, false, false), '--dump-single-json', `ytsearch1:${searchQuery}`];
      const ytData = await runYtDlp(searchArgs);
      if (ytData) {
        const entry = (ytData.entries && ytData.entries.length > 0) ? ytData.entries[0] : (ytData.id ? ytData : null);
        if (entry && entry.formats && entry.formats.length > 0) {
          const rawFormats = entry.formats;
          const videoFormats = [];
          const seenResolutions = new Set();

          const sortedFormats = rawFormats
            .filter(f => f.vcodec && f.vcodec !== 'none')
            .sort((a, b) => (b.height || 0) - (a.height || 0));

          for (const f of sortedFormats) {
            const height = f.height || 0;
            const resLabel = height ? `${height}p` : f.format_note || 'Video';
            const key = `${resLabel}-${f.ext}`;

            if (!seenResolutions.has(key) && height >= 144) {
              seenResolutions.add(key);
              videoFormats.push({
                formatId: f.format_id,
                resolution: resLabel,
                height: height,
                ext: f.ext === 'mhtml' ? 'mp4' : f.ext,
                filesize: f.filesize || f.filesize_approx || null,
                fps: f.fps || null,
                hasAudio: Boolean(f.acodec && f.acodec !== 'none'),
                vcodec: f.vcodec
              });
            }
          }

          const audioFormats = [];
          const seenAudio = new Set();
          const rawAudio = rawFormats
            .filter(f => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none')
            .sort((a, b) => (b.abr || 0) - (a.abr || 0));

          for (const f of rawAudio) {
            const abr = Math.round(f.abr || 128);
            const label = `${abr} kbps`;
            if (!seenAudio.has(label)) {
              seenAudio.add(label);
              audioFormats.push({
                formatId: f.format_id,
                quality: label,
                abr: abr,
                ext: 'mp3',
                filesize: f.filesize || f.filesize_approx || null
              });
            }
          }

          return {
            type: 'single',
            id: entry.id || 'hotstar_' + Date.now().toString(36),
            title: entry.title || searchQuery.toUpperCase() + ' Highlights',
            thumbnail: entry.thumbnail || (entry.thumbnails && entry.thumbnails.length ? entry.thumbnails[entry.thumbnails.length - 1].url : ''),
            duration: formatDuration(entry.duration),
            durationSeconds: entry.duration || 0,
            uploader: 'Hotstar Engine',
            extractor: 'Hotstar Engine',
            webpage_url: targetUrl,
            directUrl: entry.webpage_url || entry.url || targetUrl,
            videoFormats: videoFormats.slice(0, 8),
            audioFormats: audioFormats.slice(0, 5)
          };
        }
      }
    } catch (searchErr) {
      console.log('[HotstarResolver] Search fallback error:', searchErr.message || searchErr);
    }
  }

  return null;
}

// Deep Universal HTML & JS Stream Extractor (HLS .m3u8, DASH .mpd, MP4)
async function deepScrapeMedia(targetUrl) {
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': targetUrl
      }
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Extract Title
    const titleMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:title|twitter:title)["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? unescapeHtml(titleMatch[1]).replace(/\s*\|\s*.*$/, '').trim() : 'Extracted Media';

    // Extract Thumbnail
    const imageMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:image|twitter:image)["']\s+content=["']([^"']+)["']/i);
    const thumbnail = imageMatch ? imageMatch[1] : '';

    const candidateUrls = new Set();

    // Check og:video
    const ogVideo = html.match(/<meta\s+(?:property|name)=["'](?:og:video|og:video:url|og:video:secure_url|twitter:player:stream)["']\s+content=["']([^"']+)["']/i);
    if (ogVideo) candidateUrls.add(ogVideo[1].replace(/&amp;/g, '&'));

    // Check <video> or <source> src
    const directSrcs = html.match(/<(?:video|source|shreddit-player)[^>]+src=["']([^"']+)["']/gi) || [];
    for (const srcAttr of directSrcs) {
      const match = srcAttr.match(/src=["']([^"']+)["']/i);
      if (match) candidateUrls.add(match[1].replace(/&amp;/g, '&'));
    }

    // Scan for HLS (.m3u8) URLs in scripts & page source
    const m3u8Matches = html.match(/https?:\/\/[^"'\s\\<>]+\.m3u8(?:\?[^"'\s\\<>]*)?/gi) || [];
    for (const u of m3u8Matches) {
      candidateUrls.add(u.replace(/\\/g, '').replace(/&amp;/g, '&'));
    }

    // Scan for MP4 URLs
    const mp4Matches = html.match(/https?:\/\/[^"'\s\\<>]+\.mp4(?:\?[^"'\s\\<>]*)?/gi) || [];
    for (const u of mp4Matches) {
      if (!u.includes('thumb') && !u.includes('logo') && !u.includes('preview')) {
        candidateUrls.add(u.replace(/\\/g, '').replace(/&amp;/g, '&'));
      }
    }

    console.log(`[DeepScraper] Found ${candidateUrls.size} candidate stream URLs for ${targetUrl}`);

    for (const streamUrl of candidateUrls) {
      try {
        console.log(`[DeepScraper] Probing stream: ${streamUrl.slice(0, 90)}...`);
        const streamData = await runYtDlp(['-j', '--no-warnings', streamUrl], 15000);
        if (streamData && streamData.formats && streamData.formats.length > 0) {
          const rawFormats = streamData.formats;
          const videoFormats = [];
          const seenResolutions = new Set();

          const sortedFormats = rawFormats
            .filter(f => f.vcodec && f.vcodec !== 'none')
            .sort((a, b) => (b.height || 0) - (a.height || 0));

          for (const f of sortedFormats) {
            const height = f.height || 0;
            const resLabel = height ? `${height}p` : f.format_note || 'Video';
            const key = `${resLabel}-${f.ext}`;

            if (!seenResolutions.has(key) && height >= 144) {
              seenResolutions.add(key);
              videoFormats.push({
                formatId: f.format_id,
                resolution: resLabel,
                height: height,
                ext: f.ext === 'mhtml' ? 'mp4' : f.ext,
                filesize: f.filesize || f.filesize_approx || null,
                fps: f.fps || null,
                hasAudio: Boolean(f.acodec && f.acodec !== 'none'),
                vcodec: f.vcodec,
                url: f.url || streamUrl
              });
            }
          }

          const audioFormats = [];
          const seenAudio = new Set();
          const rawAudio = rawFormats
            .filter(f => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none')
            .sort((a, b) => (b.abr || 0) - (a.abr || 0));

          for (const f of rawAudio) {
            const abr = Math.round(f.abr || 128);
            const label = `${abr} kbps`;
            if (!seenAudio.has(label)) {
              seenAudio.add(label);
              audioFormats.push({
                formatId: f.format_id,
                quality: label,
                abr: abr,
                ext: 'mp3',
                filesize: f.filesize || f.filesize_approx || null
              });
            }
          }

          return {
            type: 'single',
            id: 'stream_' + Date.now().toString(36),
            title: title || streamData.title || 'Extracted Media Video',
            thumbnail: thumbnail || streamData.thumbnail || '',
            duration: formatDuration(streamData.duration),
            durationSeconds: streamData.duration || 0,
            uploader: new URL(targetUrl).hostname.replace('www.', ''),
            extractor: 'Universal HLS Stream Engine',
            webpage_url: targetUrl,
            directUrl: streamUrl,
            videoFormats: videoFormats.slice(0, 8),
            audioFormats: audioFormats.length ? audioFormats.slice(0, 5) : [
              { quality: 'Original Audio', formatId: 'direct_audio', ext: 'mp3', filesize: null }
            ]
          };
        }
      } catch (e) {}
    }

    return null;
  } catch (err) {
    return null;
  }
}

// Master Media Extractor with robust multi-format support (single, carousel, playlist)
async function extractMediaDetails(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string' || !inputUrl.trim()) {
    throw new Error('Please enter a valid media link.');
  }

  let cleanUrl = inputUrl.trim();

  // URL format verification
  try {
    new URL(cleanUrl);
  } catch (e) {
    throw new Error('Invalid URL format. Please enter a full link starting with http:// or https://');
  }

  // Check in-memory cache first for instant response
  const cached = getCachedMedia(cleanUrl);
  if (cached) {
    console.log(`[Extractor] ⚡ Returning cached media details for: ${cleanUrl}`);
    return cached;
  }

  // Step 1: Follow redirects and canonicalize URLs
  const redirectInfo = await resolveUrl(cleanUrl);
  let targetUrl = redirectInfo.finalUrl;

  // VKontakte Normalization
  const isVk = /vk\.com|vkvideo\.ru/i.test(targetUrl);
  if (isVk) {
    targetUrl = normalizeVkUrl(targetUrl);
  }

  console.log(`[Extractor] Input URL: ${cleanUrl}`);
  console.log(`[Extractor] Resolved to: ${targetUrl} (Status: ${redirectInfo.status})`);

  // Step 2: Direct media file link
  if (redirectInfo.isDirectMedia) {
    const parsedPath = new URL(targetUrl).pathname;
    const filename = path.basename(parsedPath) || 'media_file.mp4';
    const isAudio = /\.(mp3|m4a|wav|aac)/i.test(targetUrl);
    const isImageOrGif = /\.(gif|webp|png|jpe?g)/i.test(targetUrl);
    const detectedExt = (path.extname(parsedPath).replace('.', '').toLowerCase()) || (isAudio ? 'mp3' : 'mp4');

    if (isImageOrGif) {
      return {
        type: 'carousel',
        id: 'direct_img_' + Date.now().toString(36),
        title: filename.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' '),
        uploader: new URL(targetUrl).hostname,
        thumbnail: targetUrl,
        itemCount: 1,
        webpage_url: targetUrl,
        extractor: 'Direct Image',
        items: [
          {
            id: 'item_1',
            url: targetUrl,
            thumbnail: targetUrl,
            resolution: 'Original File',
            ext: detectedExt,
            title: filename
          }
        ]
      };
    }

    return {
      type: 'single',
      id: 'direct_' + Date.now().toString(36),
      title: filename.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' '),
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
      duration: isAudio ? 'Audio Stream' : 'Direct Video',
      durationSeconds: 0,
      uploader: new URL(targetUrl).hostname,
      extractor: 'Direct Media',
      webpage_url: targetUrl,
      directUrl: targetUrl,
      isDirectDownload: true,
      videoFormats: isAudio ? [] : [
        { resolution: 'Original Quality', formatId: 'direct', ext: detectedExt, filesize: null, hasAudio: true }
      ],
      audioFormats: [
        { quality: 'Original Audio', formatId: 'direct_audio', ext: 'mp3', filesize: null }
      ],
      requiresImpersonate: false,
      usedLegacySSL: false
    };
  }

  // Step 3: Twitter / X Photo / Carousel Pre-check
  if (/twitter\.com|x\.com/i.test(targetUrl)) {
    const twitterCarousel = await extractTwitterMedia(targetUrl);
    if (twitterCarousel) {
      console.log(`[Extractor] Extracted Twitter/X Photo Carousel: ${twitterCarousel.items.length} items`);
      return twitterCarousel;
    }
  }

  // Step 3.5: Instagram Photo / Carousel / Reel Pre-check
  if (/instagram\.com/i.test(targetUrl)) {
    console.log(`[Extractor] Extracting Instagram media via Python Engine: ${targetUrl}`);
    const instagramMedia = await extractInstagramMedia(targetUrl);
    if (instagramMedia) {
      console.log(`[Extractor] Extracted Instagram media: ${instagramMedia.type} (${instagramMedia.itemCount || (instagramMedia.videoFormats?.length ? 'video' : 1)} items)`);
      return instagramMedia;
    }
  }

  // Step 3.6: Reddit Dedicated Post & Gallery Extractor
  if (/reddit\.com|redd\.it/i.test(targetUrl)) {
    console.log(`[Extractor] Extracting Reddit media via dedicated Reddit Engine: ${targetUrl}`);
    try {
      const redditMedia = await extractRedditMedia(targetUrl);
      if (redditMedia) {
        console.log(`[Extractor] Extracted Reddit media: ${redditMedia.type} (${redditMedia.itemCount || 1} items)`);
        setCachedMedia(cleanUrl, redditMedia);
        setCachedMedia(targetUrl, redditMedia);
        return redditMedia;
      }
    } catch (redditErr) {
      console.log(`[Extractor] Reddit Engine error:`, redditErr.message);
      throw redditErr;
    }
  }

  // Step 3.7: Hotstar / JioHotstar Smart Zero-Friction Resolver
  if (/hotstar\.com/i.test(targetUrl)) {
    console.log(`[Extractor] Extracting Hotstar media via Zero-Friction Engine: ${targetUrl}`);
    try {
      const hotstarMedia = await extractHotstarMedia(targetUrl);
      if (hotstarMedia) {
        console.log(`[Extractor] Extracted Hotstar media: ${hotstarMedia.title}`);
        setCachedMedia(cleanUrl, hotstarMedia);
        setCachedMedia(targetUrl, hotstarMedia);
        return hotstarMedia;
      }
    } catch (hsErr) {
      console.log(`[Extractor] Hotstar Engine error:`, hsErr.message);
    }
  }

  // Step 4: Playlist / Collection / Bulk Feed Check
  const wantsPlaylist = isPlaylistUrl(targetUrl);
  if (wantsPlaylist) {
    console.log(`[Extractor] Detected Playlist / Bulk Feed URL: ${targetUrl}`);
    try {
      const bulkResult = await crawlBulkMedia(targetUrl);
      if (bulkResult && bulkResult.items && bulkResult.items.length > 0) {
        console.log(`[Extractor] ⚡ Bulk Crawler harvested ${bulkResult.items.length} items for: ${targetUrl}`);
        setCachedMedia(cleanUrl, bulkResult);
        setCachedMedia(targetUrl, bulkResult);
        return bulkResult;
      }
    } catch (bulkErr) {
      console.log('[Extractor] Bulk Crawler attempt failed, attempting yt-dlp playlist fallback...', bulkErr.message);
    }

    try {
      const plArgs = [
        '--no-warnings',
        '--no-part',
        '--ignore-errors',
        '--retries', '3',
        '--impersonate', 'chrome',
        '--dump-single-json',
        '--flat-playlist',
        targetUrl
      ];
      let plData = null;
      try {
        plData = await runYtDlp(plArgs);
      } catch (firstErr) {
        console.log('[Extractor] First playlist attempt failed, retrying once...', firstErr.stderr || firstErr.error);
        await new Promise(r => setTimeout(r, 1000));
        plData = await runYtDlp(plArgs);
      }
      if (plData && (plData._type === 'playlist' || (plData.entries && plData.entries.length > 0))) {
        const rawEntries = (plData.entries || []).filter(Boolean);
        if (rawEntries.length > 0) {
          const items = rawEntries.map((e, idx) => {
            const thumb = (e && e.thumbnails && e.thumbnails.length)
              ? e.thumbnails[e.thumbnails.length - 1].url
              : ((e && e.thumbnail) || (plData.thumbnails && plData.thumbnails.length ? plData.thumbnails[plData.thumbnails.length - 1].url : ''));
            let rawUrl = e.url ? (e.url.startsWith('http') ? e.url : (isVk ? `https://vk.com/video${e.url}` : `https://www.youtube.com/watch?v=${e.url}`)) : (e.id ? (isVk ? `https://vk.com/video${e.id}` : `https://www.youtube.com/watch?v=${e.id}`) : targetUrl);
            const entryUrl = rawUrl.replace(/&amp;/g, '&');
            const itemTitle = unescapeHtml(e.title) || (isVk ? `VK Video #${idx + 1}` : `Item ${idx + 1}`);
            return {
              index: idx + 1,
              id: e.id || `pl_${idx + 1}`,
              title: itemTitle,
              url: entryUrl,
              duration: formatDuration(e.duration),
              durationSeconds: e.duration || 0,
              thumbnail: thumb,
              uploader: unescapeHtml(e.uploader || plData.uploader || plData.channel || (isVk ? 'VKontakte' : 'Creator'))
            };
          });

          const playlistTitle = unescapeHtml(plData.title) || (isVk ? 'VKontakte Playlist' : 'Media Playlist');
          const playlistResult = {
            type: 'playlist',
            id: plData.id || 'playlist_' + Date.now().toString(36),
            title: playlistTitle,
            uploader: plData.uploader || plData.channel || (isVk ? 'VKontakte' : 'Media Collection'),
            thumbnail: items[0]?.thumbnail || '',
            itemCount: items.length,
            webpage_url: targetUrl,
            extractor: isVk ? 'VK Playlist' : (plData.extractor_key || 'Playlist'),
            items: items
          };
          setCachedMedia(cleanUrl, playlistResult);
          setCachedMedia(targetUrl, playlistResult);
          return playlistResult;
        }
      }
    } catch (plErr) {
      console.log('[Extractor] Playlist extraction attempt failed, continuing to single video attempt:', plErr.stderr || plErr.error);
    }
  }

  // Step 5: Primary Video Extraction via yt-dlp
  let ytDlpData = null;
  let lastErrorMsg = '';
  let usedImpersonate = true;

  // VK always requires impersonate chrome (never plain or legacySSL)
  try {
    const args1 = [...getCommonArgs(true, false, false), '--dump-single-json', targetUrl];
    ytDlpData = await runYtDlp(args1);
  } catch (err1) {
    console.log('[Extractor] Impersonate attempt failed:', err1.stderr || err1.error);
    lastErrorMsg = err1.stderr || (err1.error && err1.error.message) || '';
    usedImpersonate = false;
  }

  // Step 5.2: Fallback to standard UA (if not VK and not rate-limited)
  const isRateLimited = /429|Too Many Requests|blocked by network security/i.test(lastErrorMsg);
  if (isRateLimited) {
    throw new Error('This platform is temporarily rate-limiting requests (HTTP 429: Too Many Requests). Please try again in a few minutes, or paste a direct media URL.');
  }

  if (!ytDlpData && !isVk) {
    try {
      const args2 = [...getCommonArgs(false, false, false), '--dump-single-json', targetUrl];
      ytDlpData = await runYtDlp(args2);
    } catch (err2) {
      console.log('[Extractor] Standard user-agent attempt failed:', err2.stderr || err2.error);
      if (!lastErrorMsg) lastErrorMsg = err2.stderr || '';
    }
  }

  // Step 5.3: Legacy SSL fallback (if not VK and not rate-limited)
  let usedLegacySSL = false;
  if (!ytDlpData && !isVk && !isRateLimited) {
    try {
      console.log('[Extractor] Trying legacy-server-connect fallback...');
      const args3 = [...getCommonArgs(false, true, false), '--dump-single-json', targetUrl];
      ytDlpData = await runYtDlp(args3);
      usedLegacySSL = true;
    } catch (err3) {
      console.log('[Extractor] Legacy SSL attempt failed:', err3.stderr || err3.error);
      if (!lastErrorMsg) lastErrorMsg = err3.stderr || '';
    }
  }

  // If yt-dlp extracted playlist entries even though not initially marked as playlist
  if (ytDlpData && (ytDlpData._type === 'playlist' || (ytDlpData.entries && ytDlpData.entries.length > 1))) {
    const rawEntries = (ytDlpData.entries || []).filter(Boolean);
    const items = rawEntries.map((e, idx) => {
      const thumb = (e && e.thumbnails && e.thumbnails.length)
        ? e.thumbnails[e.thumbnails.length - 1].url
        : (e && e.thumbnail ? e.thumbnail : '');
      return {
        index: idx + 1,
        id: (e && e.id) || `entry_${idx + 1}`,
        title: unescapeHtml(e && e.title) || `Video ${idx + 1}`,
        url: e && e.url ? (e.url.startsWith('http') ? e.url.replace(/&amp;/g, '&') : `https://www.youtube.com/watch?v=${e.url}`) : targetUrl,
        duration: formatDuration(e && e.duration),
        durationSeconds: (e && e.duration) || 0,
        thumbnail: thumb,
        uploader: (e && e.uploader) || ytDlpData.uploader || 'Creator'
      };
    });

    return {
      type: 'playlist',
      id: ytDlpData.id || 'playlist_' + Date.now().toString(36),
      title: ytDlpData.title || 'Playlist Collection',
      uploader: ytDlpData.uploader || ytDlpData.channel || 'Media Collection',
      thumbnail: items[0]?.thumbnail || '',
      itemCount: items.length,
      webpage_url: targetUrl,
      extractor: ytDlpData.extractor_key || 'Playlist',
      items: items
    };
  }

  // Step 5.4: Format and return single video from yt-dlp
  if (ytDlpData) {
    const rawFormats = ytDlpData.formats || [];
    const videoFormats = [];
    const seenResolutions = new Set();

    const sortedFormats = rawFormats
      .filter(f => f.vcodec && f.vcodec !== 'none')
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    for (const f of sortedFormats) {
      const height = f.height || 0;
      const resLabel = height ? `${height}p` : f.format_note || 'Video';
      const key = `${resLabel}-${f.ext}`;

      if (!seenResolutions.has(key) && height >= 144) {
        seenResolutions.add(key);
        videoFormats.push({
          formatId: f.format_id,
          resolution: resLabel,
          height: height,
          ext: f.ext === 'mhtml' ? 'mp4' : f.ext,
          filesize: f.filesize || f.filesize_approx || null,
          fps: f.fps || null,
          hasAudio: Boolean(f.acodec && f.acodec !== 'none'),
          vcodec: f.vcodec
        });
      }
    }

    const audioFormats = [];
    const seenAudio = new Set();
    const rawAudio = rawFormats
      .filter(f => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none')
      .sort((a, b) => (b.abr || 0) - (a.abr || 0));

    for (const f of rawAudio) {
      const abr = Math.round(f.abr || 128);
      const label = `${abr} kbps`;
      if (!seenAudio.has(label)) {
        seenAudio.add(label);
        audioFormats.push({
          formatId: f.format_id,
          quality: label,
          abr: abr,
          ext: 'mp3',
          filesize: f.filesize || f.filesize_approx || null
        });
      }
    }

    return {
      type: 'single',
      id: ytDlpData.id || 'media',
      title: ytDlpData.title || 'Untitled Media',
      thumbnail: ytDlpData.thumbnail || (ytDlpData.thumbnails && ytDlpData.thumbnails.length ? ytDlpData.thumbnails[ytDlpData.thumbnails.length - 1].url : ''),
      duration: formatDuration(ytDlpData.duration),
      durationSeconds: ytDlpData.duration || 0,
      uploader: ytDlpData.uploader || ytDlpData.channel || 'Unknown Creator',
      extractor: ytDlpData.extractor_key || ytDlpData.extractor || 'Web',
      webpage_url: ytDlpData.webpage_url || targetUrl,
      videoFormats: videoFormats.slice(0, 8),
      audioFormats: audioFormats.slice(0, 5),
      requiresImpersonate: usedImpersonate,
      usedLegacySSL: usedLegacySSL
    };
  }

  // Step 6: Gallery & Photo Carousel Extraction via gallery-dl
  console.log('[Extractor] Checking for photo carousel/gallery with gallery-dl...');
  const galleryResult = await runGalleryDl(targetUrl);
  if (galleryResult && galleryResult.images.length > 0) {
    const images = galleryResult.images;
    const meta = galleryResult.meta || {};
    const title = meta.content || meta.title || meta.description || 'Photo Gallery';
    const uploader = meta.author?.name || meta.user?.name || meta.author?.nick || new URL(targetUrl).hostname;

    return {
      type: 'carousel',
      id: 'gallery_' + Date.now().toString(36),
      title: title.slice(0, 100),
      uploader: uploader,
      thumbnail: images[0].thumbnail,
      itemCount: images.length,
      webpage_url: targetUrl,
      extractor: meta.category ? meta.category.toUpperCase() : 'Gallery',
      items: images
    };
  }

  // Step 7: Deep Universal HTML & JS Stream Scraper (HLS .m3u8, DASH .mpd, MP4)
  console.log('[Extractor] Attempting deep HTML/JS stream scrape...');
  const scrapedMedia = await deepScrapeMedia(targetUrl);
  if (scrapedMedia) {
    scrapedMedia.requiresImpersonate = false;
    setCachedMedia(cleanUrl, scrapedMedia);
    setCachedMedia(targetUrl, scrapedMedia);
    return scrapedMedia;
  }

  // Step 8: Special handling for VKontakte restricted / 18+ adult content
  if (isVk && (lastErrorMsg.includes('Connection was reset') || lastErrorMsg.includes('10054') || lastErrorMsg.includes('Recv failure') || lastErrorMsg.includes('challenge') || lastErrorMsg.includes('login'))) {
    throw new Error('This VKontakte video or playlist is age-restricted (18+ Adult) or requires an authenticated account login. Public VK videos and playlists can be downloaded directly.');
  }

  // Step 8.5: Special handling for Facebook posts
  if (/facebook\.com|fb\.watch/i.test(targetUrl)) {
    if (targetUrl.includes('/photo') || targetUrl.includes('/photos/') || targetUrl.includes('/posts/')) {
      throw new Error('This Facebook image or post is restricted by Facebook privacy settings or requires a logged-in account. For Facebook, public Reels and Videos are directly downloadable.');
    }
  }

  // Step 8.6: Special handling for Hotstar / JioHotstar
  if (/hotstar\.com/i.test(targetUrl) || lastErrorMsg.includes('registered users') || lastErrorMsg.includes('cookies-from-browser')) {
    throw new Error('Hotstar / JioHotstar requires an account login or guest browser session cookies for this content. Please open the link in your browser or paste your cookies in settings to download.');
  }

  // Step 9: Intelligent, user-friendly error feedback
  if (redirectInfo.status === 404 || lastErrorMsg.includes('404')) {
    throw new Error('This media could not be found (404). It may have been deleted, set to private, or the link has expired.');
  }

  if (redirectInfo.status === 403 || lastErrorMsg.includes('403') || lastErrorMsg.includes('login') || lastErrorMsg.includes('private')) {
    throw new Error('This post requires an account login, age confirmation, or is restricted to private followers.');
  }

  if (lastErrorMsg.includes('Unsupported URL') || lastErrorMsg.includes('no media')) {
    throw new Error('No downloadable video, audio, or photo gallery was found at this link. Please ensure the link leads to a valid post with media.');
  }

  throw new Error(lastErrorMsg || 'Unable to extract media from this link. Please verify that the post contains playable video, audio, or a photo gallery.');
}

module.exports = {
  extractMediaDetails,
  resolveUrl,
  normalizeVkUrl,
  isPlaylistUrl,
  ytDlpPath,
  galleryDlPath,
  nodeBin,
  ffmpegDir,
  hasFfmpeg,
  getCommonArgs,
  getDownloadArgs,
  getCachedMedia,
  setCachedMedia,
  BROWSER_USER_AGENT
};
