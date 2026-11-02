// n8n Code node "Parse updates" (mode: Run Once for All Items).
// Input: the unhandled rows of Supabase's telegram_updates table (step 6), each with
// one Telegram update in `payload`. Output: one item per message, each with a
// `route` of "ignore", "noLink", "link" or "digest" for the Switch node.

const MY_TELEGRAM_ID = 0; // ← replace 0 with your own Telegram user ID

const updates = $input.all().map((i) => i.json.payload).filter(Boolean);
if (updates.length === 0) return []; // nothing new: the run stops here

// Kept for reference in each item; "Confirm updates" marks the fetched rows as handled
const maxUpdateId = Math.max(...updates.map((u) => u.update_id));

// n8n's Code sandbox has no `URL` class, so links are split with a regex instead
function splitUrl(raw) {
  const [, host = '', path = '', query = ''] =
    raw.match(/^https?:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i) ?? [];
  return { host: host.toLowerCase(), path, query };
}

function cleanUrl(raw) {
  const { host, path, query } = splitUrl(raw);

  // Instagram: /reel/X, /reels/X and /p/X are the same Reel, so keep only the code
  // (/share/… links hide the real code; step 3 resolves those)
  const insta = host.endsWith('instagram.com')
    && !path.startsWith('/share/')
    && path.match(/^\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]+)/);
  if (insta) return `https://www.instagram.com/reel/${insta[1]}`;

  const videoId = query.match(/[?&]v=([^&]+)/); // youtube.com/watch?v=… needs this one
  // drop tracking like ?igsh= and ?is_from_webapp=, and any #fragment
  return `https://${host}${path.replace(/\/$/, '')}${videoId ? `?v=${videoId[1]}` : ''}`;
}

function platformOf(url) {
  const { host } = splitUrl(url);
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
  const base = { chatId: msg.chat.id, messageId: msg.message_id, maxUpdateId };

  // "/digest" (or "/digest@botname" from Telegram's command menu) sends a Digest now
  if (/^\/digest(@\w+)?$/i.test(text.trim())) return { json: { ...base, route: 'digest' } };

  const found = text.match(/https?:\/\/\S+/i);
  if (!found) return { json: { ...base, route: 'noLink' } };

  const url = cleanUrl(found[0]);
  const note = text.replace(found[0], '').trim();
  return {
    json: { ...base, route: 'link', url, platform: platformOf(url), note: note || null },
  };
});
