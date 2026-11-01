// n8n Code node "YouTube transcript" (mode: Run Once for Each Item).
// Input: the full response of the starvibe/youtube-video-transcript Apify actor, which
// reads YouTube's own captions (no download, no Whisper); its result is in `body`.
// Output: the same fields as "Check speech", so it goes straight into "Save transcript".

const MIN_WORDS = 15; // same bar as "Check speech"

const reel = $('Loop over reels').item.json;
const r = $json.body?.[0];

// No title means YouTube didn't return the video at all (removed, private, bad link)
if (!r || !r.title) {
  throw new Error(`YouTube: ${r?.message || 'video not found (removed or private?)'}`);
}

// No captions on a Short usually means music only, so it's a No-speech Reel, not a failure
const text = (r.transcript_text ?? '').trim();
const hasSpeech = r.status === 'success' && text.split(/\s+/).filter(Boolean).length >= MIN_WORDS;

// Shorts have no separate caption, so title + description play that part
const caption = [r.title, r.description].filter(Boolean).join('\n\n').slice(0, 2000);

return {
  json: {
    id: reel.id,
    url: reel.url,
    caption,
    has_speech: hasSpeech,
    transcript: hasSpeech ? text : '',
  },
};
