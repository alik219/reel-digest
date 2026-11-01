// n8n Code node "Describe failure" (mode: Run Once for Each Item).
// Every failed step's error output ends here. It counts the attempt and gives up
// after one retry, which makes the Reel a Failed Reel for the Digest.

const MAX_ATTEMPTS = 2; // first try + one retry

const reel = $('Loop over reels').item.json;
const e = $json.error;
const message = e
  ? (typeof e === 'string' ? e : e.message ?? JSON.stringify(e))
  : `Can't read ${reel.platform} links yet`; // came from the Switch's fallback output

const attempts = (reel.retry_count ?? 0) + 1;
return {
  json: {
    id: reel.id,
    retry_count: attempts,
    status: attempts >= MAX_ATTEMPTS ? 'failed' : 'new',
    last_error: String(message).slice(0, 500),
  },
};
