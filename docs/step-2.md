# Step 2: n8n + Telegram bot + Receipt

Goal: share a Reel to your bot → within ~2 minutes it's a row in Supabase `reels` and the bot replies with a Receipt.

## A. Lock the Supabase helper (2 min)

Supabase's security check flagged one thing from the "automatic RLS" option. Paste [sql/002_lock_rls_helper.sql](../sql/002_lock_rls_helper.sql) into the SQL Editor and Run.

## B. Create the bot (10 min)

1. In Telegram, open **@BotFather** → `/newbot` → pick a name and a username ending in `bot`. Copy the **token** into your password manager.
2. Still in BotFather: `/setjoingroups` → your bot → **Disable** (nobody can add it to groups).
3. Get your **user ID** (a number, not secret): open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser after messaging your bot, and read the number after `"from":{"id":`.
4. Open your new bot and press **Start**.

## C. Start n8n (15 min)

1. Make sure Docker Desktop is running.
2. In the project folder, copy `.env.example` to `.env` and paste your token after `TELEGRAM_BOT_TOKEN=`.
3. Run `docker compose up -d` in the project folder, then open <http://localhost:5678>.
4. Create the n8n owner account (local only; it never leaves your PC).

## D. Add credentials in n8n (5 min)

Left sidebar → **Credentials** → **Add credential**:

- **Supabase API**: Host = your Project URL, Secret Key = your secret key. (If n8n rejects the new `sb_secret_…` key, use the `service_role` key from the **Legacy API keys** tab instead.)
- **Telegram API**: Access Token = your bot token, Base URL left as `https://api.telegram.org`.

## E. Build the workflow "Inbox" (60–90 min)

### n8n basics you'll use in every node

- **Adding a node:** hover over the right edge of a node and click the **+**, then type the node's name in the search box. To add a node to a *specific output* (like the Switch's `link` output), click the **+** at the end of that output.
- **Inside a node** you'll see three panels: **INPUT** (left, what came in), **Parameters** (middle, your settings) and **OUTPUT** (right, what came out). **Settings** is a second tab next to Parameters.
- **Expressions:** anything in `{{ }}` is code that n8n fills in at run time. Typing `{{` in a field switches it to **Expression** mode automatically. Below the field, a grey preview shows the real value it will produce. Use that preview to check yourself.
- **Test one node at a time:** each node has an **Execute step** button. It runs everything up to that node, and you'll see the result in OUTPUT. Do this after every node below.
- **`$('Node name')`** reads data from an earlier node by its name. That's why the names below must be exact.
- **Rename a node:** click its title at the top of the node panel (or press F2 on the canvas).
- Save often with **Ctrl+S**.

Start: **Overview** → **Create Workflow**, and name it **Inbox** (top left).

---

### 1. Schedule Trigger: "Every 2 minutes"

*What it does: wakes the workflow up regularly. It's the "check Telegram" heartbeat.*

1. Click **Add first step** → search **Schedule** → **On a schedule**.
2. **Trigger Interval:** Minutes. **Minutes Between Triggers:** `2`.
3. Rename it **Every 2 minutes**.

It only fires on its own once the workflow is **Active** (last step). While building, you run things by hand.

---

### 2. HTTP Request: "Fetch updates"

*What it does: asks Telegram "any new messages for my bot?". Your queued `/start` and `Hello` will show up here.*

1. **+** → search **HTTP Request**.
2. **Method:** GET.
3. **URL:** paste this in full:
   ```
   https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/getUpdates?timeout=0
   ```
   `$env.TELEGRAM_BOT_TOKEN` reads the token from your `.env`, so it never appears inside the workflow itself. The preview under the field will say `[ERROR: not accessible via UI, please run node]` and the `{{ }}` part shows red. That's normal: n8n hides env values from the screen on purpose. It only fills them in when the node runs.
4. **Authentication:** None (the token is in the URL).
5. Rename it **Fetch updates** → **Execute step**.

**You should see** in OUTPUT: `ok: true` and a `result` list with one entry per message. Open one and find `message → from → id`. That's your user ID.

**If it fails:**
- **401 / 404:** the token in `.env` is wrong.
- **`access to env vars denied`:** `docker-compose.yml` wasn't used. Run `docker compose up -d` again from the project folder.

---

### 3. Code: "Parse updates"

