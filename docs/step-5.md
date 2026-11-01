# Step 5: Sunday Digest via Resend

Goal: every Sunday at 9 AM (Toronto time), one email arrives: an Atomic Habits-style article of the week's Reels, grouped by Category, with their Action Steps, a **Habit of the week**, and any Failed Reels listed at the end to rewatch.

This is a **fourth workflow, "Digest"**.

```
Sunday 9 AM → Fetch week's Reels → Prepare week → Write article (OpenRouter) → Build email
            → Save digest → Send email (Resend) → Mark sent → Link Reels
```

## How the article is made

The AI only writes the **glue**: a title, a two-paragraph intro, a one-line lead-in per Category, and the Habit of the week. The summaries and Action Steps go into the email **exactly as step 4 saved them**, so nothing gets lost or made up in a rewrite. If the free model fails, the email still goes out with a plain intro.

Which Reels go in: every `done` or `failed` Reel that isn't in a Digest yet (`digest_id` empty). Usually that's the last 7 days, and a Reel that finished late (PC off, model busy) simply joins next week. Reels still being processed (`status = new`) wait for next Sunday.

## A. Resend account, key and your address (10 min)

1. Sign up at <https://resend.com> (free: 100 emails a day, 3,000 a month). **Use the email address you want the Digest sent to.** Without your own domain, Resend only lets you send to the address you signed up with, from `onboarding@resend.dev`.
2. **API Keys → Create API Key**, permission **Sending access**. Copy it; it starts with `re_` and is shown once.
3. In n8n: **Credentials → Add credential → Header Auth**. **Name:** `Authorization`, **Value:** `Bearer ` + the key. **Allowed HTTP Request Domains:** Specific Domains → `api.resend.com`. Click the title and rename it **Resend**, then **Save**. (Rename the Apify one to **Apify** too, so the two Header Auth credentials are easy to tell apart.)
4. In the project's `.env` file, add this line with your Resend sign-up address:
   ```
   DIGEST_TO_EMAIL=you@example.com
   ```
   It lives in `.env` (never committed), not in the workflow, so your address doesn't end up in git.
5. Restart n8n so it reads the new line. In the project folder:
   ```bash
   docker compose up -d --force-recreate
   ```
   Your workflows and credentials are kept: they live in the `n8n_data` volume.

## B. Build the workflow "Digest" (45–60 min)

**Overview → Create Workflow**, name it **Digest**.

---

### 1. Schedule Trigger: "Sunday 9 AM"

**Trigger Interval:** Weeks. **Weeks Between Triggers:** `1`. **Trigger on Weekdays:** Sunday. **Trigger at Hour:** 9am. **Trigger at Minute:** `0`.

n8n uses the `America/Toronto` timezone from `docker-compose.yml`.

---

### 2. Supabase: "Fetch week's Reels"

1. **Resource:** Row. **Operation:** Get Many. **Table:** `reels`. **Return All:** on.
2. **Filter:** String:
   ```
   digest_id=is.null&status=in.(done,failed)
   ```
3. **Settings → Always Output Data:** on. A week with no Reels still sends a short "no Reels this week" email.

---

### 3. Code: "Prepare week"

**Mode:** Run Once for All Items. Paste [n8n/code/prepare-week.js](../n8n/code/prepare-week.js).

It groups the `done` Reels by Category (Self-Help, Health, Socialising, Money, AI, Other), lists the Failed Reels, works out the week's dates, and builds the request for the article's glue text. The AI's instructions are in `SYSTEM`.

**Execute step:** one item with `categories`, `failed`, `reel_ids` and `body`.

---

### 4. HTTP Request: "Write article"

Same as step 4's **Summarise** node: POST `https://openrouter.ai/api/v1/chat/completions`, **Predefined Credential Type → OpenRouter**, Body **Using JSON** `{{ JSON.stringify($json.body) }}`, **Timeout** `120000`. Then:

