// n8n Code node "Parse updates" (mode: Run Once for All Items).
// Input: Telegram's getUpdates response. Output: one item per message,
// each with a `route` of "ignore", "noLink" or "link" for the Switch node.

const MY_TELEGRAM_ID = 0; // ← replace 0 with your own Telegram user ID

const updates = $input.first().json.result ?? [];
if (updates.length === 0) return []; // nothing new: the run stops here

// Confirming this ID + 1 at the end tells Telegram not to send these again
const maxUpdateId = Math.max(...updates.map((u) => u.update_id));

function cleanUrl(raw) {
  const url = new URL(raw);

  // Instagram: /reel/X, /reels/X and /p/X are the same Reel, so keep only the code
  // (/share/… links hide the real code; step 3 resolves those)
  const insta = url.hostname.endsWith('instagram.com')
    && !url.pathname.startsWith('/share/')
    && url.pathname.match(/^\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]+)/);
  if (insta) return `https://www.instagram.com/reel/${insta[1]}`;

  const videoId = url.searchParams.get('v'); // youtube.com/watch?v=… needs this one
  url.search = videoId ? `?v=${videoId}` : ''; // drop tracking like ?igsh= and ?is_from_webapp=
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function platformOf(url) {
  const host = new URL(url).hostname;
  if (host.includes('tiktok.com')) return 'tiktok';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  return 'other';
}

return updates.map((u) => {
  const msg = u.message;
  if (!msg || msg.from?.id !== MY_TELEGRAM_ID) {
    return { json: { route: 'ignore', maxUpdateId } }; // not you: no reply, no AI
  }

  const text = msg.text ?? msg.caption ?? '';
  const found = text.match(/https?:\/\/\S+/);
  const base = { chatId: msg.chat.id, messageId: msg.message_id, maxUpdateId };
  if (!found) return { json: { ...base, route: 'noLink' } };

  const url = cleanUrl(found[0]);
  const note = text.replace(found[0], '').trim();
  return {
    json: { ...base, route: 'link', url, platform: platformOf(url), note: note || null },
  };
});
