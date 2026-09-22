const fs = require('fs');

async function testRedgifsApi() {
  console.log('--- Testing RedGifs API ---');
  try {
    const res = await fetch('https://api.redgifs.com/v2/gifs/search?search_text=desi&count=30', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Total GIFs returned:', data.gifs?.length || 0);
      if (data.gifs && data.gifs.length > 0) {
        const sample = data.gifs.map(g => ({
          id: g.id,
          title: g.userName || g.id,
          videoUrl: g.urls?.hd || g.urls?.sd || g.urls?.gif,
          thumbnail: g.urls?.thumbnail || g.urls?.vthumbnail
        }));
        console.log('Sample items:', sample.slice(0, 5));
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testRedgifsApi();
