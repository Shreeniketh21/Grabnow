/* =========================================================
   GRABNOW — CLIENT CONTROLLER & ADVANCED MULTI-MEDIA ENGINE
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Input Form & Header
  const urlForm = document.getElementById('url-form');
  const urlInput = document.getElementById('url-input');
  const pasteBtn = document.getElementById('paste-btn');
  const clearBtn = document.getElementById('clear-btn');
  const fetchBtn = document.getElementById('fetch-btn');
  const fetchSpinner = document.getElementById('fetch-spinner');
  const errorAlert = document.getElementById('error-alert');
  const errorMessage = document.getElementById('error-message');
  const engineStatus = document.getElementById('engine-status');

  // Single Media Result Elements
  const resultCard = document.getElementById('result-card');
  const resThumbnail = document.getElementById('res-thumbnail');
  const resDuration = document.getElementById('res-duration');
  const resExtractor = document.getElementById('res-extractor');
  const resTitle = document.getElementById('res-title');
  const resUploader = document.getElementById('res-uploader');
  const resLink = document.getElementById('res-link');
  const tabVideo = document.getElementById('tab-video');
  const tabAudio = document.getElementById('tab-audio');
  const videoOptionsPanel = document.getElementById('video-options-panel');
  const audioOptionsPanel = document.getElementById('audio-options-panel');
  const videoQualitiesList = document.getElementById('video-qualities-list');
  const audioQualitiesList = document.getElementById('audio-qualities-list');
  const startDownloadBtn = document.getElementById('start-download-btn');
  const ctaLabel = document.getElementById('cta-label');

  // Carousel / Photo Gallery Elements
  const carouselCard = document.getElementById('carousel-card');
  const carouselBadgeText = document.getElementById('carousel-badge-text');
  const carouselPlatform = document.getElementById('carousel-platform');
  const carouselTitle = document.getElementById('carousel-title');
  const carouselUploader = document.getElementById('carousel-uploader');
  const carouselSelectionCount = document.getElementById('carousel-selection-count');
  const carouselSelectAllBtn = document.getElementById('carousel-select-all-btn');
  const carouselGrid = document.getElementById('carousel-grid');
  const carouselDownloadSelectedBtn = document.getElementById('carousel-download-selected-btn');
  const carouselCtaText = document.getElementById('carousel-cta-text');
  const carouselDownloadZipBtn = document.getElementById('carousel-download-zip-btn');
  const bulkFilterToolbar = document.getElementById('bulk-filter-toolbar');
  const bulkFilterBtns = document.querySelectorAll('.bulk-filter-btn');
  const filterCountAll = document.getElementById('filter-count-all');
  const filterCountVideo = document.getElementById('filter-count-video');
  const filterCountImage = document.getElementById('filter-count-image');
  const filterCountGif = document.getElementById('filter-count-gif');
  const filterCountAudio = document.getElementById('filter-count-audio');

  // Live Harvester Modal Elements
  const liveHarvesterBtn = document.getElementById('live-harvester-btn');
  const harvesterModal = document.getElementById('harvester-modal');
  const harvesterModalClose = document.getElementById('harvester-modal-close');
  const harvesterModalCloseBtn = document.getElementById('harvester-modal-close-btn');
  const copySnippetBtn = document.getElementById('copy-snippet-btn');
  const harvesterSnippetInput = document.getElementById('harvester-snippet-input');
  const bookmarkletLink = document.getElementById('bookmarklet-link');

  // Playlist / Collection Elements
  const playlistCard = document.getElementById('playlist-card');
  const playlistCover = document.getElementById('playlist-cover');
  const playlistCountBadge = document.getElementById('playlist-count-badge');
  const playlistPlatform = document.getElementById('playlist-platform');
  const playlistTitle = document.getElementById('playlist-title');
  const playlistUploader = document.getElementById('playlist-uploader');
  const playlistSelectionCount = document.getElementById('playlist-selection-count');
  const playlistSelectAllBtn = document.getElementById('playlist-select-all-btn');
  const playlistItemsList = document.getElementById('playlist-items-list');
  const playlistDownloadSelectedBtn = document.getElementById('playlist-download-selected-btn');
  const playlistBatchDownloadBtn = document.getElementById('playlist-batch-download-btn');
  const playlistCtaText = document.getElementById('playlist-cta-text');

  // Batch Progress Dashboard Elements
  const batchProgressCard = document.getElementById('batch-progress-card');
  const batchHeading = document.getElementById('batch-heading');
  const batchCompletedCount = document.getElementById('batch-completed-count');
  const batchDownloadingCount = document.getElementById('batch-downloading-count');
  const batchFailedCount = document.getElementById('batch-failed-count');
  const batchQueuedCount = document.getElementById('batch-queued-count');
  const batchProgressFill = document.getElementById('batch-progress-fill');
  const batchProgressPercent = document.getElementById('batch-progress-percent');
  const batchItemsList = document.getElementById('batch-items-list');
  const batchReadyBox = document.getElementById('batch-ready-box');
  const batchSaveZip = document.getElementById('batch-save-zip');
  const batchRetryFailedBtn = document.getElementById('batch-retry-failed-btn');
  const batchAutoSaveToggle = document.getElementById('batch-auto-save-toggle');
  const batchPackageNowBtn = document.getElementById('batch-package-now-btn');
  const batchReadyNum = document.getElementById('batch-ready-num');

  // Progress Elements
  const progressCard = document.getElementById('progress-card');
  const progressHeading = document.getElementById('progress-heading');
  const progressPercent = document.getElementById('progress-percent');
  const progressFill = document.getElementById('progress-fill');
  const statSpeed = document.getElementById('stat-speed');
  const statSize = document.getElementById('stat-size');
  const statEta = document.getElementById('stat-eta');
  const statFormat = document.getElementById('stat-format');
  const readyActionBox = document.getElementById('ready-action-box');
  const btnSaveFile = document.getElementById('btn-save-file');
  const btnAnother = document.getElementById('btn-another');

  // History Elements
  const historyList = document.getElementById('history-list');
  const historyCount = document.getElementById('history-count');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const emptyHistoryMsg = document.getElementById('empty-history-msg');

  // State
  let currentMediaData = null;
  let selectedOption = {
    type: 'video',
    formatId: 'best',
    quality: '1080p',
    ext: 'mp4'
  };
  let selectedCarouselItems = new Set();
  let selectedPlaylistItems = new Set();
  let activePollInterval = null;
  let activeBatchPollInterval = null;
  let activeBatchId = null;
  let batchAutoDownloadedItems = new Set();

  // Initialize
  checkServerHealth();
  loadHistory();

  // ----- Health Check -----
  async function checkServerHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        engineStatus.textContent = 'Engine Online';
        engineStatus.style.color = '#34d399';
      } else {
        throw new Error();
      }
    } catch (e) {
      engineStatus.textContent = 'Backend Offline';
      engineStatus.style.color = '#f87171';
    }
  }

  // ----- Input Interactions -----
  urlInput.addEventListener('input', () => {
    clearBtn.classList.toggle('hidden', !urlInput.value.trim());
    hideError();
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.classList.add('hidden');
    urlInput.focus();
    hideError();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        clearBtn.classList.remove('hidden');
        urlInput.focus();
      }
    } catch (err) {
      console.log('Clipboard access unavailable');
    }
  });

  // Quick platform pill buttons
  document.querySelectorAll('.platform-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const platform = pill.getAttribute('data-platform');
      urlInput.placeholder = `Paste ${platform} link here...`;
      urlInput.focus();
    });
  });

  // ----- URL Submit & Info Fetching -----
  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let url = urlInput.value.trim();

    if (!url) {
      showError('Please paste a media link to get started.');
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
      urlInput.value = url;
    }

    try {
      new URL(url);
    } catch (_) {
      showError('The link you entered is not a valid web address. Please check and try again.');
      return;
    }

    hideError();
    setLoadingState(true);
    resultCard.classList.add('hidden');
    carouselCard.classList.add('hidden');
    playlistCard.classList.add('hidden');
    progressCard.classList.add('hidden');
    batchProgressCard.classList.add('hidden');

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      let data;
      const rawText = await response.text();
      try {
        data = JSON.parse(rawText);
      } catch (_) {
        if (!response.ok) {
          throw new Error(`Backend Error (${response.status}): Please verify the Cloud Function is deployed or try again in a moment.`);
        }
        throw new Error('Received non-JSON response from server.');
      }

      if (!response.ok) {
        const errorObj = new Error(data.error || 'Unable to extract media from this link.');
        if (data.isInstagramAuthRequired) errorObj.isInstagramAuthRequired = true;
        throw errorObj;
      }

      currentMediaData = data;

      // Branch to appropriate UI component
      if (data.type === 'carousel' || data.type === 'bulk_gallery') {
        renderCarouselResult(data);
      } else if (data.type === 'playlist') {
        renderPlaylistResult(data);
      } else {
        renderMediaResult(data);
      }
    } catch (err) {
      showError(err.message || 'Unable to extract media from this link.', Boolean(err.isInstagramAuthRequired));
    } finally {
      setLoadingState(false);
    }
  });

  function setLoadingState(loading) {
    fetchBtn.disabled = loading;
    fetchSpinner.classList.toggle('hidden', !loading);
    fetchBtn.querySelector('.btn-text').textContent = loading ? 'Extracting Media...' : 'Grab Media';
    fetchBtn.querySelector('.btn-arrow').classList.toggle('hidden', loading);
  }

  function showError(msg, isIgAuth = false) {
    if (isIgAuth) {
      errorMessage.innerHTML = `
        <span>${escapeHtml(msg)}</span>
        <button type="button" class="btn-primary" style="margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; padding: 6px 14px;" id="error-open-harvester-btn">
          ⚡ Open 1-Click Live Harvester
        </button>
      `;
      const btn = document.getElementById('error-open-harvester-btn');
      if (btn && harvesterModal) {
        btn.onclick = () => harvesterModal.classList.remove('hidden');
      }
    } else {
      errorMessage.textContent = msg;
    }
    errorAlert.classList.remove('hidden');
  }

  function hideError() {
    errorAlert.classList.add('hidden');
  }

  // =========================================================
  // 1. SINGLE MEDIA RENDERER
  // =========================================================
  function renderMediaResult(data) {
    resThumbnail.src = data.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
    resDuration.textContent = data.duration || 'Live';
    resExtractor.textContent = data.extractor || 'Web';
    resTitle.textContent = data.title;
    resUploader.textContent = data.uploader ? `By ${data.uploader}` : 'GrabNow Downloader';
    resLink.href = data.webpage_url || '#';

    // Populate Video Qualities
    videoQualitiesList.innerHTML = '';
    const videoFormats = (data.videoFormats && data.videoFormats.length) ? data.videoFormats : [
      { resolution: 'Best Video', formatId: 'best', ext: 'mp4', filesize: null },
      { resolution: '1080p HD', formatId: 'best', ext: 'mp4', filesize: null },
      { resolution: '720p', formatId: 'best', ext: 'mp4', filesize: null }
    ];

    videoFormats.forEach((vf, index) => {
      const chip = document.createElement('div');
      chip.className = `quality-chip ${index === 0 ? 'selected' : ''}`;
      chip.dataset.formatId = vf.formatId;
      chip.dataset.resolution = vf.resolution;
      chip.dataset.ext = vf.ext || 'mp4';
      chip.dataset.type = 'video';

      const sizeStr = vf.filesize ? formatBytes(vf.filesize) : 'HD Stream';
      chip.innerHTML = `
        <span class="chip-res">${vf.resolution}</span>
        <span class="chip-ext">${vf.ext || 'mp4'}</span>
        <span class="chip-size">${sizeStr}</span>
        ${index === 0 ? '<span class="chip-badge">Best</span>' : ''}
      `;

      chip.addEventListener('click', () => selectQualityChip(chip, 'video'));
      videoQualitiesList.appendChild(chip);
    });

    // Populate Audio Qualities
    audioQualitiesList.innerHTML = '';
    const audioFormats = (data.audioFormats && data.audioFormats.length) ? data.audioFormats : [
      { quality: '320 kbps', formatId: 'best', ext: 'mp3', filesize: null },
      { quality: '192 kbps', formatId: 'best', ext: 'mp3', filesize: null },
      { quality: '128 kbps', formatId: 'best', ext: 'mp3', filesize: null }
    ];

    audioFormats.forEach((af, index) => {
      const chip = document.createElement('div');
      chip.className = `quality-chip ${index === 0 ? 'selected' : ''}`;
      chip.dataset.formatId = af.formatId;
      chip.dataset.resolution = af.quality;
      chip.dataset.ext = 'mp3';
      chip.dataset.type = 'audio';

      const sizeStr = af.filesize ? formatBytes(af.filesize) : 'Audio Track';
      chip.innerHTML = `
        <span class="chip-res">${af.quality}</span>
        <span class="chip-ext">MP3 Audio</span>
        <span class="chip-size">${sizeStr}</span>
        ${index === 0 ? '<span class="chip-badge">HQ</span>' : ''}
      `;

      chip.addEventListener('click', () => selectQualityChip(chip, 'audio'));
      audioQualitiesList.appendChild(chip);
    });

    // Default selection
    selectedOption = {
      type: 'video',
      formatId: videoFormats[0].formatId,
      quality: videoFormats[0].resolution,
      ext: videoFormats[0].ext || 'mp4'
    };
    updateCtaLabel();

    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Format Tabs Toggle
  tabVideo.addEventListener('click', () => {
    tabVideo.classList.add('active');
    tabAudio.classList.remove('active');
    videoOptionsPanel.classList.add('active');
    audioOptionsPanel.classList.remove('active');

    const firstChip = videoQualitiesList.querySelector('.quality-chip');
    if (firstChip) selectQualityChip(firstChip, 'video');
  });

  tabAudio.addEventListener('click', () => {
    tabAudio.classList.add('active');
    tabVideo.classList.remove('active');
    audioOptionsPanel.classList.add('active');
    videoOptionsPanel.classList.remove('active');

    const firstChip = audioQualitiesList.querySelector('.quality-chip');
    if (firstChip) selectQualityChip(firstChip, 'audio');
  });

  function selectQualityChip(chip, type) {
    const parent = type === 'video' ? videoQualitiesList : audioQualitiesList;
    parent.querySelectorAll('.quality-chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');

    selectedOption = {
      type: type,
      formatId: chip.dataset.formatId,
      quality: chip.dataset.resolution,
      ext: chip.dataset.ext
    };

    updateCtaLabel();
  }

  function updateCtaLabel() {
    ctaLabel.textContent = `Download ${selectedOption.quality} (${selectedOption.ext.toUpperCase()})`;
  }

  // Single Media Download Trigger
  startDownloadBtn.addEventListener('click', async () => {
    if (!currentMediaData) return;
    initiateDownloadTask({
      url: currentMediaData.webpage_url || urlInput.value.trim(),
      formatId: selectedOption.formatId,
      type: selectedOption.type,
      quality: selectedOption.quality,
      title: currentMediaData.title,
      ext: selectedOption.ext,
      requiresImpersonate: currentMediaData.requiresImpersonate,
      usedLegacySSL: currentMediaData.usedLegacySSL,
      directUrl: currentMediaData.directUrl,
      isDirectDownload: currentMediaData.isDirectDownload
    });
  });

  // =========================================================
  // 2. CAROUSEL / PHOTO GALLERY RENDERER
  // =========================================================
  function renderCarouselResult(data) {
    const items = data.items || [];
    carouselBadgeText.textContent = `${items.length} ${data.type === 'bulk_gallery' ? 'Media Items Discovered' : (items.length === 1 ? 'Photo' : 'Photos / Slides')}`;
    carouselPlatform.textContent = data.extractor || 'Bulk Harvester';
    carouselTitle.textContent = data.title || 'Bulk Media Collection';
    carouselUploader.textContent = data.uploader ? `By ${data.uploader}` : '';

    // Calculate Media Counts for Filters
    const videoItems = items.filter(it => it.mediaType === 'video' || it.ext === 'mp4');
    const gifItems = items.filter(it => it.mediaType === 'gif' || it.ext === 'gif' || /\.gif/i.test(it.url || ''));
    const audioItems = items.filter(it => it.mediaType === 'audio' || it.ext === 'mp3' || it.audioTrack);
    const imageItems = items.filter(it => !videoItems.includes(it) && !gifItems.includes(it) && !audioItems.includes(it));

    if (filterCountAll) filterCountAll.textContent = items.length;
    if (filterCountVideo) filterCountVideo.textContent = videoItems.length;
    if (filterCountImage) filterCountImage.textContent = imageItems.length;
    if (filterCountGif) filterCountGif.textContent = gifItems.length;
    if (filterCountAudio) filterCountAudio.textContent = audioItems.length;

    // Filter Toolbar Interaction
    let currentFilter = 'all';
    if (bulkFilterBtns && bulkFilterBtns.length > 0) {
      bulkFilterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
        btn.onclick = (e) => {
          e.preventDefault();
          bulkFilterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentFilter = btn.dataset.filter;
          applyFilter(currentFilter);
        };
      });
    }

    function applyFilter(filter) {
      const cards = carouselGrid.querySelectorAll('.carousel-item-card');
      cards.forEach(card => {
        const itemType = card.dataset.mediaType;
        const hasAudio = card.dataset.hasAudio === 'true';
        if (filter === 'all' || itemType === filter || (filter === 'audio' && hasAudio)) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    }

    // Select all items by default
    selectedCarouselItems = new Set(items.map(it => it.id));
    updateCarouselSelectionUI(items);

    carouselGrid.innerHTML = '';
    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'carousel-item-card selected';
      card.dataset.id = item.id;

      const isVideo = item.mediaType === 'video' || item.ext === 'mp4';
      const isGif = item.mediaType === 'gif' || item.ext === 'gif' || /\.gif/i.test(item.url || '');
      const isAudio = item.mediaType === 'audio' || item.ext === 'mp3';
      const hasAudioTrack = Boolean(item.audioTrack && item.audioTrack.url);
      const typeCategory = isAudio ? 'audio' : (isVideo ? 'video' : (isGif ? 'gif' : 'image'));
      card.dataset.mediaType = typeCategory;
      card.dataset.hasAudio = String(isAudio || hasAudioTrack);

      let tagClass = 'image-tag';
      let mediaTag = item.resolution || 'PHOTO';
      if (isAudio) {
        tagClass = 'audio-tag';
        mediaTag = '🎵 MP3 Audio';
      } else if (isVideo) {
        tagClass = 'video-tag';
        mediaTag = item.duration ? `🎬 MP4 • ${item.duration}` : (item.resolution ? `🎬 ${item.resolution}` : '🎬 MP4');
      } else if (isGif) {
        tagClass = 'gif-tag';
        mediaTag = '🎞️ GIF';
      }

      card.innerHTML = `
        <div class="carousel-checkbox-wrap">
          <div class="custom-media-checkbox">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
        <span class="carousel-res-tag ${tagClass}">${mediaTag}</span>
        <img src="${item.thumbnail || item.url}" alt="Item ${index + 1}" class="carousel-item-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300'" />
        ${hasAudioTrack ? `
          <button type="button" class="carousel-quick-music-btn" title="Download Soundtrack: ${escapeHtml(item.audioTrack.title || 'Music')}">
            🎵
          </button>
        ` : ''}
        <button type="button" class="carousel-quick-download-btn" title="Download this file directly">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      `;

      // Click on card or checkbox toggles selection
      card.addEventListener('click', (e) => {
        // If clicked on music button, download audio track
        if (e.target.closest('.carousel-quick-music-btn') && item.audioTrack) {
          e.stopPropagation();
          downloadAudioTrack(item.audioTrack, index + 1);
          return;
        }

        // If clicked on quick download button, download single item
        if (e.target.closest('.carousel-quick-download-btn')) {
          e.stopPropagation();
          downloadSingleImage(item, index + 1);
          return;
        }

        if (selectedCarouselItems.has(item.id)) {
          selectedCarouselItems.delete(item.id);
          card.classList.remove('selected');
        } else {
          selectedCarouselItems.add(item.id);
          card.classList.add('selected');
        }
        updateCarouselSelectionUI(items);
      });

      carouselGrid.appendChild(card);
    });

    // Toggle Select All (intelligently acts on currently filtered items if filtered)
    carouselSelectAllBtn.onclick = () => {
      const visibleCards = Array.from(carouselGrid.querySelectorAll('.carousel-item-card')).filter(c => c.style.display !== 'none');
      const visibleIds = visibleCards.map(c => c.dataset.id);
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedCarouselItems.has(id));

      if (allVisibleSelected) {
        visibleIds.forEach(id => selectedCarouselItems.delete(id));
        visibleCards.forEach(c => c.classList.remove('selected'));
      } else {
        visibleIds.forEach(id => selectedCarouselItems.add(id));
        visibleCards.forEach(c => c.classList.add('selected'));
      }
      updateCarouselSelectionUI(items);
    };

    // Download Selected Items Action
    carouselDownloadSelectedBtn.onclick = () => {
      const selectedList = items.filter(it => selectedCarouselItems.has(it.id));
      if (selectedList.length === 0) return;

      if (selectedList.length === 1) {
        downloadSingleImage(selectedList[0], 1);
      } else {
        // Download as ZIP for multiple selections
        downloadBatchZip(selectedList, data.title);
      }
    };

    // Download All as ZIP Action
    carouselDownloadZipBtn.onclick = () => {
      const selectedList = items.filter(it => selectedCarouselItems.has(it.id));
      const listToZip = selectedList.length > 0 ? selectedList : items;
      downloadBatchZip(listToZip, data.title);
    };

    carouselCard.classList.remove('hidden');
    carouselCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function updateCarouselSelectionUI(items) {
    const total = items.length;
    const selected = selectedCarouselItems.size;
    carouselSelectionCount.textContent = `${selected} of ${total} Selected`;
    carouselSelectAllBtn.querySelector('span').textContent = (selected === total && total > 0) ? 'Deselect All' : 'Select All';
    carouselCtaText.textContent = `Download Selected (${selected})`;
    carouselDownloadSelectedBtn.disabled = selected === 0;
    carouselDownloadSelectedBtn.style.opacity = selected === 0 ? '0.5' : '1';
  }

  function downloadSingleImage(item, index) {
    const ext = item.ext || (item.mediaType === 'video' ? 'mp4' : (item.mediaType === 'gif' ? 'gif' : 'jpg'));
    const safeTitle = (item.title || currentMediaData?.title || 'media').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const filename = `${safeTitle}_${index}.${ext}`;
    const proxyUrl = `/api/download/image?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(filename)}`;
    
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    saveToHistory({
      title: `${item.title || currentMediaData?.title || 'Media'} (#${index})`,
      thumbnail: item.thumbnail || item.url,
      quality: item.resolution || item.mediaType || 'Original',
      format: ext.toUpperCase(),
      downloadUrl: proxyUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }

  function downloadAudioTrack(audioTrack, index) {
    if (!audioTrack || !audioTrack.url) return;
    const safeTitle = (audioTrack.title || 'Soundtrack').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const filename = `${safeTitle}_audio_${index}.mp3`;
    const proxyUrl = `/api/download/image?url=${encodeURIComponent(audioTrack.url)}&filename=${encodeURIComponent(filename)}`;

    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    saveToHistory({
      title: `${audioTrack.title || 'Audio'} — ${audioTrack.artist || 'Original'}`,
      thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
      quality: 'MP3 Audio',
      format: 'MP3',
      downloadUrl: proxyUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }

  async function downloadBatchZip(itemsToZip, title) {
    progressCard.classList.remove('hidden');
    readyActionBox.classList.add('hidden');
    progressFill.style.width = '20%';
    progressPercent.textContent = 'Preparing...';
    progressHeading.textContent = `Packaging ${itemsToZip.length} photos into ZIP archive...`;
    statSpeed.textContent = 'Archiving';
    statSize.textContent = `${itemsToZip.length} files`;
    statEta.textContent = 'Please wait';
    statFormat.textContent = 'ZIP';
    progressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const response = await fetch('/api/download/batch-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'GrabNow_Photos',
          items: itemsToZip
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create ZIP package on server.');
      }

      const blob = await response.blob();
      const zipUrl = window.URL.createObjectURL(blob);
      const safeTitle = (title || 'GrabNow_Photos').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
      const filename = `${safeTitle}.zip`;

      progressFill.style.width = '100%';
      progressPercent.textContent = '100%';
      progressHeading.textContent = 'ZIP Archive Ready! 🎉';
      statSpeed.textContent = 'Complete';
      statEta.textContent = '00:00';

      btnSaveFile.href = zipUrl;
      btnSaveFile.setAttribute('download', filename);
      readyActionBox.classList.remove('hidden');
      btnSaveFile.click();

      saveToHistory({
        title: `${title || 'Photos'} (${itemsToZip.length} files ZIP)`,
        thumbnail: itemsToZip[0]?.thumbnail || '',
        quality: `${itemsToZip.length} Photos`,
        format: 'ZIP',
        downloadUrl: zipUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (err) {
      progressHeading.textContent = 'ZIP Creation Failed';
      showError(err.message || 'Error occurred while packing ZIP file.');
    }
  }

  // =========================================================
  // 3. PLAYLIST / COLLECTION RENDERER
  // =========================================================
  function renderPlaylistResult(data) {
    const items = data.items || [];
    if (items.length === 0) {
      showError('No downloadable media items found in this collection.');
      return;
    }
    playlistCover.src = data.thumbnail || (items[0] && items[0].thumbnail) || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600';
    playlistCountBadge.textContent = `${items.length} ${items.length === 1 ? 'Video' : 'Videos'}`;
    playlistPlatform.textContent = data.extractor || 'Playlist';
    playlistTitle.textContent = data.title || 'Media Playlist';
    playlistUploader.textContent = data.uploader ? `By ${data.uploader}` : '';

    // Select all items by default
    selectedPlaylistItems = new Set(items.map(it => it.id));
    updatePlaylistSelectionUI(items);

    playlistItemsList.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'playlist-item-row selected';
      row.dataset.id = item.id;

      const idxStr = String(item.index).padStart(2, '0');

      row.innerHTML = `
        <span class="playlist-item-index">${idxStr}</span>
        <div class="custom-media-checkbox">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="playlist-item-thumb-box">
          <img src="${item.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80'}" alt="" class="playlist-item-thumb" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80'" />
          <span class="playlist-item-duration">${item.duration || 'Video'}</span>
        </div>
        <div class="playlist-item-details">
          <div class="playlist-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="playlist-item-uploader">${escapeHtml(item.uploader || '')}</div>
        </div>
        <button type="button" class="btn-grab-single playlist-item-action" title="Download this video immediately">
          Grab Video
        </button>
      `;

      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-grab-single')) {
          e.stopPropagation();
          initiateDownloadTask({
            url: item.url,
            formatId: 'best',
            type: 'video',
            quality: 'Best Video',
            title: item.title,
            ext: 'mp4',
            requiresImpersonate: true
          });
          return;
        }

        if (selectedPlaylistItems.has(item.id)) {
          selectedPlaylistItems.delete(item.id);
          row.classList.remove('selected');
        } else {
          selectedPlaylistItems.add(item.id);
          row.classList.add('selected');
        }
        updatePlaylistSelectionUI(items);
      });

      playlistItemsList.appendChild(row);
    });

    // Toggle Select All
    playlistSelectAllBtn.onclick = () => {
      if (selectedPlaylistItems.size === items.length) {
        selectedPlaylistItems.clear();
        playlistItemsList.querySelectorAll('.playlist-item-row').forEach(r => r.classList.remove('selected'));
      } else {
        selectedPlaylistItems = new Set(items.map(it => it.id));
        playlistItemsList.querySelectorAll('.playlist-item-row').forEach(r => r.classList.add('selected'));
      }
      updatePlaylistSelectionUI(items);
    };

    // Download Selected Videos Action (Single or Multi-Threaded Batch)
    playlistDownloadSelectedBtn.onclick = () => {
      const selectedList = items.filter(it => selectedPlaylistItems.has(it.id));
      if (selectedList.length === 0) return;

      if (selectedList.length === 1) {
        initiateDownloadTask({
          url: selectedList[0].url,
          formatId: 'best',
          type: 'video',
          quality: 'Best Video',
          title: selectedList[0].title,
          ext: 'mp4',
          requiresImpersonate: true
        });
      } else {
        startBatchPlaylistDownload(selectedList, currentMediaData ? currentMediaData.title : 'Media Playlist');
      }
    };

    // Dedicated Batch ZIP Download Button
    playlistBatchDownloadBtn.onclick = () => {
      const selectedList = items.filter(it => selectedPlaylistItems.has(it.id));
      if (selectedList.length === 0) return;
      startBatchPlaylistDownload(selectedList, currentMediaData ? currentMediaData.title : 'Media Playlist');
    };

    playlistCard.classList.remove('hidden');
    playlistCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function updatePlaylistSelectionUI(items) {
    const total = items.length;
    const selected = selectedPlaylistItems.size;
    playlistSelectionCount.textContent = `${selected} of ${total} Selected`;
    playlistSelectAllBtn.querySelector('span').textContent = (selected === total) ? 'Deselect All' : 'Select All';
    playlistCtaText.textContent = `Download Selected Videos (${selected})`;
    playlistDownloadSelectedBtn.disabled = selected === 0;
    playlistDownloadSelectedBtn.style.opacity = selected === 0 ? '0.5' : '1';
    playlistBatchDownloadBtn.disabled = selected === 0;
    playlistBatchDownloadBtn.style.opacity = selected === 0 ? '0.5' : '1';
  }

  // =========================================================
  // 4. DOWNLOAD TASK INITIATION & REALTIME TRACKING
  // =========================================================
  async function initiateDownloadTask(params) {
    if (activePollInterval) {
      clearInterval(activePollInterval);
    }

    progressCard.classList.remove('hidden');
    readyActionBox.classList.add('hidden');
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressHeading.textContent = `Initiating: ${params.title || 'Media file'}...`;
    statSpeed.textContent = 'Connecting...';
    statSize.textContent = '--';
    statEta.textContent = '--:--';
    statFormat.textContent = (params.ext || 'MP4').toUpperCase();

    progressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const response = await fetch('/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: params.url,
          formatId: params.formatId || 'best',
          type: params.type || 'video',
          quality: params.quality || 'best',
          title: params.title,
          requiresImpersonate: params.requiresImpersonate !== false,
          usedLegacySSL: params.usedLegacySSL,
          directUrl: params.directUrl,
          isDirectDownload: params.isDirectDownload
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start download process.');
      }

      trackJobProgress(data.jobId, params);
    } catch (err) {
      progressHeading.textContent = 'Download error';
      statSpeed.textContent = 'Failed';
      showError(err.message || 'Error occurred while processing file.');
    }
  }

  function trackJobProgress(jobId, params) {
    activePollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/download/status/${jobId}`);
        if (!res.ok) {
          clearInterval(activePollInterval);
          throw new Error('Lost connection to download task.');
        }

        const job = await res.json();

        const progress = Math.min(100, Math.max(0, job.progress || 0));
        progressFill.style.width = `${progress}%`;
        progressPercent.textContent = `${Math.round(progress)}%`;

        if (job.status === 'downloading') {
          progressHeading.textContent = 'Downloading media streams...';
          statSpeed.textContent = job.speed || '-- KiB/s';
          statSize.textContent = job.fileSize || '--';
          statEta.textContent = job.eta || '--:--';
        }

        if (job.status === 'ready') {
          clearInterval(activePollInterval);
          progressFill.style.width = '100%';
          progressPercent.textContent = '100%';
          progressHeading.textContent = 'Media Ready for Download! 🎉';
          statSpeed.textContent = 'Complete';
          statEta.textContent = '00:00';

          btnSaveFile.href = job.downloadUrl || `/api/download/file/${jobId}`;
          const safeName = job.filename || `${(params.title || 'media').replace(/[^a-zA-Z0-9_-]/g, '_')}.${params.ext || 'mp4'}`;
          btnSaveFile.setAttribute('download', safeName);
          readyActionBox.classList.remove('hidden');

          btnSaveFile.click();

          saveToHistory({
            title: params.title || 'Media File',
            thumbnail: params.thumbnail || (currentMediaData && currentMediaData.thumbnail) || '',
            quality: params.quality || 'HD',
            format: (params.ext || 'MP4').toUpperCase(),
            downloadUrl: job.downloadUrl || `/api/download/file/${jobId}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }

        if (job.status === 'error') {
          clearInterval(activePollInterval);
          progressHeading.textContent = 'Processing Failed';
          statSpeed.textContent = 'Error';
          showError(job.error || 'The download encountered an error.');
        }
      } catch (err) {
        clearInterval(activePollInterval);
        progressHeading.textContent = 'Network Disruption';
      }
    }, 900);
  }

  // =========================================================
  // MULTI-THREADED PLAYLIST BATCH CONTROLLER
  // =========================================================
  async function startBatchPlaylistDownload(selectedItems, playlistTitle) {
    if (!selectedItems || selectedItems.length === 0) return;

    if (activeBatchPollInterval) {
      clearInterval(activeBatchPollInterval);
      activeBatchPollInterval = null;
    }
    if (activePollInterval) {
      clearInterval(activePollInterval);
      activePollInterval = null;
    }

    progressCard.classList.add('hidden');
    batchProgressCard.classList.remove('hidden');
    batchReadyBox.classList.add('hidden');

    batchHeading.textContent = `Starting batch download (${selectedItems.length} items)...`;
    batchProgressFill.style.width = '0%';
    batchProgressPercent.textContent = '0%';
    batchCompletedCount.textContent = '0';
    batchDownloadingCount.textContent = '0';
    batchFailedCount.textContent = '0';
    batchQueuedCount.textContent = `${selectedItems.length}`;

    // Render initial item rows
    batchItemsList.innerHTML = '';
    selectedItems.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'batch-item-row';
      row.id = `batch-row-${item.id || idx + 1}`;
      row.innerHTML = `
        <span class="batch-item-index">${idx + 1}</span>
        <div class="batch-item-info">
          <div class="batch-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="batch-item-meta" id="batch-item-meta-${item.id || idx + 1}">Queued for download pool</div>
        </div>
        <div class="batch-item-progress-wrap">
          <div class="batch-item-progress-bar">
            <div class="batch-item-progress-fill" id="batch-item-fill-${item.id || idx + 1}" style="width: 0%;"></div>
          </div>
        </div>
        <div class="batch-item-status" id="batch-item-status-${item.id || idx + 1}">
          <span class="batch-status-badge badge-queued">Queued</span>
        </div>
      `;
      batchItemsList.appendChild(row);
    });

    batchAutoDownloadedItems = new Set();
    batchProgressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const response = await fetch('/api/download/playlist-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistTitle: playlistTitle || 'Media Playlist',
          items: selectedItems,
          format: 'video',
          quality: 'best'
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize batch download.');
      }

      activeBatchId = data.batchId;
      trackBatchProgress(data.batchId);
    } catch (err) {
      batchHeading.textContent = 'Batch Download Error';
      showError(err.message || 'Error occurred while queuing playlist items.');
    }
  }

  function trackBatchProgress(batchId) {
    if (activeBatchPollInterval) {
      clearInterval(activeBatchPollInterval);
    }

    activeBatchPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/download/batch-status/${batchId}`);
        if (!res.ok) {
          clearInterval(activeBatchPollInterval);
          activeBatchPollInterval = null;
          throw new Error('Lost connection to batch downloader.');
        }

        const data = await res.json();

        // Update overall stats chips
        batchCompletedCount.textContent = data.completedCount;
        batchDownloadingCount.textContent = data.downloadingCount;
        batchFailedCount.textContent = data.failedCount;
        batchQueuedCount.textContent = data.queuedCount;

        const percent = Math.min(100, Math.max(0, data.progress || 0));
        batchProgressFill.style.width = `${percent}%`;
        batchProgressPercent.textContent = `${Math.round(percent)}%`;

        if (data.status === 'processing') {
          batchHeading.textContent = `Downloading Playlist (${data.completedCount}/${data.total} finished)...`;
        } else if (data.status === 'packaging') {
          batchHeading.textContent = `Packaging completed videos into ZIP archive...`;
        } else if (data.status === 'ready') {
          batchHeading.textContent = `🎉 Playlist Download Complete & ZIP Ready!`;
        } else if (data.status === 'failed') {
          batchHeading.textContent = `Batch Finished (${data.completedCount} done, ${data.failedCount} failed)`;
        }

        // Show/hide instant "Download Ready as ZIP" button
        if (batchPackageNowBtn) {
          if (data.completedCount > 0 && !data.zipReady) {
            batchPackageNowBtn.classList.remove('hidden');
            if (batchReadyNum) batchReadyNum.textContent = data.completedCount;
          } else {
            batchPackageNowBtn.classList.add('hidden');
          }
        }

        // Update each item row
        data.items.forEach(it => {
          const rowId = it.id;
          const fillEl = document.getElementById(`batch-item-fill-${rowId}`);
          const statusEl = document.getElementById(`batch-item-status-${rowId}`);
          const metaEl = document.getElementById(`batch-item-meta-${rowId}`);

          if (fillEl) {
            fillEl.style.width = `${Math.min(100, Math.max(0, it.progress || 0))}%`;
          }

          if (metaEl) {
            if (it.status === 'downloading') {
              metaEl.textContent = `${it.speed || '--'} • ETA ${it.eta || '--'} • ${it.fileSize || '--'}`;
            } else if (it.status === 'complete') {
              metaEl.innerHTML = `<span class="saved-pill">✓ Saved to server (${it.fileSize || 'Ready'})</span>`;
            } else if (it.status === 'retrying') {
              metaEl.textContent = 'Connection reset, auto-retrying with fallback...';
            } else if (it.status === 'failed') {
              metaEl.textContent = it.error ? it.error.slice(0, 45) : 'Failed';
            } else {
              metaEl.textContent = 'Queued in pool';
            }
          }

          if (statusEl) {
            if (it.status === 'queued') {
              statusEl.innerHTML = `<span class="batch-status-badge badge-queued">Queued</span>`;
            } else if (it.status === 'downloading') {
              statusEl.innerHTML = `<span class="batch-status-badge badge-downloading">${it.progress ? Math.round(it.progress) + '%' : 'Active'}</span>`;
            } else if (it.status === 'retrying') {
              statusEl.innerHTML = `<span class="batch-status-badge badge-retrying">Retry</span>`;
            } else if (it.status === 'complete') {
              const downloadUrl = it.downloadUrl || `/api/download/batch-item/${batchId}/${it.id}`;
              const filename = it.filename || `${(it.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
              statusEl.innerHTML = `
                <a href="${downloadUrl}" download="${filename}" class="btn-item-save-direct" title="Save this video to your computer">Save to PC ↓</a>
              `;

              // Auto-save each video to device as soon as it completes!
              if (batchAutoSaveToggle && batchAutoSaveToggle.checked && !batchAutoDownloadedItems.has(it.id)) {
                batchAutoDownloadedItems.add(it.id);
                triggerDirectBrowserDownload(downloadUrl, filename);
              }
            } else if (it.status === 'failed') {
              statusEl.innerHTML = `<button type="button" class="batch-item-retry-btn" data-batch-id="${batchId}" data-item-id="${it.id}">Retry</button>`;
            }
          }
        });

        // Wire individual retry buttons
        batchItemsList.querySelectorAll('.batch-item-retry-btn').forEach(btn => {
          btn.onclick = async (e) => {
            e.stopPropagation();
            const bId = btn.getAttribute('data-batch-id');
            const itId = btn.getAttribute('data-item-id');
            btn.disabled = true;
            btn.textContent = 'Queuing...';
            try {
              await fetch(`/api/download/batch-retry/${bId}/${itId}`, { method: 'POST' });
              if (!activeBatchPollInterval) {
                trackBatchProgress(bId);
              }
            } catch (err) {
              btn.textContent = 'Retry Failed';
            }
          };
        });

        // Handle ZIP ready state
        if (data.zipReady && data.zipDownloadUrl) {
          batchSaveZip.href = data.zipDownloadUrl;
          const zipName = `${(data.title || 'Playlist').replace(/[^a-zA-Z0-9_-]/g, '_')}_Collection.zip`;
          batchSaveZip.setAttribute('download', zipName);
          batchReadyBox.classList.remove('hidden');
          if (batchPackageNowBtn) batchPackageNowBtn.classList.add('hidden');

          if (data.failedCount === 0) {
            batchRetryFailedBtn.classList.add('hidden');
          } else {
            batchRetryFailedBtn.classList.remove('hidden');
          }

          // Auto-trigger ZIP download to device once ready
          if (!batchAutoDownloadedItems.has('zip_' + batchId)) {
            batchAutoDownloadedItems.add('zip_' + batchId);
            triggerDirectBrowserDownload(data.zipDownloadUrl, zipName);
          }

          saveToHistory({
            title: `${data.title || 'Playlist'} (${data.completedCount} items)`,
            thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200',
            quality: 'ZIP Package',
            format: 'ZIP',
            downloadUrl: data.zipDownloadUrl,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }

        // Terminal states: stop polling
        if (data.status === 'ready' && data.zipReady) {
          clearInterval(activeBatchPollInterval);
          activeBatchPollInterval = null;
        } else if (data.status === 'failed' && !data.zipReady) {
          clearInterval(activeBatchPollInterval);
          activeBatchPollInterval = null;
        }
      } catch (err) {
        // Continue polling
      }
    }, 850);
  }

  // Trigger local browser download without navigating away
  function triggerDirectBrowserDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.setAttribute('download', filename);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch (_) {}
    }, 1500);
  }

  // Instant Package Completed Items into ZIP on-demand
  if (batchPackageNowBtn) {
    batchPackageNowBtn.addEventListener('click', async () => {
      if (!activeBatchId) return;
      batchPackageNowBtn.disabled = true;
      batchPackageNowBtn.innerHTML = `<span>Packaging ZIP...</span>`;
      try {
        const res = await fetch(`/api/download/batch-package-now/${activeBatchId}`, { method: 'POST' });
        const resData = await res.json();
        if (res.ok) {
          batchHeading.textContent = 'Packaging completed videos into ZIP archive...';
        } else {
          showError(resData.error || 'Could not package videos at this time.');
        }
      } catch (err) {
        showError('Network error while packaging ZIP.');
      } finally {
        setTimeout(() => {
          if (batchPackageNowBtn) batchPackageNowBtn.disabled = false;
        }, 3000);
      }
    });
  }

  // Retry all failed items
  batchRetryFailedBtn.addEventListener('click', async () => {
    if (!activeBatchId) return;
    batchRetryFailedBtn.disabled = true;
    batchRetryFailedBtn.textContent = 'Retrying Failed Items...';

    try {
      const res = await fetch(`/api/download/batch-status/${activeBatchId}`);
      if (res.ok) {
        const data = await res.json();
        const failedItems = data.items.filter(it => it.status === 'failed');
        for (const it of failedItems) {
          await fetch(`/api/download/batch-retry/${activeBatchId}/${it.id}`, { method: 'POST' });
        }
        batchHeading.textContent = `Retrying ${failedItems.length} failed items...`;
        trackBatchProgress(activeBatchId);
      }
    } catch (err) {
      console.error('Retry all error:', err);
    } finally {
      batchRetryFailedBtn.disabled = false;
      batchRetryFailedBtn.textContent = 'Retry Failed Items';
    }
  });

  btnAnother.addEventListener('click', () => {
    progressCard.classList.add('hidden');
    batchProgressCard.classList.add('hidden');
    resultCard.classList.add('hidden');
    carouselCard.classList.add('hidden');
    playlistCard.classList.add('hidden');
    urlInput.value = '';
    clearBtn.classList.add('hidden');
    urlInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // =========================================================
  // 5. DOWNLOAD HISTORY STORAGE (localStorage)
  // =========================================================
  function loadHistory() {
    const items = JSON.parse(localStorage.getItem('grabnow_history') || '[]');
    renderHistory(items);
  }

  function saveToHistory(item) {
    const items = JSON.parse(localStorage.getItem('grabnow_history') || '[]');
    items.unshift(item);
    if (items.length > 20) items.pop();
    localStorage.setItem('grabnow_history', JSON.stringify(items));
    renderHistory(items);
  }

  function renderHistory(items) {
    historyCount.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
    clearHistoryBtn.classList.toggle('hidden', items.length === 0);
    emptyHistoryMsg.classList.toggle('hidden', items.length > 0);

    historyList.querySelectorAll('.history-item-card').forEach(el => el.remove());

    items.forEach(it => {
      const card = document.createElement('div');
      card.className = 'history-item-card';
      card.innerHTML = `
        <img src="${it.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200'}" alt="" class="history-thumb" />
        <div class="history-info">
          <div class="history-title" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
          <div class="history-meta">${it.quality} • ${it.format} • ${it.timestamp}</div>
        </div>
      `;
      historyList.appendChild(card);
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem('grabnow_history');
    renderHistory([]);
  });

  // =========================================================
  // 6. COOKIES & AUTHENTICATION MODAL CONTROLLER
  // =========================================================
  const cookieSettingsBtn = document.getElementById('cookie-settings-btn');
  const cookieModal = document.getElementById('cookie-modal');
  const cookieModalClose = document.getElementById('cookie-modal-close');
  const cookieTextInput = document.getElementById('cookie-text-input');
  const cookieSaveBtn = document.getElementById('cookie-save-btn');
  const cookieClearBtn = document.getElementById('cookie-clear-btn');
  const cookieStatusMsg = document.getElementById('cookie-status-msg');
  const cookieActiveDot = document.getElementById('cookie-active-dot');

  async function checkCookieStatus() {
    try {
      const res = await fetch('/api/cookies/status');
      if (res.ok) {
        const data = await res.json();
        if (cookieActiveDot) {
          cookieActiveDot.classList.toggle('hidden', !data.active);
        }
      }
    } catch (_) {}
  }

  if (cookieSettingsBtn) {
    cookieSettingsBtn.addEventListener('click', () => {
      if (cookieModal) cookieModal.classList.remove('hidden');
    });
  }

  if (cookieModalClose) {
    cookieModalClose.addEventListener('click', () => {
      if (cookieModal) cookieModal.classList.add('hidden');
    });
  }

  if (cookieModal) {
    cookieModal.addEventListener('click', (e) => {
      if (e.target === cookieModal) cookieModal.classList.add('hidden');
    });
  }

  if (cookieSaveBtn) {
    cookieSaveBtn.addEventListener('click', async () => {
      const text = cookieTextInput ? cookieTextInput.value : '';
      cookieStatusMsg.textContent = 'Saving session cookies...';
      cookieStatusMsg.className = 'cookie-modal-status';
      try {
        const res = await fetch('/api/cookies/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookies: text })
        });
        const data = await res.json();
        if (res.ok) {
          cookieStatusMsg.textContent = data.message;
          cookieStatusMsg.className = 'cookie-modal-status success';
          checkCookieStatus();
          setTimeout(() => {
            if (cookieModal) cookieModal.classList.add('hidden');
          }, 1200);
        } else {
          cookieStatusMsg.textContent = data.error || 'Failed to save cookies.';
          cookieStatusMsg.className = 'cookie-modal-status error';
        }
      } catch (err) {
        cookieStatusMsg.textContent = 'Error connecting to server.';
        cookieStatusMsg.className = 'cookie-modal-status error';
      }
    });
  }

  if (cookieClearBtn) {
    cookieClearBtn.addEventListener('click', async () => {
      if (cookieTextInput) cookieTextInput.value = '';
      cookieStatusMsg.textContent = 'Clearing cookies...';
      cookieStatusMsg.className = 'cookie-modal-status';
      try {
        const res = await fetch('/api/cookies/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookies: '' })
        });
        const data = await res.json();
        cookieStatusMsg.textContent = data.message;
        cookieStatusMsg.className = 'cookie-modal-status success';
        checkCookieStatus();
      } catch (err) {
        cookieStatusMsg.textContent = 'Failed to clear cookies.';
        cookieStatusMsg.className = 'cookie-modal-status error';
      }
    });
  }

  checkCookieStatus();

  // Harvester Modal Event Listeners
  if (liveHarvesterBtn && harvesterModal) {
    liveHarvesterBtn.addEventListener('click', () => {
      harvesterModal.classList.remove('hidden');
    });
  }
  if (harvesterModalClose && harvesterModal) {
    harvesterModalClose.addEventListener('click', () => {
      harvesterModal.classList.add('hidden');
    });
  }
  if (harvesterModalCloseBtn && harvesterModal) {
    harvesterModalCloseBtn.addEventListener('click', () => {
      harvesterModal.classList.add('hidden');
    });
  }
  if (harvesterModal) {
    harvesterModal.addEventListener('click', (e) => {
      if (e.target === harvesterModal) harvesterModal.classList.add('hidden');
    });
  }
  const appOrigin = window.location.origin;
  const standaloneScript = `javascript:(function(){const seen=new Set(),items=[];const uMatch=location.pathname.match(/^\\/([a-zA-Z0-9._]+)/);const user=uMatch?'@'+uMatch[1]:'@instagram';function bestSrc(srcset){if(!srcset)return null;try{return srcset.split(',').map(s=>{const p=s.trim().split(/\\s+/);return{u:p[0],w:parseInt(p[1]||'0')};}).sort((a,b)=>b.w-a.w)[0]?.u;}catch(_){return null;}}document.querySelectorAll('a[href*=\"/p/\"], a[href*=\"/reel/\"], article, div[role=\"button\"]').forEach((a,idx)=>{const href=a.getAttribute('href')||'';const isReel=href.includes('/reel/');const postUrl=href?new URL(href,location.origin).href:location.href;const img=a.querySelector('img');const vid=a.querySelector('video');if(vid&&vid.src&&!vid.src.startsWith('blob:')&&!seen.has(vid.src)){seen.add(vid.src);items.push({id:'ig_v_'+(idx+1),mediaType:'video',title:'Reel #'+(idx+1)+' ('+user+')',url:vid.src,webpageUrl:postUrl,thumbnail:(img&&(bestSrc(img.srcset)||img.src))||vid.src,resolution:'🎬 HD Video',ext:'mp4'});}if(img){const src=bestSrc(img.srcset)||img.src;if(src&&!seen.has(src)&&!src.includes('rsrc.php')&&!src.includes('logo')&&!src.includes('icon')&&!img.alt?.includes('profile picture')){seen.add(src);let title=(img.alt||'').replace(/^Photo by.*?on.*?May be an image of\\s*/i,'').trim();title=title?title.slice(0,70):'Post #'+(idx+1)+' ('+user+')';items.push({id:'ig_img_'+(idx+1),mediaType:isReel?'video':'image',title:title,url:src,webpageUrl:postUrl,thumbnail:src,resolution:isReel?'🎬 Video Reel':'📸 High-Res Photo',ext:'jpg'});}}});document.querySelectorAll('main img, article img, div._aagv img, img[srcset]').forEach((img,idx)=>{const src=bestSrc(img.srcset)||img.src;if(src&&!seen.has(src)&&(src.includes('cdninstagram.com')||src.includes('fbcdn.net'))){if(!img.alt?.toLowerCase().includes('profile picture')&&!img.closest('header')&&!src.includes('rsrc.php')){seen.add(src);items.push({id:'ig_feed_'+(idx+1),mediaType:'image',title:img.alt?img.alt.slice(0,70):'Media #'+(items.length+1)+' ('+user+')',url:src,webpageUrl:location.href,thumbnail:src,resolution:'📸 High-Res Photo',ext:'jpg'});}}});document.querySelectorAll('video').forEach((vid,vIdx)=>{const src=vid.src||vid.querySelector('source')?.src;if(src&&!src.startsWith('blob:')&&!seen.has(src)){seen.add(src);items.push({id:'ig_vid_'+(vIdx+1),mediaType:'video',title:'Video #'+(items.length+1)+' ('+user+')',url:src,webpageUrl:location.href,thumbnail:vid.poster||src,resolution:'🎬 HD Video',ext:'mp4'});}});if(items.length===0){alert('GrabNow: No loaded Instagram media found on this page. Please make sure you are on the Instagram tab (instagram.com/sahadelina/), scroll down to load posts, then click the bookmarklet!');return;}const payload={title:'Instagram '+user+' ('+items.length+' Items)',uploader:user,webpage_url:location.href,thumbnail:items[0].thumbnail,itemCount:items.length,extractor:'Instagram Live Harvester',items:items};try{navigator.clipboard.writeText(JSON.stringify(payload));}catch(_){}const win=window.open('${appOrigin}/#live-harvest','grabnow_app');function send(){if(win&&!win.closed){win.postMessage({type:'GRABNOW_HARVEST_IMPORT',payload:payload},'*');}}send();const timer=setInterval(send,400);setTimeout(()=>clearInterval(timer),4000);const div=document.createElement('div');div.style.cssText='position:fixed;bottom:24px;right:24px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;padding:14px 22px;border-radius:14px;font-weight:700;font-size:14px;z-index:99999999;box-shadow:0 12px 35px rgba(0,0,0,0.5);font-family:-apple-system,sans-serif;display:flex;align-items:center;gap:10px;';div.innerHTML='<span style=\"font-size:18px;\">⚡</span> Harvested '+items.length+' media items! Opening GrabNow...';document.body.appendChild(div);setTimeout(()=>div.remove(),3500);})();`;

  if (bookmarkletLink) bookmarkletLink.href = standaloneScript;
  if (harvesterSnippetInput) harvesterSnippetInput.value = standaloneScript;

  if (copySnippetBtn && harvesterSnippetInput) {
    copySnippetBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(harvesterSnippetInput.value);
      copySnippetBtn.textContent = 'Copied!';
      setTimeout(() => { copySnippetBtn.textContent = 'Copy'; }, 1800);
    });
  }

  const pasteHarvesterJsonBtn = document.getElementById('paste-harvester-json-btn');
  if (pasteHarvesterJsonBtn) {
    pasteHarvesterJsonBtn.addEventListener('click', async () => {
      try {
        let text = '';
        try {
          text = await navigator.clipboard.readText();
        } catch (_) {}
        if (!text) {
          text = prompt('Paste your Harvester JSON data here:');
        }
        if (!text || !text.trim()) return;
        const data = JSON.parse(text);
        if (data && data.items && data.items.length > 0) {
          console.log('[LiveHarvester] ✅ Loaded media from pasted JSON:', data.title);
          currentMediaData = data;
          resultCard.classList.add('hidden');
          playlistCard.classList.add('hidden');
          progressCard.classList.add('hidden');
          batchProgressCard.classList.add('hidden');
          renderCarouselResult(data);
          if (harvesterModal) harvesterModal.classList.add('hidden');
          hideError();
        } else {
          alert('No media items found in the pasted data.');
        }
      } catch (err) {
        alert('Could not parse Harvester JSON. Please make sure you copied the full JSON text.');
      }
    });
  }

  // Cross-Tab Communication via postMessage (bypasses CSP & HTTPS Mixed Content!)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GRABNOW_HARVEST_IMPORT' && event.data.payload) {
      const payload = event.data.payload;
      if (payload.items && payload.items.length > 0) {
        console.log('[LiveHarvester] ✅ Received live payload via postMessage:', payload.title);
        currentMediaData = payload;
        resultCard.classList.add('hidden');
        playlistCard.classList.add('hidden');
        progressCard.classList.add('hidden');
        batchProgressCard.classList.add('hidden');
        renderCarouselResult(payload);
        if (harvesterModal) harvesterModal.classList.add('hidden');
        hideError();
      }
    }
  });

  // Live Harvester Polling & Focus Listener
  async function checkForLiveHarvest() {
    try {
      const res = await fetch('/api/bulk/latest-harvest?consume=true');
      if (res.ok) {
        const data = await res.json();
        if (data && data.active && data.items && data.items.length > 0) {
          console.log('[LiveHarvester] ✅ Received live session from browser:', data.title);
          currentMediaData = data;
          resultCard.classList.add('hidden');
          playlistCard.classList.add('hidden');
          progressCard.classList.add('hidden');
          batchProgressCard.classList.add('hidden');
          renderCarouselResult(data);
          if (harvesterModal) harvesterModal.classList.add('hidden');
          hideError();
        }
      }
    } catch (_) {}
  }

  window.addEventListener('focus', checkForLiveHarvest);
  setInterval(checkForLiveHarvest, 2500);

  // Utilities
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown size';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }
});