*What it does: turns Telegram's raw list into tidy items. For each message: who sent it, the cleaned link, the platform, your Note, and a `route` label.*

1. **+** → search **Code**.
2. **Mode:** Run Once for All Items. **Language:** JavaScript.
3. Delete the sample code, then paste all of [n8n/code/parse-updates.js](../n8n/code/parse-updates.js).
4. On the line `const MY_TELEGRAM_ID = 0;`, replace `0` with your user ID (just the number, no quotes).
5. Rename it **Parse updates** → **Execute step**.

**You should see** one item per message. Your `/start` and `Hello` each show `route: "noLink"`, with `chatId` and `messageId`.

**If every item says `route: "ignore"`,** the ID in step 4 doesn't match. Compare it with `from.id` in the previous node's output.

---

### 4. Switch: "Route message"

*What it does: sends each item down one of three paths based on its `route` label.*

1. **+** → search **Switch**.
2. **Mode:** Rules.
3. **Routing Rule 1:**
   - Left value: `{{ $json.route }}` (or drag `route` in from the INPUT panel)
   - Operator: **String → is equal to**
   - Right value: `link`
   - Turn on **Rename Output**, and set **Output Name** to `link`.
4. **Add Routing Rule:** same, with `noLink` (output name `noLink`).
5. **Add Routing Rule:** same, with `ignore` (output name `ignore`).
6. Rename it **Route message** → **Execute step**.

**You should see** three output tabs in OUTPUT. `noLink` has your 2 test messages, and the others are empty for now.

On the canvas, the Switch now has three exit dots labelled `link`, `noLink` and `ignore`. The next nodes hang off specific dots.

---

### 5. Supabase: "Find existing" (on the `link` output)

*What it does: looks up whether this link is already in your `reels` table. This is the duplicate check.*

1. Click the **+** on the Switch's **`link`** output → search **Supabase**.
2. **Credential:** your Supabase account. **Resource:** Row. **Operation:** Get Many.
3. **Table Name or ID:** `reels`.
4. **Return All:** off. **Limit:** 1.
5. **Filter:** Build Manually → **Add Condition**:
   - Field Name: `url`
   - Condition: Equals
   - Field Value: `{{ $json.url }}`
6. **Settings** tab → turn **Always Output Data** on.
7. Rename it **Find existing**.

**Why "Always Output Data":** when no row matches (a new Reel), Supabase returns nothing, and n8n would normally stop that path there. This setting makes it pass along one empty item, so the next node can say "not found → save it".

You can't test this node properly until you send a real link, which happens in part F.

---

### 6. If: "Already saved?"

*What it does: splits into "this link exists" (true) or "brand new" (false).*

1. **+** after **Find existing** → search **If**.
2. Condition:
   - Left value: `{{ $json.id }}`
   - Operator: **Number → exists**
3. Rename it **Already saved?**

A found row has an `id`, so it goes to **true**. The empty item from step 5 doesn't, so it goes to **false**.

---

### 7. Supabase: "Save Reel" (on the If's `false` output)

*What it does: inserts the new Reel. Supabase fills in `id`, `shared_at` and `status = new` by itself.*

1. Click the **+** on the If's **false** output → **Supabase**.
2. **Resource:** Row. **Operation:** Create. **Table:** `reels`.
3. **Data to Send:** Define Below for Each Column. Add three fields:

   | Field Name | Field Value |
   |---|---|
   | `url` | `{{ $('Route message').item.json.url }}` |
   | `platform` | `{{ $('Route message').item.json.platform }}` |
   | `note` | `{{ $('Route message').item.json.note }}` |

4. Rename it **Save Reel**.

**Why `$('Route message').item` and not `$json`:** at this point `$json` is the empty result of the lookup. `$('Route message').item` reaches back to the matching message from before the lookup. n8n keeps track of which item came from which.

---

### 8–10. Edit Fields: the three Receipts

*What they do: each one writes the Receipt text for its path, into a field called `receipt`.*

For each of these: **+** → search **Edit Fields (Set)** → **Mode:** Manual Mapping → **Add Field**, with name `receipt` and type String.

| Node name | Attach it to | `receipt` value |
|---|---|---|
| **Receipt: saved** | after **Save Reel** | `✅ Saved` |
| **Receipt: duplicate** | the If's **true** output | `↩️ Already saved (shared {{ DateTime.fromISO($json.shared_at).toFormat('ccc d LLL') }})` |
| **Receipt: no link** | the Switch's **noLink** output | `❌ No Reel link found` |

