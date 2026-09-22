import sys
import json
import yt_dlp
from yt_dlp.extractor.instagram import InstagramIE
from yt_dlp.networking.impersonate import ImpersonateTarget

def extract_instagram(url):
    ydl_opts = {
        'impersonate': ImpersonateTarget('chrome'),
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ie = InstagramIE(ydl)
        try:
            info = ie._real_extract(url)
        except Exception as err:
            return {'error': str(err)}

    entries = info.get('entries') or []
    description = info.get('description') or info.get('title') or 'Instagram Post'
    clean_title = description.split('\n')[0][:100] if description else 'Instagram Post'
    uploader = info.get('uploader') or (f"@{info.get('channel')}" if info.get('channel') else 'Instagram Creator')

    # Case 1: Carousel / Multi-Media Post
    if entries:
        items = []
        for idx, entry in enumerate(entries):
            formats = entry.get('formats') or []
            thumbs = entry.get('thumbnails') or []
            best_thumb = thumbs[-1] if thumbs else {}
            video_url = formats[-1].get('url') if formats else None

            width = best_thumb.get('width')
            height = best_thumb.get('height')
            res_label = f"{width}×{height}" if width and height else ("HD Video" if video_url else "HD Photo")

            media_url = video_url or best_thumb.get('url')
            if not media_url:
                continue

            items.append({
                'id': f"ig_{entry.get('id') or (idx + 1)}",
                'url': media_url,
                'thumbnail': best_thumb.get('url') or (thumbs[0].get('url') if thumbs else ''),
                'resolution': res_label,
                'ext': 'mp4' if video_url else 'jpg',
                'isVideo': bool(video_url),
                'title': f"Slide {idx + 1}"
            })

        if items:
            return {
                'type': 'carousel',
                'id': f"ig_{info.get('id')}",
                'title': clean_title,
                'uploader': uploader,
                'itemCount': len(items),
                'thumbnail': items[0]['thumbnail'] if items else '',
                'webpage_url': url,
                'extractor': 'Instagram Carousel',
                'items': items
            }

    # Case 2: Single Photo (No video formats, but has thumbnails)
    formats = info.get('formats') or []
    thumbs = info.get('thumbnails') or []

    if not formats and thumbs:
        best_thumb = thumbs[-1]
        width = best_thumb.get('width')
        height = best_thumb.get('height')
        res_label = f"{width}×{height}" if width and height else "HD Photo"

        return {
            'type': 'carousel',
            'id': f"ig_{info.get('id')}",
            'title': clean_title,
            'uploader': uploader,
            'itemCount': 1,
            'thumbnail': best_thumb.get('url') or '',
            'webpage_url': url,
            'extractor': 'Instagram Photo',
            'items': [
                {
                    'id': f"ig_{info.get('id')}",
                    'url': best_thumb.get('url'),
                    'thumbnail': best_thumb.get('url'),
                    'resolution': res_label,
                    'ext': 'jpg',
                    'isVideo': False,
                    'title': clean_title
                }
            ]
        }

    # Case 3: Video / Reel with playable formats
    if formats:
        # Standard video formats
        video_formats = []
        for f in formats:
            if f.get('vcodec') != 'none' and f.get('url'):
                h = f.get('height') or 0
                res = f"{h}p" if h else (f.get('format_note') or 'HD Video')
                video_formats.append({
                    'formatId': f.get('format_id') or 'best',
                    'resolution': res,
                    'height': h,
                    'ext': 'mp4',
                    'filesize': f.get('filesize') or f.get('filesize_approx'),
                    'hasAudio': bool(f.get('acodec') and f.get('acodec') != 'none')
                })

        return {
            'type': 'single',
            'id': f"ig_{info.get('id')}",
            'title': clean_title,
            'thumbnail': thumbs[-1].get('url') if thumbs else '',
            'duration': 'Reel / Video',
            'durationSeconds': info.get('duration') or 0,
            'uploader': uploader,
            'extractor': 'Instagram Video',
            'webpage_url': url,
            'videoFormats': video_formats or [{ 'resolution': 'HD Video', 'formatId': 'best', 'ext': 'mp4', 'filesize': None, 'hasAudio': True }],
            'audioFormats': [{ 'quality': 'Original Audio', 'formatId': 'best', 'ext': 'mp3', 'filesize': None }],
            'requiresImpersonate': True
        }

    return {'error': 'No downloadable media found in this Instagram post.'}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'URL required'}))
        sys.exit(1)

    target_url = sys.argv[1]
    res = extract_instagram(target_url)
    print(json.dumps(res))
