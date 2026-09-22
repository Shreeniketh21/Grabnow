const fs = require('fs');

async function harvestPage(url, name) {
  console.log(`\n================ Harvesting ${name} (${url}) ================`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    console.log('Status:', res.status);
    const html = await res.text();
    console.log('HTML Length:', html.length);

    // Harvest all image & video URLs
    const mediaRegex = /https?:\/\/[^"'\s\\<>]+\.(?:mp4|webm|m3u8|gif|jpg|jpeg|png|webp)(?:\?[^"'\s\\<>]*)?/gi;
    const matches = html.match(mediaRegex) || [];
    const unique = [...new Set(matches.map(m => m.replace(/\\/g, '').replace(/&amp;/g, '&')))];

    console.log(`Found ${unique.length} total media URLs on page!`);
    console.log('Sample media URLs:', unique.slice(0, 8));

    // Categorize into Videos vs Photos
    const videos = unique.filter(u => /\.(mp4|webm|m3u8)/i.test(u));
    const images = unique.filter(u => /\.(gif|jpg|jpeg|png|webp)/i.test(u) && !u.includes('logo') && !u.includes('avatar') && !u.includes('icon'));

    console.log(`Summary: ${videos.length} Videos | ${images.length} High-Res Images/GIFs`);

  } catch (err) {
    console.error('Harvest error:', err.message);
  }
}

async function main() {
  await harvestPage('https://www.redgifs.com/ifs/desi', 'RedGifs Desi Feed');
  await harvestPage('https://www.reddit.com/r/pics.json', 'Reddit Pics API');
}

main();
