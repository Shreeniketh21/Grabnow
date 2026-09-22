/**
 * GrabNow — Ultimate In-Page Instagram Live Media Harvester
 * Extracts all photos, reels, videos, carousel slides, and audio soundtracks
 * directly from the active Instagram tab in Chrome, bypassing login walls.
 */
(function () {
  const SERVER_URL = 'http://localhost:3000';

  // Remove existing overlay if any
  const existing = document.getElementById('grabnow-live-harvester-bar');
  if (existing) existing.remove();

  console.log('[GrabNow] Initiating In-Page Live Harvester on', window.location.href);

  // Check if user is actually on Instagram
  const isInstagram = window.location.hostname.includes('instagram.com');

  function parseBestSrcset(srcset) {
    if (!srcset) return null;
    try {
      const candidates = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        const url = parts[0];
        const width = parts[1] ? parseInt(parts[1].replace(/w$/i, ''), 10) : 0;
        return { url, width };
      }).filter(c => c.url && !isNaN(c.width));

      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.width - a.width);
      return candidates[0].url;
    } catch (_) {
      return null;
    }
  }

  function getReactProps(domNode) {
    if (!domNode) return null;
    try {
      const key = Object.keys(domNode).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (!key) return null;
      let fiber = domNode[key];
      let depth = 0;
      while (fiber && depth < 30) {
        if (fiber.memoizedProps) {
          const p = fiber.memoizedProps;
          if (p.media || p.post || p.item || p.feedItem) {
            return p.media || p.post || p.item || p.feedItem;
          }
        }
        fiber = fiber.return;
        depth++;
      }
    } catch (_) {}
    return null;
  }

  function harvestInstagramMedia() {
    const items = [];
    const seenUrls = new Set();
    const usernameMatch = window.location.pathname.match(/^\/([a-zA-Z0-9._]+)/);
    const pageUsername = usernameMatch ? `@${usernameMatch[1]}` : '@instagram_user';

    // 1. React Fiber Deep Search
    try {
      const allElements = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], article, div[role="button"]'));
      for (const el of allElements) {
        const rawMedia = getReactProps(el);
        if (!rawMedia) continue;

        const shortcode = rawMedia.code || rawMedia.shortcode || (rawMedia.pk ? String(rawMedia.pk) : null);
        const caption = rawMedia.caption?.text || rawMedia.edge_media_to_caption?.edges?.[0]?.node?.text || '';
        const cleanTitle = caption ? caption.split('\n')[0].slice(0, 70) : `Post ${shortcode || items.length + 1}`;

        // Carousel items
        if (rawMedia.carousel_media && Array.isArray(rawMedia.carousel_media)) {
          rawMedia.carousel_media.forEach((slide, sIdx) => {
            const isVid = slide.video_versions && slide.video_versions.length > 0;
            const slideUrl = isVid ? slide.video_versions[0].url : (slide.image_versions2?.candidates?.[0]?.url);
            const thumb = slide.image_versions2?.candidates?.[0]?.url || slideUrl;
            if (slideUrl && !seenUrls.has(slideUrl)) {
              seenUrls.add(slideUrl);
              items.push({
                id: `ig_live_${shortcode}_slide_${sIdx + 1}`,
                mediaType: isVid ? 'video' : 'image',
                title: `${cleanTitle} (Slide ${sIdx + 1})`,
                url: slideUrl,
                webpageUrl: window.location.href,
                thumbnail: thumb,
                resolution: isVid ? '🎬 HD Video' : '📸 High-Res Photo',
                ext: isVid ? 'mp4' : 'jpg'
              });
            }
          });
        } else if (rawMedia.video_versions && rawMedia.video_versions.length > 0) {
          // Reel / Video
          const vidUrl = rawMedia.video_versions[0].url;
          const thumb = rawMedia.image_versions2?.candidates?.[0]?.url || vidUrl;
          if (vidUrl && !seenUrls.has(vidUrl)) {
            seenUrls.add(vidUrl);
            const music = rawMedia.clips_metadata?.music_info?.music_asset_info;
            items.push({
              id: `ig_live_${shortcode || items.length + 1}`,
              mediaType: 'video',
              title: cleanTitle,
              url: vidUrl,
              webpageUrl: window.location.href,
              thumbnail: thumb,
              resolution: '🎬 HD Video',
              ext: 'mp4',
              audioTrack: music ? {
                title: music.title || 'Original Audio',
                artist: music.display_artist || pageUsername,
                url: music.progressive_download_url || ''
              } : null
            });
          }
        } else if (rawMedia.image_versions2?.candidates?.length > 0) {
          const imgUrl = rawMedia.image_versions2.candidates[0].url;
          if (imgUrl && !seenUrls.has(imgUrl)) {
            seenUrls.add(imgUrl);
            items.push({
              id: `ig_live_${shortcode || items.length + 1}`,
              mediaType: 'image',
              title: cleanTitle,
              url: imgUrl,
              webpageUrl: window.location.href,
              thumbnail: imgUrl,
              resolution: '📸 High-Res Photo',
              ext: 'jpg'
            });
          }
        }
      }
    } catch (e) {
      console.warn('[GrabNow] React extraction warning:', e);
    }

    // 2. Comprehensive DOM Post Links & Visual Extraction
    const postAnchors = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
    postAnchors.forEach((a, idx) => {
      const href = a.getAttribute('href') || '';
      const isReel = href.includes('/reel/');
      const postUrl = new URL(href, window.location.origin).href;

      const img = a.querySelector('img');
      const video = a.querySelector('video');

      if (video && video.src && !video.src.startsWith('blob:') && !seenUrls.has(video.src)) {
        seenUrls.add(video.src);
        items.push({
          id: `ig_dom_v_${idx + 1}`,
          mediaType: 'video',
          title: `Reel #${idx + 1} (${pageUsername})`,
          url: video.src,
          webpageUrl: postUrl,
          thumbnail: (img && (parseBestSrcset(img.srcset) || img.src)) || video.src,
          resolution: '🎬 HD Video',
          ext: 'mp4'
        });
      }

      if (img) {
        const bestImgUrl = parseBestSrcset(img.srcset) || img.src;
        if (bestImgUrl && !seenUrls.has(bestImgUrl)) {
          const isLogo = bestImgUrl.includes('rsrc.php') ||
                         bestImgUrl.includes('logo') ||
                         bestImgUrl.includes('icon') ||
                         bestImgUrl.includes('badge') ||
                         (img.alt && img.alt.toLowerCase().includes('profile picture'));
          if (!isLogo) {
            seenUrls.add(bestImgUrl);
            let altText = (img.alt || '').replace(/^Photo by.*?on.*?May be an image of\s*/i, '').trim();
            altText = altText ? altText.slice(0, 70) : `Post #${idx + 1} (${pageUsername})`;

            items.push({
              id: `ig_dom_img_${idx + 1}`,
              mediaType: isReel ? 'video' : 'image',
              title: altText,
              url: bestImgUrl,
              webpageUrl: postUrl,
              thumbnail: bestImgUrl,
              resolution: isReel ? '🎬 Video Reel' : '📸 High-Res Photo',
              ext: 'jpg'
            });
          }
        }
      }
    });

    // 3. Fallback: All CDN images in main container
    const allCdnImgs = Array.from(document.querySelectorAll('main img, article img, div[role="main"] img, div._aagv img, img[srcset]'));
    allCdnImgs.forEach((img, idx) => {
      const bestUrl = parseBestSrcset(img.srcset) || img.src;
      if (bestUrl && !seenUrls.has(bestUrl) && (bestUrl.includes('cdninstagram.com') || bestUrl.includes('fbcdn.net'))) {
        const isAvatar = (img.alt && img.alt.toLowerCase().includes('profile picture')) ||
                         (img.closest && img.closest('header')) ||
                         bestUrl.includes('rsrc.php');
        if (!isAvatar) {
          seenUrls.add(bestUrl);
          items.push({
            id: `ig_feed_img_${idx + 1}`,
            mediaType: 'image',
            title: img.alt ? img.alt.slice(0, 70) : `Instagram Media #${items.length + 1} (${pageUsername})`,
            url: bestUrl,
            webpageUrl: window.location.href,
            thumbnail: bestUrl,
            resolution: '📸 High-Res Photo',
            ext: 'jpg'
          });
        }
      }
    });

    // 4. Fallback: All Video Elements
    const allVideos = Array.from(document.querySelectorAll('video'));
    allVideos.forEach((vid, vIdx) => {
      const vSrc = vid.src || (vid.querySelector('source') && vid.querySelector('source').src);
      if (vSrc && !vSrc.startsWith('blob:') && !seenUrls.has(vSrc)) {
        seenUrls.add(vSrc);
        items.push({
          id: `ig_video_${vIdx + 1}`,
          mediaType: 'video',
          title: `Video / Reel #${items.length + 1} (${pageUsername})`,
          url: vSrc,
          webpageUrl: window.location.href,
          thumbnail: vid.poster || vSrc,
          resolution: '🎬 HD Video',
          ext: 'mp4'
        });
      }
    });

    return items;
  }

  const harvestedItems = isInstagram ? harvestInstagramMedia() : [];
  const vCount = harvestedItems.filter(i => i.mediaType === 'video').length;
  const pCount = harvestedItems.filter(i => i.mediaType === 'image').length;
  const aCount = harvestedItems.filter(i => i.mediaType === 'audio' || i.audioTrack).length;

  console.log(`[GrabNow] Discovered ${harvestedItems.length} items (${vCount} videos, ${pCount} photos, ${aCount} soundtracks).`);

  // Build UI overlay
  const bar = document.createElement('div');
  bar.id = 'grabnow-live-harvester-bar';
  bar.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999999;
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
    color: #fff;
    border: 1px solid rgba(139, 92, 246, 0.4);
    box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 25px rgba(124, 58, 237, 0.3);
    border-radius: 16px;
    padding: 16px 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: 520px;
    backdrop-filter: blur(12px);
    animation: grabnowSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  if (!document.getElementById('grabnow-keyframes')) {
    const st = document.createElement('style');
    st.id = 'grabnow-keyframes';
    st.textContent = `
      @keyframes grabnowSlideUp {
        from { transform: translateY(50px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(st);
  }

  if (!isInstagram) {
    bar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="font-size: 22px;">⚠️</div>
        <div>
          <div style="font-weight: 700; font-size: 14px; color: #f87171;">Wrong Tab Detected</div>
          <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">
            You are on <strong>${window.location.hostname}</strong>. Please switch to your <strong>Instagram</strong> tab (e.g. <code>instagram.com/sahadelina/</code>) and click the bookmarklet there!
          </div>
        </div>
      </div>
      <button id="grabnow-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px; margin-left: auto;">✕</button>
    `;
    document.body.appendChild(bar);
    document.getElementById('grabnow-close-btn').onclick = () => bar.remove();
    return;
  }

  bar.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 42px; height: 42px; border-radius: 10px; background: linear-gradient(135deg, #ec4899, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 4px 12px rgba(236,72,153,0.4);">⚡</div>
      <div>
        <div style="font-weight: 700; font-size: 15px; color: #f8fafc; letter-spacing: -0.01em;">GrabNow Live Harvester</div>
        <div style="font-size: 13px; color: #94a3b8; margin-top: 2px;">
          Discovered <strong style="color: #38bdf8;">${harvestedItems.length}</strong> items: 
          <span style="color: #a78bfa;">${vCount}v</span> • 
          <span style="color: #34d399;">${pCount}p</span> 
          ${aCount > 0 ? `• <span style="color: #f472b6;">${aCount}🎵</span>` : ''}
        </div>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
      <button id="grabnow-send-btn" ${harvestedItems.length === 0 ? 'disabled style="background:#475569; color:#94a3b8; cursor:not-allowed;"' : 'style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; cursor: pointer;"'} style="border: none; padding: 9px 15px; border-radius: 9px; font-weight: 600; font-size: 13px; transition: 0.2s transform; white-space: nowrap;">
        ${harvestedItems.length === 0 ? 'Scroll to load posts' : 'Open in GrabNow'}
      </button>
      <button id="grabnow-copy-btn" title="Copy harvested data to clipboard" style="background: rgba(255,255,255,0.08); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); padding: 9px 12px; border-radius: 9px; font-weight: 500; font-size: 12px; cursor: pointer; white-space: nowrap;">📋 Copy JSON</button>
      <button id="grabnow-close-btn" style="background: transparent; border: none; color: #64748b; font-size: 18px; cursor: pointer; padding: 4px; line-height: 1;">✕</button>
    </div>
  `;

  document.body.appendChild(bar);

  document.getElementById('grabnow-close-btn').onclick = () => bar.remove();

  const usernameMatch = window.location.pathname.match(/^\/([a-zA-Z0-9._]+)/);
  const username = usernameMatch ? `@${usernameMatch[1]}` : 'Instagram User';

  const payload = {
    title: `Instagram ${username} (${harvestedItems.length} Items)`,
    uploader: username,
    webpage_url: window.location.href,
    thumbnail: harvestedItems[0]?.thumbnail || '',
    itemCount: harvestedItems.length,
    extractor: 'Instagram Live Harvester',
    items: harvestedItems
  };

  // 1. Copy JSON action
  const copyBtn = document.getElementById('grabnow-copy-btn');
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      copyBtn.textContent = '✅ Copied!';
      copyBtn.style.color = '#34d399';
      setTimeout(() => { copyBtn.textContent = '📋 Copy JSON'; copyBtn.style.color = '#cbd5e1'; }, 2000);
    } catch (_) {
      prompt('Copy this Harvester JSON data:', JSON.stringify(payload));
    }
  };

  // 2. Open in GrabNow action (Multi-channel: postMessage + Clipboard + Fetch)
  const sendBtn = document.getElementById('grabnow-send-btn');
  if (sendBtn && harvestedItems.length > 0) {
    sendBtn.onclick = async () => {
      sendBtn.textContent = 'Opening...';
      sendBtn.disabled = true;

      // Copy to clipboard silently as instant backup
      try {
        await navigator.clipboard.writeText(JSON.stringify(payload));
      } catch (_) {}

      // Open GrabNow tab (Allowed across origins and protocols)
      const grabnowTab = window.open(SERVER_URL, 'grabnow_app');

      // Communicate via postMessage (Works across HTTPS -> HTTP, zero CSP block!)
      function transmitMessage() {
        if (grabnowTab && !grabnowTab.closed) {
          grabnowTab.postMessage({
            type: 'GRABNOW_HARVEST_IMPORT',
            payload: payload
          }, '*');
        }
      }

      // Transmit repeatedly while GrabNow tab initializes
      transmitMessage();
      const intervalId = setInterval(transmitMessage, 400);
      setTimeout(() => clearInterval(intervalId), 5000);

      // Also try fetch in background (non-blocking)
      try {
        fetch(`${SERVER_URL}/api/bulk/import-harvest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch (_) {}

      sendBtn.textContent = '✅ Opened!';
      sendBtn.style.background = '#10b981';
      setTimeout(() => bar.remove(), 2000);
    };
  }
})();