In **Receipt: duplicate**, `$json` is the row Supabase found, so `shared_at` is when you first shared it. `toFormat('ccc d LLL')` turns it into something like "Fri 31 Oct".

---

### 11. Telegram: "Send Receipt"

*What it does: replies to your original message with the Receipt text.*

1. **+** after **Receipt: no link** → search **Telegram** → action **Send a text message**.
2. **Credential:** your Telegram account.
3. **Chat ID:** `{{ $('Route message').item.json.chatId }}`
4. **Text:** `{{ $json.receipt }}`
5. **Additional Fields → Add Field:**
   - **Reply To Message ID:** `{{ $('Route message').item.json.messageId }}`
   - **Append n8n Attribution:** off (otherwise every Receipt ends with an n8n ad)
6. Rename it **Send Receipt**.
7. Connect the other two Receipts to it: drag from the output dot of **Receipt: saved** onto **Send Receipt**'s input dot, and do the same for **Receipt: duplicate**. Three lines should now go into it.
8. **Execute step:** your bot should reply `❌ No Reel link found` to both `/start` and `Hello`. 🎉 First Receipt.

---

### 12. HTTP Request: "Confirm updates"

*What it does: tells Telegram "I've handled everything up to here, don't send it again". It runs last, so a failure partway through means nothing gets confirmed and the next run retries.*

1. **+** after **Send Receipt** → **HTTP Request**.
2. **Method:** GET. **URL:**
   ```
   https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/getUpdates?offset={{ $('Parse updates').first().json.maxUpdateId + 1 }}&limit=1&timeout=0
   ```
3. **Settings** tab → turn **Execute Once** on (one confirm per run, not one per message).
4. Connect the Switch's **ignore** output to this node's input too, so messages from strangers get confirmed without a reply.
5. Rename it **Confirm updates**.

**How "offset" works:** every Telegram message has a rising `update_id`. Asking for messages *from* `highest ID + 1` tells Telegram that everything up to the highest ID is done, and it drops those for good.

Confirm may run twice in one run (once from **Send Receipt** and once from **ignore**). That's harmless, because confirming the same point twice changes nothing.

---

### Your finished canvas

```
Every 2 minutes → Fetch updates → Parse updates → Route message
   link   → Find existing → Already saved?
               true  → Receipt: duplicate ─┐
               false → Save Reel → Receipt: saved ─┤
   noLink → Receipt: no link ──────────────────────┴→ Send Receipt → Confirm updates
   ignore ─────────────────────────────────────────────────────────→ Confirm updates
```

## F. Test it

Use **Execute workflow** (bottom of the canvas) for each test. It runs the whole thing once, by hand.

1. **Confirm works:** run once now. Your `/start` and `Hello` should already be confirmed from step 12. Run again: it should stop at **Parse updates** with no output (green tick, 0 items). If you get the two `❌` Receipts again, check step 12's URL.
2. **New Reel:** send your bot an Instagram or TikTok link with a note after it, e.g. `https://www.instagram.com/reel/… the 2nd tip`. Run: you get `✅ Saved`, and in Supabase **Table Editor → reels** there's a row with the cleaned link, platform `instagram` and your note.
3. **Duplicate:** send the same link again, then run. You get `↩️ Already saved (…)`, and no second row appears.
4. **No link:** send `hello`, then run. You get `❌ No Reel link found`.
5. **Go live:** flip the **Active** toggle (top right) and save. Share a Reel from the Instagram or TikTok app (**Share → Telegram → your bot**) and wait up to 2 minutes for the Receipt.
6. **History:** the **Executions** tab (top) lists every automatic run. A red one means something failed. Click it to see which node and why.

## Known limit

Instagram links are cleaned to one form, so `/reel/X`, `/reels/X`, `/p/X` and links with `?igsh=…` all count as the same Reel. Two kinds of link still slip past the duplicate check, because they hide the real video code: Instagram `instagram.com/share/…` links and TikTok short links (`vm.tiktok.com/…`). Step 3 fixes this when Apify returns the real video URL.

When it all works, tick step 2 in the README and export the workflow (**⋯** top right → **Download**) to `n8n/workflows/inbox.json`. The export holds credential *names* only, never the keys.
