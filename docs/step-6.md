# Step 6: keep working while the PC is off

n8n runs on your PC, so before this step a Reel shared while the PC was off was lost after about 24 hours (Telegram's limit), and a Sunday Digest was missed if the PC was off at 9 AM. Three changes fix that.

```
Before:  Telegram ──(n8n asks every 2 min: "anything new?")──> Inbox
After:   Telegram ──(pushes each message at once)──> Supabase "telegram-inbox" function
                                                      └─> telegram_updates table ──(every 2 min)──> Inbox
```

## 1. Your PC: start by itself, don't sleep (your part, 2 min)

- **Docker Desktop → Settings → General → "Start Docker Desktop when you sign in"** on. n8n then starts by itself after a reboot (`docker-compose.yml` has `restart: unless-stopped`).
- **Windows Settings → System → Power & battery → Screen, sleep & hibernate timeouts →** "Make my device sleep after": **Never** (at least when plugged in). A sleeping PC runs nothing.

## 2. Digest catches up

The **Digest** trigger is now **"Hourly, Sun 9 AM to Mon"**: every hour from Sunday 9 AM to the end of Monday. Two new nodes come first:

- **Already sent?** (Supabase, Get Many on `digests`): looks for a Digest for this week (`week_end` = the most recent Sunday) with `sent_at` filled in. **Always Output Data** is on.
- **Not sent yet?** (If): `{{ $json.id }}` **Number → does not exist**. True → the usual Fetch week's Reels → … → Send email. False → stop.

So the first hourly run when your PC is on sends the Digest, and every later run that week stops at **Not sent yet?**. **Prepare week** now always dates the week as ending on the most recent Sunday, so a Monday catch-up still says "26 Oct – 1 Nov".

## 3. The Supabase catcher

**a. The table** [sql/003_telegram_updates.sql](../sql/003_telegram_updates.sql): one row per Telegram message (`update_id`, the whole message in `payload`, `received_at`, and `processed_at`, which stays empty until Inbox has replied). Locked like the other tables.

**b. The Edge Function** [supabase/functions/telegram-inbox/index.ts](../supabase/functions/telegram-inbox/index.ts): a few lines that run in Supabase's cloud, always on. Telegram calls it for every message. It keeps only messages **from your Telegram ID** and saves them. A repeat delivery can't create a second row, because `update_id` is the primary key. It's deployed with **JWT verification off** because Telegram can't log in to Supabase; the ID check is its guard. URL: `https://aahefulplvoiaobpxjeu.supabase.co/functions/v1/telegram-inbox`.

**c. Telegram's webhook** points at that URL (`setWebhook`, `allowed_updates: ["message"]`). Once a webhook is set, Telegram stops answering `getUpdates`, which is why Inbox changed too.

**d. Inbox reads from the table** instead of asking Telegram:

| Node | Before | Now |
|---|---|---|
| **Fetch updates** | HTTP `getUpdates` | Supabase **Get Many** `telegram_updates`, Filter (String) `processed_at=is.null`, Limit 50 |
| **Parse updates** | read `result` from Telegram's reply | reads each row's `payload` ([n8n/code/parse-updates.js](../n8n/code/parse-updates.js)) |
| **Confirm updates** | HTTP `getUpdates?offset=…` | Supabase **Update** `telegram_updates`, Filter (String) `update_id=in.({{ $('Fetch updates').all().map((i) => i.json.update_id).join(',') }})`, field `processed_at` = `{{ $now.toISO() }}`, **Execute Once** on |

Everything after Parse updates is unchanged. Receipts still come from n8n, so while the PC is off they arrive when it's back on, but the Reel itself is safe in Supabase the moment you share it.

## Test it

1. **Live path:** share a Reel to the bot. In Supabase **Table Editor → telegram_updates**, a row appears within a second or two. Within 2 minutes you get `✅ Saved`, the row's `processed_at` is filled in, and the Reel is in `reels`.
2. **PC off:** stop n8n (`docker compose stop`), share a Reel, and see the row appear in `telegram_updates` anyway. Start n8n (`docker compose up -d`), and within 2 minutes the Receipt arrives.
3. **Digest catch-up:** in **Digest**, click **Execute workflow** twice. If this week's Digest has already gone out, both runs stop at **Not sent yet?** (false).

## Undo (if ever needed)

Telegram can be pointed back at "ask me" mode with `deleteWebhook`; then restore the old Fetch updates and Confirm updates nodes from git history (`n8n/workflows/inbox.json` before step 6).
