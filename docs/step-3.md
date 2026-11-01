# Step 3: Apify + Groq Whisper → Transcript

Goal: every Reel in `reels` with `status = new` gets its caption and Transcript filled in within ~10 minutes, or is marked a No-speech Reel, or (after one retry) a Failed Reel.

This is a **second workflow, "Transcribe"**. Inbox stays as it is: it only saves links and replies fast. Transcribe picks up whatever Inbox saved.

```
Every 10 minutes → Fetch new Reels → Loop over reels
   loop → Which platform?
            instagram → Apify: Instagram ─┐
            tiktok    → Apify: TikTok ────┴→ Pick media → Download media → Name file → Whisper → Check speech → Save transcript ─┐
            youtube   → Apify: YouTube → YouTube transcript ──────────────────────────────────────────────────→ (Save transcript)  │
            other ─────────────────────────────────────────────────────────────────────────────────────────────┐                  │
   (any error output) ─────────────────────────────────────────────────────────────→ Describe failure → Save failure ─┤
                                                                                                                       └→ back into Loop over reels
```

## A. Get the two API keys (10 min)

Keys go **only** into n8n's credential store, never into chat, the workflow or git.

1. **Apify:** sign up at <https://console.apify.com> (free plan: $5 of credit a month). **Settings → API & Integrations** → copy your **Personal API token**.
2. **Groq:** sign up at <https://console.groq.com> (free). **API Keys → Create API Key** → copy it (it starts with `gsk_` and is shown once).

**What it costs:** Instagram ≈ $0.003, TikTok ≈ $0.005 and YouTube Shorts ≈ $0.005 per Reel on Apify, so the free $5 covers 1,000+ Reels a month. Groq's free tier is far above a few Reels a day.

## B. Add the credentials in n8n (5 min)

Left sidebar → **Credentials** → **Add credential**:

- **Groq:** search **Groq** and paste your key into **API Key**. Under **Allowed HTTP Request Domains**, choose **Specific Domains** and enter `api.groq.com`, so the key can only ever be sent to Groq.
- **Apify:** search **Header Auth** (not "Apify": that one is for the Apify MCP node in AI Agents). **Name:** `Authorization`, **Value:** `Bearer ` + your Apify token (mind the space). Click the credential's title and rename it **Apify**.

## C. Build the workflow "Transcribe" (60–90 min)

