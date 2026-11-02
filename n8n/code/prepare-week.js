// n8n Code node "Prepare week" (mode: Run Once for All Items).
// Started by the Sunday schedule or by "/digest" in Telegram.
// Input: every Reel not yet in a Digest (done or failed). Output: one item with the
// week grouped by Category, the Failed Reels, and the OpenRouter request that writes
// the article's connecting text. The summaries and Action Steps themselves go into
// the email untouched (see "Build email"), so nothing is lost or invented.

const MODELS = [
  'openai/gpt-oss-120b:free',
  'google/gemma-4-31b-it:free',
  'openrouter/free',
];

// The order Categories appear in the Digest
const CATEGORIES = [
  'Self-Help & Mindset',
  'Health & Fitness',
  'Socialising & Relationships',
  'Money & Career',
  'AI & Tech',
  'Other',
];

// "Always Output Data" sends one empty item when there are no Reels at all
const rows = $input.all().map((i) => i.json).filter((r) => r.id);
const done = rows.filter((r) => r.status === 'done');
const failed = rows.filter((r) => r.status === 'failed');

const categories = CATEGORIES
  .map((name) => ({
    name,
    reels: done
      .filter((r) => (CATEGORIES.includes(r.category) ? r.category : 'Other') === name)
      .map((r) => ({
        id: r.id,
        url: r.url,
        platform: r.platform,
        note: r.note,
        has_speech: r.has_speech,
        summary: r.summary,
        action_steps: Array.isArray(r.action_steps) ? r.action_steps : [],
      })),
  }))
  .filter((c) => c.reels.length > 0);

// What the model sees: summaries and steps only, grouped like the email
const week = categories.length
  ? categories
      .map((c) => `## ${c.name}\n` + c.reels
        .map((r) => `- ${r.summary}\n  Steps: ${r.action_steps.map((s) => s.step).join('; ') || '(none)'}`)
        .join('\n'))
      .join('\n\n')
  : '(No Reels were saved this week.)';

const SYSTEM = `You write the connecting text for a personal weekly digest of short self-improvement videos the reader saved. Voice: James Clear's Atomic Habits: warm, plain, practical, short sentences, no hype, no emojis.

You get the week's videos as summaries grouped by Category. The summaries and action steps are shown to the reader separately, so don't repeat them. Your job is only the glue.

Reply with ONLY a JSON object, no markdown:
{
  "title": "a short title for this week, max 8 words",
  "intro": "2 short paragraphs (separate them with a blank line): the thread that runs through this week's videos and why it matters",
  "sections": { "<Category name exactly as given>": "one sentence that introduces that group" },
  "habit_of_the_week": {
    "habit": "the single habit from this week most worth starting",
    "why": "one sentence on why this one",
    "two_minute_version": "how to start it in under two minutes",
    "habit_stack": "After I [an existing daily habit], I will [the new habit]."
  }
}

Use only ideas that appear in the videos. If there are no videos this week, set "sections" to {}, "habit_of_the_week" to null, and write a two-sentence intro encouraging the reader to save a few this week.`;

const today = $now.setZone('America/Toronto').startOf('day');
const manual = $('When /digest is sent').isExecuted; // started from Telegram, not the schedule

let start;
let end;
if (manual) {
  // "/digest": everything since the last Digest, from the first of those Reels up to today
  const first = rows.map((r) => r.shared_at).filter(Boolean).sort()[0];
  end = today;
  start = first ? DateTime.fromISO(first).setZone('America/Toronto').startOf('day') : today;
} else {
  // Scheduled: the week always ends on the most recent Sunday, so a Monday catch-up
  // run (PC was off at 9 AM Sunday) still covers and labels the same week
  end = today.minus({ days: today.weekday % 7 }); // Luxon: Sunday is 7, Monday 1
  start = end.minus({ days: 6 });
}
const sameDay = start.toISODate() === end.toISODate();

return [{
  json: {
    week_start: start.toISODate(),
    week_end: end.toISODate(),
    week_label: sameDay ? end.toFormat('d LLL yyyy') : `${start.toFormat('d LLL')} – ${end.toFormat('d LLL yyyy')}`,
    reel_ids: rows.map((r) => r.id),
    reel_count: done.length,
    categories,
    failed: failed.map((r) => ({ url: r.url, platform: r.platform, note: r.note, last_error: r.last_error })),
    body: {
      models: MODELS,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `This week's videos:\n\n${week}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    },
  },
}];
