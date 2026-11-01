// n8n Code node "Pick media" (mode: Run Once for Each Item).
// Input: Apify's full response (Instagram or TikTok); its results list is in `body`.
// Output: the same shape for both, { id, caption, mediaUrl, realUrl }. Throws when
// there's nothing to transcribe, so the item goes down the error output to "Describe failure".

const reel = $('Loop over reels').item.json; // the Supabase row this round is handling
const r = $json.body?.[0]; // we asked for 1 result

if (!r || Object.keys(r).length === 0) {
  throw new Error('Apify found nothing at this link (deleted or private?)');
}
if (r.error) {
  throw new Error(`Apify: ${r.error}${r.errorDescription ? ` (${r.errorDescription})` : ''}`);
}

if (reel.platform === 'instagram') {
  // audioUrl is the sound only (much smaller); some posts only have videoUrl
  const mediaUrl = r.audioUrl || r.videoUrl;
  if (!mediaUrl) throw new Error('This Instagram post has no video');
  // shortCode is the real Reel code, which also resolves instagram.com/share/… links
  const realUrl = r.shortCode ? `https://www.instagram.com/reel/${r.shortCode}` : reel.url;
  return { json: { id: reel.id, caption: r.caption || null, mediaUrl, realUrl } };
}

// TikTok: mediaUrls is filled because "shouldDownloadVideos" is on
const mediaUrl = r.mediaUrls?.[0];
if (!mediaUrl) {
  throw new Error(r.isSlideshow ? 'TikTok slideshow (photos, no video)' : 'TikTok video could not be downloaded');
}
// webVideoUrl is the full link, which also resolves vm.tiktok.com short links
const realUrl = (r.webVideoUrl || reel.url).split('?')[0];
return { json: { id: reel.id, caption: r.text || null, mediaUrl, realUrl } };
