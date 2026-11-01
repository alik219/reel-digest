# Step 4: OpenRouter per-Reel summary

Goal: every transcribed Reel gets a short **summary**, one **Category** and up to three **Action Steps** within ~10 minutes, and its `status` becomes `done`. Step 5 builds the Sunday Digest from these rows.

This is a **third workflow, "Summarise"**. It picks up rows that Transcribe has finished (`has_speech` filled in) and that aren't `done` yet.

```
Every 10 minutes → Fetch transcribed Reels → Loop over reels
   loop → Build request → Summarise (OpenRouter) → Read summary → Save summary ─┐
          (any error output) → Describe failure → Save failure ────────────────┤
                                                                               └→ back into Loop over reels
```

## What one Reel turns into

`action_steps` is a list (saved as JSON in Supabase) in this shape, which step 5 relies on:

```json
{
  "summary": "Five skills pay off for the rest of your life: sales, clear writing, understanding people, cooking and money.",
  "category": "Money & Career",
  "action_steps": [
    {
      "step": "Track every expense for one week",
      "how": "Log each purchase in your notes app the moment you pay, and total it on Sunday.",
      "two_minute_version": "Write down what you've spent today."
    }
  ]
}
```

The `two_minute_version` is Atomic Habits' two-minute rule: a version small enough to start today.

## A. Get an OpenRouter key and add it to n8n (5 min)

1. Sign up at <https://openrouter.ai> (free) → **Keys** (<https://openrouter.ai/keys>) → **Create Key**. Copy it; it starts with `sk-or-`.
2. In n8n: **Credentials → Add credential** → search **OpenRouter** → paste the key into **API Key**. If there's an **Allowed HTTP Request Domains** option, choose **Specific Domains** → `openrouter.ai`. **Save**.