- **Settings → On Error:** **Continue** (not "using error output"). A failure just passes an error item along, and **Build email** falls back to a plain intro.

---

### 5. Code: "Build email"

**Mode:** Run Once for All Items. Paste [n8n/code/build-email.js](../n8n/code/build-email.js).

It builds the email: title, intro, a green **Habit of the week** box, each Category with its Reels (summary, your Note, numbered Action Steps with a "Start small" line, and a "Watch again" link), then **Couldn't read these** for Failed Reels. It also makes a plain-text copy, which works well with your phone's read-aloud.

**Execute step**, then in OUTPUT copy the `html` value into a file called `preview.html` and open it in your browser to see the email before sending anything.

---

### 6. Supabase: "Save digest"

**Resource:** Row. **Operation:** Create. **Table:** `digests`. **Define Below:**

| Field Name | Field Value |
|---|---|
| `week_start` | `{{ $json.week_start }}` |
| `week_end` | `{{ $json.week_end }}` |
| `article` | `{{ $json.html }}` |
| `reel_count` | `{{ $json.reel_count }}` |

It's saved before sending, so the article is kept even if the email fails.

---

### 7. HTTP Request: "Send email"

1. **Method:** POST. **URL:** `https://api.resend.com/emails`
2. **Authentication:** Generic Credential Type → **Header Auth** → **Resend**.
3. **Send Body:** on, JSON, **Using JSON**:
   ```
   {{ JSON.stringify({
     from: 'Reel Digest <onboarding@resend.dev>',
     to: [$env.DIGEST_TO_EMAIL],
     subject: $('Build email').first().json.subject,
     html: $('Build email').first().json.html,
     text: $('Build email').first().json.text
   }) }}
   ```

No error output here on purpose: if sending fails, the run stops red, the Reels aren't marked as sent, and they'll be in next Sunday's Digest instead (or you fix it and click Execute).

**Execute step** sends a real email. Resend answers with an `id`.

---

### 8. Supabase: "Mark sent"

**Update** `digests`, filter `id` **Equals** `{{ $('Save digest').first().json.id }}`, field `sent_at` = `{{ $now.toISO() }}`.

---

### 9. Supabase: "Link Reels"

1. **Update** `reels`. **Filter:** String:
   ```
   id=in.({{ $('Build email').first().json.reel_ids.join(',') || 0 }})
   ```
2. **Define Below:** `digest_id` = `{{ $('Save digest').first().json.id }}`.

This marks every Reel in the email as "in this Digest", so it's never sent twice. In an empty week the list is `(0)`, which matches nothing.

## C. Test it

1. **Preview first:** **Execute step** up to **Build email** and open the `html` in your browser (part B step 5). Check it reads well on a narrow window too.
2. **Send:** **Execute workflow**. Within a minute you get "*title* · Reel Digest *dates*" from `onboarding@resend.dev`. **Check spam** the first time and mark it "Not spam".
3. **Supabase:** `digests` has a row with `sent_at` filled, and your Reels have that row's id in `digest_id`.
4. **Nothing twice:** run again. You get the short "No Reels this week" email, and `reel_count = 0` in the new `digests` row. Delete that row and that email afterwards if you like.
5. **Go live:** flip **Active** on Digest. Make sure **Inbox, Transcribe and Summarise** are active too.

**If it fails:**
- **Send email 403 "only send testing emails to your own address":** `DIGEST_TO_EMAIL` isn't your Resend sign-up address.
- **Send email: `to` is empty or undefined:** n8n hasn't read `.env` yet. Run the restart command in part A step 5.
- **Send email 401:** the Resend credential value needs `Bearer ` in front of the key.
- **Link Reels changes nothing:** check `digest_id` in Supabase. If it's empty, look at the filter string (`id=in.(…)`).

When it all works, tick step 5 in the README and export the workflow (**⋯** → **Export JSON**) to `n8n/workflows/digest.json`.
