const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const pythonBin = 'C:\\Users\\G Shreeniketh\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
const galleryDlPath = 'C:\\Users\\G Shreeniketh\\AppData\\Local\\Programs\\Python\\Python313\\Scripts\\gallery-dl.exe';
const ytDlpPath = 'C:\\Users\\G Shreeniketh\\AppData\\Local\\Programs\\Python\\Python313\\Scripts\\yt-dlp.exe';
const igCrawlerScript = path.join(__dirname, 'instagram_crawler.py');

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

function cleanMediaUrl(raw) {
  if (!raw) return '';
  let u = raw.replace(/\\/g, '').replace(/&amp;/g, '&');
  u = u.split('&quot;')[0].split('&#')[0].split('"')[0].split("'")[0].split('\\')[0].split('`')[0].trim();
  return u;
}

// 1. Reddit Subreddit & User Bulk Harvester (RSS First -> JSON Fallback)
async function crawlRedditBulk(targetUrl, limit = 50) {
  // Primary Strategy: Reddit RSS Feed (Bypasses 403 and login requirements)
  try {
    const cleanBase = targetUrl.split('?')[0].replace(/\/+$/, '');
    const rssUrl = cleanBase + '/.rss';
    console.log(`[BulkCrawler] Fetching Reddit RSS feed: ${rssUrl}`);
    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (res.ok) {
      const xml = await res.text();
      const entries = xml.split('<entry>').slice(1);
      if (entries.length > 0) {
        const items = [];
        let subTitle = 'Reddit Collection';
        const catMatch = xml.match(/<category\s+term="([^"]+)"/i);
        if (catMatch) subTitle = `r/${catMatch[1]}`;

        for (let i = 0; i < entries.length && items.length < limit; i++) {
          const entry = entries[i];
          const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
          const rawTitle = titleMatch ? unescapeHtml(titleMatch[1]) : `Reddit Item #${i + 1}`;
          
          const linkMatch = entry.match(/<link\s+href="([^"]+)"/);
          const permalink = linkMatch ? linkMatch[1] : targetUrl;

          const thumbMatch = entry.match(/<media:thumbnail\s+url="([^"]+)"/);
          const rawThumb = thumbMatch ? cleanMediaUrl(thumbMatch[1]) : '';

          // Look for media links in the HTML content
          const mediaMatches = entry.match(/https?:\/\/(?:i\.redd\.it|v\.redd\.it|preview\.redd\.it|i\.imgur\.com)[^"'\s<>&]+/gi) || [];
          let directMedia = '';
          for (const m of mediaMatches) {
            const clean = cleanMediaUrl(m);
            if (/\.(jpg|jpeg|png|gif|webp|mp4)/i.test(clean)) {
              directMedia = clean;
              break;
            }
          }

          if (!directMedia && rawThumb) {
            directMedia = rawThumb;
          }

          if (directMedia) {
            // Upgrade preview.redd.it to full-res i.redd.it
            let fullResUrl = directMedia;
            if (fullResUrl.includes('preview.redd.it')) {
              fullResUrl = fullResUrl.replace('preview.redd.it', 'i.redd.it').split('?')[0];
            }

            const isVideo = /\.mp4/i.test(fullResUrl) || fullResUrl.includes('v.redd.it');
            const isGif = /\.gif/i.test(fullResUrl);
            const ext = isVideo ? 'mp4' : (isGif ? 'gif' : 'jpg');

            items.push({
              id: `reddit_${i + 1}`,
              mediaType: isVideo ? 'video' : (isGif ? 'gif' : 'image'),
              title: rawTitle,
              url: fullResUrl,
              webpageUrl: permalink,
              thumbnail: rawThumb || fullResUrl,
              resolution: isVideo ? 'HD Video' : 'Original Resolution',
              ext: ext
            });
          }
        }

        if (items.length > 0) {
          console.log(`[BulkCrawler] Reddit RSS harvester succeeded: ${items.length} items from ${subTitle}`);
          return {
            type: 'bulk_gallery',
            id: 'reddit_' + Date.now().toString(36),
            title: `${subTitle} Media Feed (${items.length} Items)`,
            uploader: subTitle,
            thumbnail: items[0].thumbnail,
            itemCount: items.length,
            webpage_url: targetUrl,
            extractor: 'Reddit RSS Harvester',
            items: items
          };
        }
      }
    }
  } catch (rssErr) {
    console.warn('[BulkCrawler] Reddit RSS extraction failed, trying JSON:', rssErr.message);
  }

  // Secondary Strategy: Reddit JSON API
  try {
    let jsonUrl = targetUrl.replace(/\/+$/, '') + '.json?limit=' + limit;
    if (!targetUrl.includes('.json')) {
      jsonUrl = targetUrl.split('?')[0].replace(/\/+$/, '') + '.json?limit=' + limit;
    }

    console.log(`[BulkCrawler] Fetching Reddit API: ${jsonUrl}`);
    const res = await fetch(jsonUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) return null;
    const json = await res.json();
    const posts = json[0]?.data?.children || json?.data?.children || [];

    if (!posts || posts.length === 0) return null;

    const items = [];
    for (const p of posts) {
      const d = p.data;
      if (!d) continue;

      const title = unescapeHtml(d.title || 'Reddit Post');
      const permalink = `https://www.reddit.com${d.permalink}`;
      const thumb = d.thumbnail && d.thumbnail.startsWith('http') ? d.thumbnail : (d.url || '');

      // Check for Reddit Video
      if (d.is_video && d.media?.reddit_video?.fallback_url) {
        items.push({
          id: `reddit_${d.id}`,
          mediaType: 'video',
          title: title,
          url: d.media.reddit_video.fallback_url,
          webpageUrl: permalink,
          thumbnail: thumb || d.media.reddit_video.fallback_url,
          resolution: `${d.media.reddit_video.width || 1080}×${d.media.reddit_video.height || 1920}`,
          ext: 'mp4'
        });
      }
      // Check for Reddit Gallery
      else if (d.is_gallery && d.media_metadata) {
        for (const [mediaId, meta] of Object.entries(d.media_metadata)) {
          if (meta.s?.u) {
            const imgUrl = unescapeHtml(meta.s.u);
            items.push({
              id: `reddit_gal_${mediaId}`,
              mediaType: 'image',
              title: `${title} - Image`,
              url: imgUrl,
              webpageUrl: permalink,
              thumbnail: imgUrl,
              resolution: `${meta.s.x || 'HQ'}×${meta.s.y || 'HQ'}`,
              ext: meta.m === 'image/gif' ? 'gif' : 'jpg'
            });
          }
        }
      }
      // Direct media image or video link
      else if (d.url && /\.(jpg|jpeg|png|gif|webp|mp4)/i.test(d.url)) {
        const isGif = /\.gif/i.test(d.url);
        const isVideo = /\.mp4/i.test(d.url);
        items.push({
          id: `reddit_img_${d.id}`,
          mediaType: isVideo ? 'video' : (isGif ? 'gif' : 'image'),
          title: title,
          url: d.url,
          webpageUrl: permalink,
          thumbnail: d.url,
          resolution: 'Original File',
          ext: isVideo ? 'mp4' : (isGif ? 'gif' : 'jpg')
        });
      }
    }

    if (items.length > 0) {
      return {
        type: 'bulk_gallery',
        id: 'reddit_' + Date.now().toString(36),
        title: `Reddit Community Harvest (${items.length} Items)`,
        uploader: 'Reddit Feed',
        thumbnail: items[0].thumbnail,
        itemCount: items.length,
        webpage_url: targetUrl,
        extractor: 'Reddit Bulk Harvester',
        items: items
      };
    }
    return null;
  } catch (err) {
    console.error('[BulkCrawler] Reddit error:', err.message);
    return null;
  }
}

