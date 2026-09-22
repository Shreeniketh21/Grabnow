import sys
import os
import json
import re
import urllib.parse
from curl_cffi import requests
from bs4 import BeautifulSoup

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

def clean_reddit_url(url):
    p = urllib.parse.urlparse(url)
    clean = f"{p.scheme}://{p.netloc}{p.path}"
    return clean.rstrip('/')

def extract_reddit(url):
    clean = clean_reddit_url(url)
    
    # 1. Resolve /s/ share shortlinks to canonical comments URL
    if '/s/' in url:
        try:
            r = requests.get(url, impersonate='chrome', timeout=6, allow_redirects=True)
            if r.url and '/comments/' in r.url:
                clean = clean_reddit_url(r.url)
        except Exception:
            pass

    # Extract subreddit and post ID
    m = re.search(r'(?:/r/([^/?#]+))?/comments/([a-z0-9]+)', clean)
    subreddit = m.group(1) if m and m.group(1) else None
    post_id = m.group(2) if m else None

    if not post_id:
        # Check if direct redd.it/post_id
        m_short = re.search(r'redd\.it/([a-z0-9]+)', clean)
        if m_short:
            post_id = m_short.group(1)

    headers = {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Referer': 'https://www.reddit.com/'
    }

    # =========================================================================
    # METHOD 1: sh.reddit.com/embed (Bypasses 429, no login required, full media)
    # =========================================================================
    if post_id:
        embed_urls = []
        if subreddit:
            embed_urls.append(f"https://sh.reddit.com/embed/r/{subreddit}/comments/{post_id}/")
        embed_urls.append(f"https://sh.reddit.com/embed/comments/{post_id}/")

        for embed_url in embed_urls:
            try:
                r_embed = requests.get(embed_url, headers=headers, impersonate='chrome', timeout=8)
                if r_embed.status_code == 200 and len(r_embed.text) > 2000:
                    soup = BeautifulSoup(r_embed.text, 'html.parser')
                    
                    # Extract title
                    h1 = soup.find('h1')
                    title = h1.text.strip() if h1 else None
                    if not title:
                        title_elem = soup.find('title')
                        title = title_elem.text.replace('Reddit - ', '').strip() if title_elem else 'Reddit Post'

                    # Extract author & subreddit
                    author_elem = soup.find(class_=re.compile(r'author|user'))
                    uploader = author_elem.text.strip() if author_elem else (f"r/{subreddit}" if subreddit else "Reddit")

                    # Check shreddit-screenview-data for post details
                    screenview = soup.find('shreddit-screenview-data')
                    post_obj = {}
                    if screenview and screenview.get('data'):
                        try:
                            sv_data = json.loads(screenview['data'])
                            post_obj = sv_data.get('post', {})
                        except Exception:
                            pass

                    # 1. Look for direct video (v.redd.it or packaged-media)
                    video_urls = re.findall(r'https?://(?:v\.redd\.it|packaged-media\.redd\.it)/[^\s\"\'<>]+', r_embed.text)
                    if video_urls:
                        # Find cleanest mp4 url
                        v_url = video_urls[0].replace('&amp;', '&')
                        # Check thumbnail
                        thumb = post_obj.get('url') or ''
                        return {
                            'type': 'single',
                            'id': f"reddit_{post_id}",
                            'title': title,
                            'uploader': uploader,
                            'thumbnail': thumb,
                            'duration': 'HD Video',
                            'durationSeconds': 0,
                            'extractor': 'Reddit Video',
                            'webpage_url': clean,
                            'directUrl': v_url,
                            'videoFormats': [
                                {
                                    'resolution': 'Original Quality',
                                    'formatId': 'reddit_video',
                                    'ext': 'mp4',
                                    'filesize': None,
                                    'hasAudio': True
                                }
                            ],
                            'audioFormats': [
                                {
                                    'quality': 'Original Audio',
                                    'formatId': 'reddit_audio',
                                    'ext': 'mp3',
                                    'filesize': None
                                }
                            ]
                        }

                    # 2. Look for all high-res i.redd.it images
                    # Match all i.redd.it and preview.redd.it links in the page
                    raw_images = re.findall(r'https?://(?:preview|i)\.redd\.it/[^\s\"\'<>&]+', r_embed.text)
                    distinct_media_ids = []
                    media_id_to_ext = {}

                    for raw_url in raw_images:
                        clean_raw = raw_url.replace('&amp;', '&').replace('&quot;', '')
                        m_img = re.search(r'([a-zA-Z0-9_.-]+)\.(jpg|jpeg|png|webp|gif)', clean_raw, re.I)
                        if m_img:
                            fname = m_img.group(1)
                            ext = m_img.group(2).lower()
                            # If from preview with -v0-XXXX pattern, extract real id
                            sub_m = re.search(r'-v0-([a-zA-Z0-9]+)$', fname)
                            real_id = sub_m.group(1) if sub_m else fname
                            if real_id not in distinct_media_ids and len(real_id) >= 6:
                                distinct_media_ids.append(real_id)
                                media_id_to_ext[real_id] = ext

                    # Also check post_obj url
                    post_direct_url = post_obj.get('url', '')
                    if 'i.redd.it' in post_direct_url:
                        m_p = re.search(r'i\.redd\.it/([a-zA-Z0-9]+)\.([a-z]+)', post_direct_url)
                        if m_p and m_p.group(1) not in distinct_media_ids:
                            distinct_media_ids.insert(0, m_p.group(1))
                            media_id_to_ext[m_p.group(1)] = m_p.group(2)

                    if distinct_media_ids:
                        items = []
                        for idx, mid in enumerate(distinct_media_ids):
                            ext = media_id_to_ext.get(mid, 'jpg')
                            high_res = f"https://i.redd.it/{mid}.{ext}"
                            items.append({
                                'id': f"reddit_img_{idx + 1}",
                                'url': high_res,
                                'thumbnail': high_res,
                                'resolution': 'High-Res Photo',
                                'ext': ext,
                                'isVideo': False,
                                'title': f"{title} (Photo {idx + 1})" if len(distinct_media_ids) > 1 else title
                            })

                        return {
                            'type': 'carousel',
                            'id': f"reddit_{post_id}",
                            'title': title,
                            'uploader': uploader,
                            'itemCount': len(items),
                            'thumbnail': items[0]['thumbnail'],
                            'webpage_url': clean,
                            'extractor': 'Reddit Gallery' if len(items) > 1 else 'Reddit Photo',
                            'items': items
                        }
            except Exception as e:
                pass

    # =========================================================================
    # METHOD 2: Direct .json API (if available / not rate-limited)
    # =========================================================================
    json_url = f"{clean}/.json?raw_json=1"
    post_data = None
    try:
        r = requests.get(json_url, headers=headers, impersonate='chrome', timeout=4)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) > 0 and 'data' in data[0]:
                children = data[0]['data'].get('children', [])
                if children:
                    post_data = children[0].get('data', {})
    except Exception:
        pass

    if post_data:
        title = post_data.get('title', 'Reddit Post')
        uploader = f"u/{post_data.get('author', 'reddit_user')}"
        sub = f"r/{post_data.get('subreddit', 'reddit')}"

        # Photo Gallery
        if post_data.get('is_gallery') or post_data.get('gallery_data'):
            gallery_items = post_data.get('gallery_data', {}).get('items', [])
            media_meta = post_data.get('media_metadata', {})
            items = []
            for idx, item in enumerate(gallery_items):
                m_id = item.get('media_id')
                meta = media_meta.get(m_id, {})
                s = meta.get('s', {})
                img_url = s.get('u') or s.get('mp4') or f"https://i.redd.it/{m_id}.jpg"
                img_url = img_url.replace('&amp;', '&')
                items.append({
                    'id': f"reddit_img_{idx + 1}",
                    'url': img_url,
                    'thumbnail': img_url,
                    'resolution': 'High-Res Photo',
                    'ext': 'jpg',
                    'isVideo': False,
                    'title': f"Photo {idx + 1} of {len(gallery_items)}"
                })
            if items:
                return {
                    'type': 'carousel',
                    'id': f"reddit_{post_id}",
                    'title': title,
                    'uploader': f"{uploader} ({sub})",
                    'itemCount': len(items),
                    'thumbnail': items[0]['thumbnail'],
                    'webpage_url': clean,
                    'extractor': 'Reddit Gallery',
                    'items': items
                }

        # Single image
        post_url = post_data.get('url', '')
        if 'i.redd.it' in post_url:
            return {
                'type': 'carousel',
                'id': f"reddit_{post_id}",
                'title': title,
                'uploader': f"{uploader} ({sub})",
                'itemCount': 1,
                'thumbnail': post_url,
                'webpage_url': clean,
                'extractor': 'Reddit Photo',
                'items': [
                    {
                        'id': 'img_1',
                        'url': post_url,
                        'thumbnail': post_url,
                        'resolution': 'Original Image',
                        'ext': 'jpg',
                        'isVideo': False,
                        'title': title
                    }
                ]
            }

    # =========================================================================
    # METHOD 3: RSS Feed Fallback
    # =========================================================================
    try:
        rss_url = f"{clean}.rss"
        r_rss = requests.get(rss_url, headers=headers, impersonate='chrome', timeout=4)
        if r_rss.status_code == 200:
            soup = BeautifulSoup(r_rss.text, 'html.parser')
            entry = soup.find('entry')
            if entry:
                title_elem = entry.find('title')
                author_elem = entry.find('author')
                content_elem = entry.find('content')
                title = title_elem.text.strip() if title_elem else 'Reddit Post'
                uploader = author_elem.text.strip() if author_elem else 'Reddit User'
                
                raw_imgs = re.findall(r'https?://(?:preview|i)\.redd\.it/[^\s\"\'<>&]+', r_rss.text)
                items = []
                seen_ids = set()
                for raw_url in raw_imgs:
                    m_f = re.search(r'([a-zA-Z0-9]+)\.(jpg|jpeg|png|webp)', raw_url)
                    if m_f and m_f.group(1) not in seen_ids:
                        seen_ids.add(m_f.group(1))
                        hi_res = f"https://i.redd.it/{m_f.group(1)}.{m_f.group(2)}"
                        items.append({
                            'id': f"img_{len(items)+1}",
                            'url': hi_res,
                            'thumbnail': hi_res,
                            'resolution': 'High-Res Photo',
                            'ext': m_f.group(2),
                            'isVideo': False,
                            'title': f"Photo {len(items)+1}"
                        })
                if items:
                    return {
                        'type': 'carousel',
                        'id': f"reddit_{post_id}",
                        'title': title,
                        'uploader': uploader,
                        'itemCount': len(items),
                        'thumbnail': items[0]['thumbnail'],
                        'webpage_url': clean,
                        'extractor': 'Reddit Gallery' if len(items) > 1 else 'Reddit Photo',
                        'items': items
                    }
    except Exception:
        pass

    # If all methods failed, report clear error
    return {
        'error': "Unable to extract media from this Reddit post. Please verify the post contains a playable video, audio, or a photo gallery."
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No URL provided'}))
        sys.exit(1)
    
    target_url = sys.argv[1]
    res = extract_reddit(target_url)
    print(json.dumps(res))