**Overview → Create Workflow**, name it **Transcribe**. The n8n basics from [step 2](step-2.md#n8n-basics-youll-use-in-every-node) all apply. Two new things in this step:

- **Error outputs.** In a node's **Settings** tab, **On Error → Continue (using error output)** gives the node a second, red **error** output. A failed item goes there instead of stopping the whole run. You'll connect every error output to **Describe failure**.
- **Binary data.** A downloaded file isn't JSON. It shows up in OUTPUT under a **Binary** tab, in a field called `data`.

---

### 1. Schedule Trigger: "Every 10 minutes"

**Trigger Interval:** Minutes, **Minutes Between Triggers:** `10`.

---

### 2. Supabase: "Fetch new Reels"

*What it does: gets up to 5 Reels that haven't been read yet.*

1. **Resource:** Row. **Operation:** Get Many. **Table:** `reels`.
2. **Return All:** off. **Limit:** `5`.
3. **Filter:** Build Manually. **Must Match:** All Filters. Two conditions:

   | Field Name | Condition | Field Value |
   |---|---|---|
   | `status` | Equals | `new` |
   | `has_speech` | Is | `null` |

`has_speech` stays empty until this workflow has read the Reel, so "empty" means "not done yet". A Reel that failed once also has it empty, so it gets its one retry 10 minutes later.

**Execute step:** you should see your saved Reels (ids 4 and 5).

---

### 3. Loop Over Items: "Loop over reels"

**Batch Size:** `1`. Same idea as in Inbox: one Reel at a time, so each Apify and Whisper result stays matched to its row.

---

### 4. Switch: "Which platform?" (on the loop's `loop` output)

1. **Mode:** Rules. Rule 1: `{{ $json.platform }}` **is equal to** `instagram`, output name `instagram`. Rule 2: same with `tiktok`. Rule 3: same with `youtube`.
2. **Options → Add option → Fallback Output:** Extra Output. **Rename Fallback Output:** `other`.

`other` catches links from any other site, which this step can't read.

---

### 5. HTTP Request: "Apify: Instagram" (on `instagram`)

*What it does: asks Apify to open the Reel and hand back its caption and a link to its audio.*

1. **Method:** POST.
2. **URL:** `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items`
3. **Authentication:** Generic Credential Type → **Header Auth** → **Apify**.
4. **Send Body:** on. **Body Content Type:** JSON. **Specify Body:** Using JSON:
   ```
   {
     "directUrls": ["{{ $json.url }}"],
     "resultsType": "posts",
     "resultsLimit": 1
   }
   ```
5. **Options → Add option → Timeout:** `300000` (Apify can take a minute; the default gives up too early).
6. **Options → Add option → Response → Include Response Headers and Status:** on.
7. **Settings → On Error:** Continue (using error output). Leave **Always Output Data** off.

`run-sync-get-dataset-items` means "run the scraper, wait, and give me its results". Turning on **Include Response Headers and Status** makes the node return Apify's whole answer as **one** item, with the results list in `body`, even when that list is empty. **Pick media** then reports "found nothing" as a failure. Don't use Always Output Data here: together with the error output, a failed call would go down *both* paths.

**Execute step:** OUTPUT has one item with `statusCode: 201` and a `body` list. Its first entry has `caption`, `shortCode`, `videoUrl` and `audioUrl`.

---

### 6. HTTP Request: "Apify: TikTok" (on `tiktok`)

Same as step 5, except:

- **URL:** `https://api.apify.com/v2/acts/clockworks~tiktok-video-scraper/run-sync-get-dataset-items`
- **Body:**
  ```
  {
    "postURLs": ["{{ $json.url }}"],
    "shouldDownloadVideos": true
  }
  ```

`shouldDownloadVideos` makes Apify save the video and return a link to it in `mediaUrls`. TikTok's own video links only work inside the TikTok app.

---

### 6b. HTTP Request: "Apify: YouTube" (on `youtube`)

*What it does: YouTube already writes captions for almost every video, so this just fetches them. No download, no Whisper. It's the same actor your `youtube-transcript` skill uses.*

Same as step 5, except:

- **URL:** `https://api.apify.com/v2/acts/starvibe~youtube-video-transcript/run-sync-get-dataset-items`
- **Body:**
  ```
  {
    "youtube_url": "{{ $json.url }}",
    "language": "en",
    "include_transcript_text": true
  }
  ```

Always send `language`: left blank, the actor sometimes picks a different language (it returned Arabic once in testing). `include_transcript_text` returns the captions as one block of text in `transcript_text`.

---

### 6c. Code: "YouTube transcript"

1. **Mode:** Run Once for Each Item. Paste [n8n/code/youtube-transcript.js](../n8n/code/youtube-transcript.js).
2. **Settings → On Error:** Continue (using error output).
3. Connect its normal output straight to **Save transcript** (step 12) once you've built it. It returns the same fields as **Check speech**.

A Short with no captions (usually music only) becomes a No-speech Reel. The title and description stand in for the caption.

---

### 7. Code: "Pick media"

*What it does: turns either platform's answer into the same four fields: `id`, `caption`, `mediaUrl`, `realUrl`.*

1. **Mode:** Run Once for Each Item. Paste [n8n/code/pick-media.js](../n8n/code/pick-media.js).
2. Connect the normal (green) outputs of **both** Apify nodes into it.
3. **Settings → On Error:** Continue (using error output).

`realUrl` is the Reel's real link. For `instagram.com/share/…` and `vm.tiktok.com/…` links, this is where the hidden code comes back, which closes step 2's known limit.

---

### 8. HTTP Request: "Download media"

1. **Method:** GET. **URL:** `{{ $json.mediaUrl }}`. **Authentication:** None.
2. **Options → Add option → Response → Response Format:** File. **Put Output in Field:** `data`.
3. **Settings → On Error:** Continue (using error output).

**Execute step:** OUTPUT shows a **Binary** tab with an audio/video file of a few hundred KB.

---

### 9. Code: "Name file"

**Mode:** Run Once for Each Item. Paste [n8n/code/name-file.js](../n8n/code/name-file.js).

Groq decides the file type from the file's name, and download links don't always end in `.mp4`.

---

### 10. HTTP Request: "Whisper"

*What it does: sends the audio to Groq, which returns the spoken words.*

1. **Method:** POST. **URL:** `https://api.groq.com/openai/v1/audio/transcriptions`
2. **Authentication:** Predefined Credential Type → **Credential Type:** Groq → your Groq credential.
3. **Send Body:** on. **Body Content Type:** Form-Data. Three parameters:

   | Parameter Type | Name | Value / Input Data Field Name |
   |---|---|---|
   | n8n Binary File | `file` | `data` |
   | Form Data | `model` | `whisper-large-v3-turbo` |
   | Form Data | `response_format` | `verbose_json` |

4. **Settings → On Error:** Continue (using error output).

`verbose_json` adds `segments`, and each one has Whisper's own `no_speech_prob` ("how sure am I this isn't speech?"). The next node uses it.

---

### 11. Code: "Check speech"

**Mode:** Run Once for Each Item. Paste [n8n/code/check-speech.js](../n8n/code/check-speech.js).

On a Reel with only music, Whisper still "hears" something like `Thank you.` This node calls it a No-speech Reel if there are fewer than 15 words, or if Whisper itself thinks it's mostly not speech. Then the Transcript stays empty and step 4 summarises from the caption instead.

---

### 12. Supabase: "Save transcript"

1. **Resource:** Row. **Operation:** Update. **Table:** `reels`.
2. **Filter:** Build Manually → `id` **Equals** `{{ $json.id }}`.
3. **Fields to Send:** Define Below:

   | Field Name | Field Value |
   |---|---|
   | `url` | `{{ $json.url }}` |
   | `caption` | `{{ $json.caption }}` |
   | `has_speech` | `{{ $json.has_speech }}` |
   | `transcript` | `{{ $json.transcript }}` |

4. **Settings → On Error:** Continue (using error output).
5. Connect its normal output back into **Loop over reels**' input.

`status` stays `new`: step 4 sets it to `done` once the summary is written.

---

### 13. Code: "Describe failure"

*What it does: one place that handles every failure. It counts the attempt and, on the second failure, marks the Reel as a Failed Reel.*

1. **Mode:** Run Once for Each Item. Paste [n8n/code/describe-failure.js](../n8n/code/describe-failure.js).
2. Connect **nine** lines into it: the red **error** outputs of **Apify: Instagram**, **Apify: TikTok**, **Apify: YouTube**, **Pick media**, **YouTube transcript**, **Download media**, **Whisper** and **Save transcript**, plus the Switch's **`other`** output.

---

### 14. Supabase: "Save failure"

1. **Resource:** Row. **Operation:** Update. **Table:** `reels`. **Filter:** `id` **Equals** `{{ $json.id }}`.
2. **Fields to Send:** `retry_count` = `{{ $json.retry_count }}`, `status` = `{{ $json.status }}`, `last_error` = `{{ $json.last_error }}`.
3. Connect its output back into **Loop over reels**' input.

Leave **Loop over reels**' `done` output unconnected: when every Reel is through, the run simply ends.

## D. Test it

1. **Instagram:** you already have 2 Reels in `reels`. **Execute workflow**. Both rows should get a `caption`, `has_speech` and (if someone talks) a `transcript`. Open **Whisper**'s OUTPUT to read what it heard.
2. **Nothing left:** run again. **Fetch new Reels** returns 0 items and the run stops there.
3. **No-speech:** share a Reel that's only music with text on screen. Run Inbox (or wait), then Transcribe. You should get `has_speech = false` and an empty transcript.
4. **Failure + retry:** in Supabase, add a row by hand with url `https://www.instagram.com/reel/thisdoesnotexist1`, platform `instagram`. Run: `retry_count = 1`, `last_error` filled, `status` still `new`. Run again: `retry_count = 2`, `status = failed`. Then delete the row.
5. **YouTube Short:** share a Short to your bot (YouTube app → **Share → Telegram**), run Inbox, then Transcribe. The path goes **Apify: YouTube → YouTube transcript → Save transcript**, and the row gets the title and description as `caption`, plus the captions as `transcript`.
6. **Go live:** flip **Active** (Publish). Share a Reel and within ~12 minutes (2 for Inbox, 10 for Transcribe) its transcript is in Supabase.

**If it fails:**
- **Apify 401, or 402 "Request not authenticated":** Apify didn't get a valid token. In the Header Auth credential, **Name** must be exactly `Authorization` and **Value** exactly `Bearer ` + the token (one space, no quotes).
- **Apify takes long, then "timeout":** check step 5's Timeout option.
- **Whisper 400 "file must be one of…":** **Name file** isn't between Download and Whisper, or **Input Data Field Name** isn't `data`.
- **Whisper 401:** open the Groq credential and click **Retry**: the key may have been revoked or mistyped.
- **Whisper "domain not allowed":** the Groq credential's **Allowed HTTP Request Domains** must include `api.groq.com`.
- **TikTok Download media 401/403:** your Apify account keeps its storage private. Tell Claude; the fix is a separate TikTok download that sends the Apify credential.

## Known limit

If an `instagram.com/share/…` link turns out to be a Reel you'd already saved under its normal link, **Save transcript** can't change the url (it's `unique`). The share copy ends up a Failed Reel with `duplicate key` in `last_error`, so the Digest lists it once more at the end. It's rare: sharing from the Instagram app normally gives `/reel/` links.

When it all works, tick step 3 in the README and export the workflow (**⋯** → **Export JSON**) to `n8n/workflows/transcribe.json`.