// 2. RedGifs & Imageboard Bulk Harvester
async function crawlRedGifsBulk(targetUrl) {
  try {
    console.log(`[BulkCrawler] Scraping RedGifs / Imageboard page: ${targetUrl}`);
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? unescapeHtml(titleMatch[1]).replace(/\s*\|\s*.*$/, '').trim() : 'RedGifs Media Collection';

    // Regex extract all video and high-res media files
    const mediaUrls = new Set();
    const videoMatches = html.match(/https?:\/\/[^"'\s\\<>]+\.(?:mp4|webm|m3u8)(?:\?[^"'\s\\<>]*)?/gi) || [];
    const imageMatches = html.match(/https?:\/\/[^"'\s\\<>]+\.(?:gif|webp|jpg|jpeg|png)(?:\?[^"'\s\\<>]*)?/gi) || [];

    for (const u of [...videoMatches, ...imageMatches]) {
      const clean = u.replace(/\\/g, '').replace(/&amp;/g, '&');
      if (!clean.includes('avatar') && !clean.includes('logo') && !clean.includes('icon') && !clean.includes('favicon')) {
        mediaUrls.add(clean);
      }
    }

    const items = [];
    let idx = 1;
    for (const u of candidateMedia(Array.from(mediaUrls))) {
      const isVideo = /\.(mp4|webm|m3u8)/i.test(u);
      const isGif = /\.gif/i.test(u);
      const ext = isVideo ? 'mp4' : (isGif ? 'gif' : 'jpg');

      items.push({
        id: `rg_item_${idx++}`,
        mediaType: isVideo ? 'video' : (isGif ? 'gif' : 'image'),
        title: `${pageTitle} — Item #${idx - 1}`,
        url: u,
        webpageUrl: targetUrl,
        thumbnail: u,
        resolution: isVideo ? 'HD Video' : 'High-Res Media',
        ext: ext
      });
    }

    if (items.length > 0) {
      return {
        type: 'bulk_gallery',
        id: 'redgifs_' + Date.now().toString(36),
        title: `${pageTitle} (${items.length} Items)`,
        uploader: new URL(targetUrl).hostname.replace('www.', ''),
        thumbnail: items[0].thumbnail,
        itemCount: items.length,
        webpage_url: targetUrl,
        extractor: 'RedGifs / Media Harvester',
        items: items
      };
    }
    return null;
  } catch (err) {
    console.error('[BulkCrawler] RedGifs error:', err.message);
    return null;
  }
}

function candidateMedia(urls) {
  // Deduplicate and filter high quality URLs
  const seen = new Set();
  const result = [];
  for (const raw of urls) {
    const u = cleanMediaUrl(raw);
    if (!u || !u.startsWith('http')) continue;
    // Standardize URL base
    const base = u.split('?')[0];
    if (!seen.has(base)) {
      seen.add(base);
      result.push(u);
    }
  }
  return result.slice(0, 100);
}

// 3. gallery-dl Universal Profile & Gallery Harvester (Instagram, Twitter, Pinterest, Imgur)
function crawlGalleryDlBulk(targetUrl, timeoutMs = 25000) {
  return new Promise((resolve) => {
    if (!fs.existsSync(galleryDlPath)) return resolve(null);

    console.log(`[BulkCrawler] Spawning gallery-dl bulk harvest: ${targetUrl}`);
    execFile(galleryDlPath, ['-j', '-R', '0', '--range', '1-60', '--http-timeout', '12', targetUrl], { maxBuffer: 1024 * 1024 * 30, timeout: timeoutMs }, (error, stdout) => {
      if (error || !stdout) return resolve(null);
      try {
        const jsonStart = stdout.indexOf('[');
        if (jsonStart === -1) return resolve(null);
        const parsed = JSON.parse(stdout.slice(jsonStart));
        const items = [];
        let meta = {};

        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item[0] === 2 && typeof item[1] === 'object') {
              meta = item[1];
            } else if (item[0] === 3 && typeof item[1] === 'string') {
              const mediaUrl = item[1];
              const itemMeta = item[2] || {};
              const ext = itemMeta.extension || (mediaUrl.includes('.mp4') ? 'mp4' : 'jpg');
              const isVideo = ext === 'mp4' || ext === 'webm' || mediaUrl.includes('.mp4');
              const isGif = ext === 'gif' || mediaUrl.includes('.gif');

              items.push({
                id: `gdl_${items.length + 1}`,
                mediaType: isVideo ? 'video' : (isGif ? 'gif' : 'image'),
                title: itemMeta.content || itemMeta.title || `${meta.category || 'Gallery'} Item #${items.length + 1}`,
                url: mediaUrl,
                webpageUrl: targetUrl,
                thumbnail: mediaUrl,
                resolution: itemMeta.width && itemMeta.height ? `${itemMeta.width}×${itemMeta.height}` : 'Original Quality',
                ext: ext
              });
            }
          }
        }

        if (items.length > 0) {
          const title = meta.content || meta.title || meta.author?.name || `${meta.category || 'Media'} Collection`;
          return resolve({
            type: 'bulk_gallery',
            id: 'gallery_dl_' + Date.now().toString(36),
            title: `${title} (${items.length} Items)`,
            uploader: meta.author?.name || meta.user?.name || new URL(targetUrl).hostname.replace('www.', ''),
            thumbnail: items[0].thumbnail,
            itemCount: items.length,
            webpage_url: targetUrl,
            extractor: (meta.category || 'Gallery').toUpperCase() + ' Engine',
            items: items
          });
        }
        resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  });
}

// Dedicated Instagram Profile & Reels Harvester
function crawlInstagramBulk(targetUrl, limit = 60) {
  return new Promise((resolve) => {
    if (!fs.existsSync(igCrawlerScript)) return resolve(null);

    console.log(`[BulkCrawler] Spawning Instagram profile crawler: ${targetUrl}`);
    execFile(pythonBin, [igCrawlerScript, targetUrl, String(limit)], { maxBuffer: 1024 * 1024 * 30, timeout: 35000 }, (error, stdout, stderr) => {
      if (stderr) console.log('[BulkCrawler ig stderr]:', stderr);
      if (error || !stdout) return resolve(null);
      try {
        const jsonStart = stdout.indexOf('{');
        if (jsonStart === -1) return resolve(null);
        const data = JSON.parse(stdout.slice(jsonStart));
        if (data.items && data.items.length > 0) {
          return resolve(data);
        }
        if (data.requiresAuth) {
          console.log('[BulkCrawler ig]: Instagram profile requires authentication or In-Page Harvester');
        }
        resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  });
}

// 4. Universal Generic Webpage Media Harvester (Scrapes any webpage URL)
async function harvestGenericWebpage(targetUrl) {
  try {
    console.log(`[BulkCrawler] Harvesting generic webpage: ${targetUrl}`);
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': targetUrl
      }
    });

    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:title|twitter:title)["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? unescapeHtml(titleMatch[1]).replace(/\s*\|\s*.*$/, '').trim() : 'Page Media Collection';

    // Regex extract all video and high-res media files
    const mediaUrls = new Set();

    // Check og:video / video src
    const videoMatches = html.match(/https?:\/\/[^"'\s\\<>]+\.(?:mp4|webm|m3u8)(?:\?[^"'\s\\<>]*)?/gi) || [];
    for (const u of videoMatches) {
      mediaUrls.add(u.replace(/\\/g, '').replace(/&amp;/g, '&'));
    }

    // Check img src / data-src / srcset
    const isInstagram = /instagram\.com/i.test(targetUrl);
    const imageMatches = html.match(/https?:\/\/[^"'\s\\<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"'\s\\<>]*)?/gi) || [];
    for (const u of imageMatches) {
      const clean = u.replace(/\\/g, '').replace(/&amp;/g, '&');
      const isIgStatic = clean.includes('static.cdninstagram.com') ||
                         clean.includes('rsrc.php') ||
                         clean.includes('instagram.com/static') ||
                         clean.includes('wordmark') ||
                         clean.includes('logo') ||
                         clean.includes('icon') ||
                         clean.includes('favicon') ||
                         clean.includes('sprite') ||
                         clean.includes('badge');
      if (isInstagram && isIgStatic) continue;
      if (!clean.includes('avatar') && !clean.includes('logo') && !clean.includes('icon') && !clean.includes('favicon') && !clean.includes('sprite')) {
        mediaUrls.add(clean);
      }
    }

    if (isInstagram && mediaUrls.size === 0) {
      console.log('[BulkCrawler] Generic harvester detected Instagram page without readable public media, suppressing logo placeholders.');
      return null;
    }

    const items = [];
    let idx = 1;
    for (const u of candidateMedia(Array.from(mediaUrls))) {
      const isVideo = /\.(mp4|webm|m3u8)/i.test(u);
      const isGif = /\.gif/i.test(u);
      const ext = isVideo ? 'mp4' : (isGif ? 'gif' : 'jpg');

      items.push({
        id: `web_item_${idx++}`,
        mediaType: isVideo ? 'video' : (isGif ? 'gif' : 'image'),
        title: `${pageTitle} — Item #${idx - 1}`,
        url: u,
        webpageUrl: targetUrl,
        thumbnail: u,
        resolution: isVideo ? 'HD Video' : 'High-Res Image',
        ext: ext
      });
    }

    if (items.length > 0) {
      return {
        type: 'bulk_gallery',
        id: 'webpage_' + Date.now().toString(36),
        title: `${pageTitle} (${items.length} Items)`,
        uploader: new URL(targetUrl).hostname.replace('www.', ''),
        thumbnail: items[0].thumbnail,
        itemCount: items.length,
        webpage_url: targetUrl,
        extractor: 'Universal Web Harvester',
        items: items
      };
    }
    return null;
  } catch (err) {
    console.error('[BulkCrawler] Webpage harvest error:', err.message);
    return null;
  }
}

// 5. YouTube Channel / Playlist Bulk Harvester (yt-dlp --flat-playlist)
function crawlYouTubeBulk(targetUrl, limit = 60) {
  return new Promise((resolve) => {
    if (!fs.existsSync(ytDlpPath)) return resolve(null);

    console.log(`[BulkCrawler] Spawning yt-dlp flat-playlist harvest: ${targetUrl}`);
    const args = [
      '--flat-playlist', '-j',
      '--playlist-end', String(limit),
      '--no-warnings', '--ignore-errors',
      targetUrl
    ];

    execFile(ytDlpPath, args, { maxBuffer: 1024 * 1024 * 30, timeout: 30000 }, (error, stdout) => {
      if (!stdout) return resolve(null);
      try {
        const lines = stdout.trim().split('\n').filter(l => l.trim());
        const items = [];
        let playlistTitle = 'YouTube Collection';

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry._type === 'url' || entry._type === 'url_transparent' || entry.id) {
              const videoId = entry.id || entry.url || '';
              const thumb = entry.thumbnails?.[0]?.url ||
                            (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
              const duration = entry.duration ? formatDuration(entry.duration) : '';

              items.push({
                id: `yt_${items.length + 1}`,
                mediaType: 'video',
                title: entry.title || `Video #${items.length + 1}`,
                url: entry.url || `https://www.youtube.com/watch?v=${videoId}`,
                webpageUrl: entry.url || `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: thumb,
                resolution: 'HD Video',
                ext: 'mp4',
                duration: duration
              });

              if (!playlistTitle || playlistTitle === 'YouTube Collection') {
                playlistTitle = entry.playlist_title || entry.playlist || 'YouTube Collection';
              }
            }
          } catch (_) { /* skip malformed lines */ }
        }

        if (items.length > 0) {
          return resolve({
            type: 'bulk_gallery',
            id: 'youtube_bulk_' + Date.now().toString(36),
            title: `${playlistTitle} (${items.length} Videos)`,
            uploader: items[0]?.uploader || 'YouTube',
            thumbnail: items[0].thumbnail,
            itemCount: items.length,
            webpage_url: targetUrl,
            extractor: 'YouTube Bulk Harvester',
            items: items
          });
        }
        resolve(null);
      } catch (err) {
        console.error('[BulkCrawler] YouTube bulk error:', err.message);
        resolve(null);
      }
    });
  });
}

// 6. TikTok Profile Bulk Harvester (yt-dlp --flat-playlist)
function crawlTikTokBulk(targetUrl, limit = 50) {
  return new Promise((resolve) => {
    if (!fs.existsSync(ytDlpPath)) return resolve(null);

    console.log(`[BulkCrawler] Spawning yt-dlp TikTok harvest: ${targetUrl}`);
    const args = [
      '--flat-playlist', '-j',
      '--playlist-end', String(limit),
      '--no-warnings', '--ignore-errors',
      targetUrl
    ];

    execFile(ytDlpPath, args, { maxBuffer: 1024 * 1024 * 30, timeout: 30000 }, (error, stdout) => {
      if (!stdout) return resolve(null);
      try {
        const lines = stdout.trim().split('\n').filter(l => l.trim());
        const items = [];

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.id || entry.url) {
              items.push({
                id: `tiktok_${items.length + 1}`,
                mediaType: 'video',
                title: entry.title || `TikTok #${items.length + 1}`,
                url: entry.url || entry.webpage_url || '',
                webpageUrl: entry.url || entry.webpage_url || '',
                thumbnail: entry.thumbnails?.[0]?.url || '',
                resolution: 'HD Video',
                ext: 'mp4'
              });
            }
          } catch (_) { /* skip malformed lines */ }
        }

        if (items.length > 0) {
          return resolve({
            type: 'bulk_gallery',
            id: 'tiktok_bulk_' + Date.now().toString(36),
            title: `TikTok Collection (${items.length} Videos)`,
            uploader: 'TikTok',
            thumbnail: items[0].thumbnail || '',
            itemCount: items.length,
            webpage_url: targetUrl,
            extractor: 'TikTok Bulk Harvester',
            items: items
          });
        }
        resolve(null);
      } catch (err) {
        console.error('[BulkCrawler] TikTok bulk error:', err.message);
        resolve(null);
      }
    });
  });
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Master Bulk Crawler Dispatcher
async function crawlBulkMedia(targetUrl) {
  if (!targetUrl) return null;

  const lower = targetUrl.toLowerCase();

  // 1. Reddit Subreddits or Users
  if (/reddit\.com\/r\/|reddit\.com\/user\//i.test(lower)) {
    const redditBulk = await crawlRedditBulk(targetUrl);
    if (redditBulk) return redditBulk;
  }

  // 2. RedGifs Feeds or Searches
  if (/redgifs\.com/i.test(lower)) {
    const rgBulk = await crawlRedGifsBulk(targetUrl);
    if (rgBulk) return rgBulk;
  }

  // 3. Instagram Profiles / Reels via dedicated crawler -> gallery-dl fallback
  if (/instagram\.com/i.test(lower)) {
    const igBulk = await crawlInstagramBulk(targetUrl);
    if (igBulk) return igBulk;
    const gdlBulk = await crawlGalleryDlBulk(targetUrl);
    if (gdlBulk) return gdlBulk;
  }

  // 4. Twitter / Pinterest / Imgur / Tumblr via gallery-dl
  if (/twitter\.com|x\.com|pinterest\.com|imgur\.com|tumblr\.com/i.test(lower)) {
    const gdlBulk = await crawlGalleryDlBulk(targetUrl);
    if (gdlBulk) return gdlBulk;
  }

  // 4. YouTube Channels, Playlists, User pages
  if (/youtube\.com\/@|youtube\.com\/playlist|youtube\.com\/channel|youtube\.com\/c\/|youtu\.be/i.test(lower)) {
    const ytBulk = await crawlYouTubeBulk(targetUrl);
    if (ytBulk) return ytBulk;
  }

  // 5. TikTok Profiles
  if (/tiktok\.com\/@/i.test(lower)) {
    const ttBulk = await crawlTikTokBulk(targetUrl);
    if (ttBulk) return ttBulk;
  }

  // 6. Generic Webpage Harvester Fallback
  const genericBulk = await harvestGenericWebpage(targetUrl);
  if (genericBulk) return genericBulk;

  return null;
}

module.exports = {
  crawlBulkMedia,
  crawlInstagramBulk,
  crawlRedditBulk,
  crawlRedGifsBulk,
  crawlGalleryDlBulk,
  crawlYouTubeBulk,
  crawlTikTokBulk,
  harvestGenericWebpage
};