**Free limits:** 20 requests a minute and **50 a day** (1,000 a day once you've ever bought $10 of credit). Summarise makes one request per Reel, so 50 a day is plenty.

**Which model:** free models come and go every few weeks, so the request lists three in order: `openai/gpt-oss-120b:free`, then `google/gemma-4-31b-it:free`, then `openrouter/free` (any free model that's up). If the first is busy or gone, OpenRouter moves on to the next. To change them, edit `MODELS` at the top of **Build request**. The live free list is at <https://openrouter.ai/models?max_price=0>.

## B. Build the workflow "Summarise" (45–60 min)

**Overview → Create Workflow**, name it **Summarise**. Same basics as [step 2](step-2.md#n8n-basics-youll-use-in-every-node), and error outputs work as in [step 3](step-3.md).

---

### 1. Schedule Trigger: "Every 10 minutes"

**Trigger Interval:** Minutes, **Minutes Between Triggers:** `10`.

---

### 2. Supabase: "Fetch transcribed Reels"

*What it does: gets up to 5 Reels that Transcribe has finished but nobody has summarised yet.*

1. **Resource:** Row. **Operation:** Get Many. **Table:** `reels`. **Return All:** off. **Limit:** `5`.
2. **Filter:** String. **Filters (String):**
   ```
   status=eq.new&has_speech=not.is.null
   ```

This one uses the String filter because the normal filter list has no "is not empty". It reads: `status` equals `new` **and** `has_speech` is **not** empty. Transcribe only fills `has_speech` in when it's finished, so this workflow never grabs a Reel Transcribe is still working on.

**Execute step:** your 2 transcribed Reels (ids 4 and 5).

---

### 3. Loop Over Items: "Loop over reels"

**Batch Size:** `1`. Keep this exact name: **Build request**, **Read summary** and **Describe failure** look it up.

---

### 4. Code: "Build request" (on the loop's `loop` output)

1. **Mode:** Run Once for Each Item. Paste [n8n/code/build-summary-request.js](../n8n/code/build-summary-request.js).

This is where the prompt lives (`SYSTEM`). It sends your **Note** first, then the caption, then the Transcript (cut at 12,000 characters, so a long video still fits). For a No-speech Reel it says so, so the model works from the caption and doesn't make things up.

**Execute step:** OUTPUT has `id` and a `body` with `models` and two `messages`.

---

### 5. HTTP Request: "Summarise"

1. **Method:** POST. **URL:** `https://openrouter.ai/api/v1/chat/completions`
2. **Authentication:** Predefined Credential Type → **Credential Type:** OpenRouter → your OpenRouter credential.
3. **Send Body:** on. **Body Content Type:** JSON. **Specify Body:** Using JSON:
   ```
   {{ JSON.stringify($json.body) }}
   ```
4. **Options → Add option → Timeout:** `120000`.
5. **Settings → On Error:** Continue (using error output).

`{{ JSON.stringify($json.body) }}` sends the request **Build request** made, exactly as it is.

**Execute step:** OUTPUT has `model` (which free model answered) and `choices → 0 → message → content`, a block of JSON text.

---

### 6. Code: "Read summary"

1. **Mode:** Run Once for Each Item. Paste [n8n/code/read-summary.js](../n8n/code/read-summary.js).
2. **Settings → On Error:** Continue (using error output).

Free models don't always follow instructions, so this node checks the answer. It strips ```` ```json ```` wrappers, turns an unknown Category into `Other`, keeps at most 3 Action Steps, and fails (so the Reel gets its retry) if there's no usable summary.

---

### 7. Supabase: "Save summary"

1. **Resource:** Row. **Operation:** Update. **Table:** `reels`.
2. **Filter:** Build Manually → `id` **Equals** `{{ $json.id }}`.
3. **Data to Send:** Auto-Map Input Data to Columns. **Inputs to Ignore:** `id`.
4. **Settings → On Error:** Continue (using error output).
5. Connect its normal output back into **Loop over reels**' input.

**Auto-Map** writes `summary`, `category`, `action_steps` and `status` straight from **Read summary**'s output. Unlike "Define Below", it keeps `action_steps` a real list in Supabase rather than turning it into text. `id` is ignored because it's only used to find the row.

---

### 8. Code: "Describe failure"

**Mode:** Run Once for Each Item. Paste the same [n8n/code/describe-failure.js](../n8n/code/describe-failure.js) as in step 3. Connect **three** red **error** outputs into it: **Summarise**, **Read summary** and **Save summary**.

It shares `retry_count` with Transcribe, so a Reel gets one retry across the whole pipeline before it's a Failed Reel.

---

### 9. Supabase: "Save failure"

Same as step 3's: **Update** `reels`, filter `id` **Equals** `{{ $json.id }}`, fields `retry_count`, `status`, `last_error` from `{{ $json.… }}`. Connect its output back into **Loop over reels**.

## C. Test it

1. **Your 2 Reels:** **Execute workflow**. In Supabase, rows 4 and 5 now have a `summary`, a `category` (likely *Socialising & Relationships* and *Money & Career*), `action_steps`, and `status = done`. Read them. If the steps feel vague, tell Claude: the fix is a prompt change in **Build request**.
2. **Nothing left:** run again. **Fetch transcribed Reels** returns 0 items.
3. **With a Note:** share a Reel with a note (e.g. `<link> the bit about sleep`). Wait for Inbox and Transcribe (or run them), then run Summarise. The first Action Step should be about what your note named.
4. **Go live:** flip **Active** on Summarise.

**If it fails:**
- **Fetch transcribed Reels returns nothing, but Supabase has transcribed rows:** check the filter string for typos (`not.is.null`, with dots).
- **Summarise 401:** the OpenRouter key is wrong. Open the credential and paste it again.
- **Summarise 429, or `error` in the reply:** the free models are busy or you hit 50 a day. The Reel retries 10 minutes later.
- **"didn't return JSON":** that model ignored the format. The retry usually lands on another model. If it keeps happening, move a different model to the top of `MODELS`.

When it all works, tick step 4 in the README and export the workflow (**⋯** → **Export JSON**) to `n8n/workflows/summarise.json`.
