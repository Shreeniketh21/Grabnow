import sys
import os
import json
import re
from urllib.parse import urlparse
from curl_cffi import requests

CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
IG_APP_ID = '936619743392459'

def load_cookies():
    cookie_dict = {}
    base_dir = os.path.dirname(os.path.abspath(__file__))
    cookie_file = os.path.join(base_dir, 'user_cookies.txt')
    if not os.path.exists(cookie_file):
        return cookie_dict

    try:
        with open(cookie_file, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = line.split('\t')
                if len(parts) >= 7:
                    domain, _, _, _, _, name, value = parts[:7]
                    if 'instagram.com' in domain:
                        cookie_dict[name] = value
                elif '=' in line and not line.startswith('#'):
                    k_v = line.split(';', 1)[0].split('=', 1)
                    if len(k_v) == 2:
                        cookie_dict[k_v[0].strip()] = k_v[1].strip()
    except Exception as e:
        sys.stderr.write(f"[InstagramCrawler] Error reading cookies: {e}\n")
    return cookie_dict

def extract_username(url):
    clean = url.split('?')[0].split('#')[0].rstrip('/')
    parsed = urlparse(clean)
    path_parts = [p for p in parsed.path.split('/') if p]
    if not path_parts:
        return None
    if path_parts[0] in ['p', 'reel', 'tv', 'stories', 'explore', 'direct']:
        return None
    return path_parts[0]

def crawl_instagram_profile(url, limit=60):
    username = extract_username(url)
    if not username:
        return {"error": "Could not identify Instagram username from URL."}

    cookies = load_cookies()
    session = requests.Session()
    session.headers.update({
        'User-Agent': CHROME_UA,
        'x-ig-app-id': IG_APP_ID,
        'x-asbd-id': '129477',
        'x-ig-www-claim': '0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': f'https://www.instagram.com/{username}/',
        'Origin': 'https://www.instagram.com',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
    })

    if cookies:
        session.cookies.update(cookies)

    # 1. Query web_profile_info
    api_url = f'https://www.instagram.com/api/v1/users/web_profile_info/?username={username}'
    try:
        resp = session.get(api_url, impersonate='chrome124', timeout=15)
    except Exception as e:
        return {"error": f"Failed to connect to Instagram: {str(e)}"}

    if resp.status_code == 401 or (resp.status_code == 200 and '"require_login":true' in resp.text):
        return {
            "error": "Instagram session login required. Use the GrabNow In-Page Live Harvester or sync your session cookies in Settings.",
            "requiresAuth": True,
            "username": username
        }

    if resp.status_code != 200:
        return {"error": f"Instagram returned status code {resp.status_code}."}

    try:
        data = resp.json()
    except Exception as e:
        return {"error": f"Failed to parse Instagram API response: {str(e)}"}

    user_data = data.get('data', {}).get('user')
    if not user_data:
        return {"error": f"Instagram profile @{username} not found or account is private."}

    full_name = user_data.get('full_name') or username
    profile_pic = user_data.get('profile_pic_url_hd') or user_data.get('profile_pic_url') or ''
    bio = user_data.get('biography') or ''
    follower_count = user_data.get('edge_followed_by', {}).get('count', 0)
    timeline = user_data.get('edge_owner_to_timeline_media', {})
    total_posts = timeline.get('count', 0)
    edges = timeline.get('edges', [])

    items = []
    for edge in edges:
        if len(items) >= limit:
            break
        node = edge.get('node', {})
        shortcode = node.get('shortcode')
        post_url = f"https://www.instagram.com/p/{shortcode}/" if shortcode else url
        caption_edges = node.get('edge_media_to_caption', {}).get('edges', [])
        caption = caption_edges[0].get('node', {}).get('text', '') if caption_edges else ''
        clean_caption = caption.split('\n')[0][:80] if caption else f"Post by @{username}"

        typename = node.get('__typename')
        is_video = node.get('is_video', False) or typename == 'GraphVideo'

        # Check for carousel (GraphSidecar)
        if typename == 'GraphSidecar' or 'edge_sidecar_to_children' in node:
            children = node.get('edge_sidecar_to_children', {}).get('edges', [])
            for c_idx, c_edge in enumerate(children):
                c_node = c_edge.get('node', {})
                c_is_vid = c_node.get('is_video', False)
                c_display = c_node.get('display_url') or ''
                c_vid_url = c_node.get('video_url')
                c_media_url = c_vid_url if c_is_vid and c_vid_url else c_display
                
                dims = c_node.get('dimensions', {})
                w, h = dims.get('width'), dims.get('height')
                res = f"{w}×{h}" if w and h else ("HD Video" if c_is_vid else "High-Res Photo")

                if c_media_url:
                    items.append({
                        "id": f"ig_{shortcode}_slide_{c_idx + 1}",
                        "mediaType": "video" if c_is_vid else "image",
                        "title": f"{clean_caption} (Slide {c_idx + 1}/{len(children)})",
                        "url": c_media_url,
                        "webpageUrl": post_url,
                        "thumbnail": c_display or c_media_url,
                        "resolution": res,
                        "ext": "mp4" if c_is_vid else "jpg"
                    })
        elif is_video:
            video_url = node.get('video_url')
            display_url = node.get('display_url') or ''
            dims = node.get('dimensions', {})
            w, h = dims.get('width'), dims.get('height')
            res = f"{w}×{h}" if w and h else "HD Video"

            # Check for music info in clips_metadata
            audio_track = None
            clips_meta = node.get('clips_metadata') or {}
            music_info = clips_meta.get('music_info', {}).get('music_asset_info', {})
            if music_info:
                audio_track = {
                    "title": music_info.get('title') or 'Original Audio',
                    "artist": music_info.get('display_artist') or username,
                    "url": music_info.get('progressive_download_url') or ''
                }

            if video_url:
                items.append({
                    "id": f"ig_{shortcode}",
                    "mediaType": "video",
                    "title": clean_caption,
                    "url": video_url,
                    "webpageUrl": post_url,
                    "thumbnail": display_url or video_url,
                    "resolution": res,
                    "ext": "mp4",
                    "audioTrack": audio_track
                })
            elif display_url:
                items.append({
                    "id": f"ig_{shortcode}",
                    "mediaType": "image",
                    "title": clean_caption,
                    "url": display_url,
                    "webpageUrl": post_url,
                    "thumbnail": display_url,
                    "resolution": res,
                    "ext": "jpg"
                })
        else:
            display_url = node.get('display_url')
            dims = node.get('dimensions', {})
            w, h = dims.get('width'), dims.get('height')
            res = f"{w}×{h}" if w and h else "High-Res Photo"

            if display_url:
                items.append({
                    "id": f"ig_{shortcode}",
                    "mediaType": "image",
                    "title": clean_caption,
                    "url": display_url,
                    "webpageUrl": post_url,
                    "thumbnail": display_url,
                    "resolution": res,
                    "ext": "jpg"
                })

    if not items:
        return {"error": f"No downloadable media could be found on @{username}'s profile."}

    return {
        "type": "bulk_gallery",
        "id": f"ig_profile_{username}",
        "title": f"Instagram @{username} ({len(items)} Items)",
        "uploader": f"@{username} ({full_name})" if full_name != username else f"@{username}",
        "thumbnail": profile_pic or items[0].get("thumbnail", ""),
        "itemCount": len(items),
        "totalAvailable": total_posts,
        "webpage_url": url,
        "extractor": "Instagram Profile Harvester",
        "profilePic": profile_pic,
        "bio": bio,
        "followers": follower_count,
        "items": items
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Target Instagram URL required"}))
        sys.exit(1)

    target = sys.argv[1]
    max_items = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    result = crawl_instagram_profile(target, max_items)
    print(json.dumps(result))
