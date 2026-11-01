// n8n Code node "Build email" (mode: Run Once for All Items).
// Input: OpenRouter's reply with the connecting text (or an error item: "Write article"
// continues on error). Output: one item with subject, html, text and the digests row.
// If the model failed or rambled, the email still goes out with a plain intro.

const week = $('Prepare week').first().json;
const reply = $input.first().json;

// ---- 1. The model's connecting text, with safe fallbacks ----
const content = reply.choices?.[0]?.message?.content ?? '';
let ai;
try {
  ai = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
} catch (e) {
  // Free models sometimes garble a key or two. Rescue every "key": "value" pair
  // that's still readable instead of throwing the whole reply away.
  const pick = (key) => {
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = content.match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (!m) return undefined;
    try { return JSON.parse(`"${m[1]}"`); } catch (err) { return undefined; }
  };
  ai = {
    title: pick('title'),
    intro: pick('intro'),
    sections: Object.fromEntries(week.categories.map((c) => [c.name, pick(c.name)])),
    habit_of_the_week: {
      habit: pick('habit'),
      why: pick('why'),
      two_minute_version: pick('two_minute_version'),
      habit_stack: pick('habit_stack'),
    },
  };
}
const title = String(ai.title || 'Your week in Reels').trim();
const intro = String(ai.intro || (week.reel_count
  ? `Here are the ${week.reel_count} Reels you saved this week, grouped by topic, each with the steps to act on it.`
  : 'No Reels this week. Save a few as you scroll and they\'ll be here next Sunday.')).trim();
const sections = ai.sections && typeof ai.sections === 'object' ? ai.sections : {};
// The habit box needs a headline: the habit itself, or failing that its habit stack
const h = ai.habit_of_the_week || {};
const habit = (h.habit || h.habit_stack) ? { ...h, habit: h.habit || h.habit_stack } : null;

// ---- 2. HTML helpers (everything from the database or the model is escaped) ----
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = (s, style) => String(s).split(/\n\s*\n/).map((p) => `<p style="${style}">${esc(p.trim())}</p>`).join('');
const P = 'margin:0 0 14px;font-size:16px;line-height:1.6;color:#222;';
const SMALL = 'margin:0 0 8px;font-size:14px;line-height:1.5;color:#555;';
const PLATFORM = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', other: 'link' };

const stepHtml = (s) => `
  <li style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#222;">
    <strong>${esc(s.step)}</strong>${s.how ? `<br>${esc(s.how)}` : ''}
    ${s.two_minute_version ? `<br><span style="color:#2f6f4f;">Start small: ${esc(s.two_minute_version)}</span>` : ''}
  </li>`;

const reelHtml = (r) => `
  <div style="margin:0 0 22px;padding:16px 18px;background:#f7f7f5;border-radius:10px;">
    <p style="${P}">${esc(r.summary)}</p>
    ${r.note ? `<p style="${SMALL}"><em>Your note: ${esc(r.note)}</em></p>` : ''}
    ${r.has_speech === false ? `<p style="${SMALL}">(No speech in this one: summarised from its caption.)</p>` : ''}
    ${r.action_steps.length ? `<ol style="margin:4px 0 8px;padding-left:20px;">${r.action_steps.map(stepHtml).join('')}</ol>` : ''}
    <p style="margin:0;font-size:14px;"><a href="${esc(r.url)}" style="color:#2f5fbf;">Watch again on ${PLATFORM[r.platform] ?? 'the web'} →</a></p>
  </div>`;

const habitHtml = habit ? `
  <div style="margin:8px 0 28px;padding:18px 20px;border:2px solid #2f6f4f;border-radius:10px;">
    <p style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#2f6f4f;">Habit of the week</p>
    <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#222;">${esc(habit.habit)}</p>
    ${habit.why ? `<p style="${P}">${esc(habit.why)}</p>` : ''}
    ${habit.two_minute_version ? `<p style="${SMALL}"><strong>Two-minute version:</strong> ${esc(habit.two_minute_version)}</p>` : ''}
    ${habit.habit_stack && habit.habit_stack !== habit.habit ? `<p style="${SMALL}"><strong>Habit stack:</strong> ${esc(habit.habit_stack)}</p>` : ''}
  </div>` : '';

const categoriesHtml = week.categories.map((c) => `
  <h2 style="margin:32px 0 6px;font-size:20px;color:#111;">${esc(c.name)}</h2>
  ${sections[c.name] ? `<p style="${SMALL}">${esc(sections[c.name])}</p>` : ''}
  ${c.reels.map(reelHtml).join('')}`).join('');

const failedHtml = week.failed.length ? `
  <h2 style="margin:32px 0 6px;font-size:18px;color:#111;">Couldn't read these</h2>
  <p style="${SMALL}">Worth a rewatch yourself:</p>
  <ul style="padding-left:20px;">${week.failed.map((f) => `
    <li style="${SMALL}"><a href="${esc(f.url)}" style="color:#2f5fbf;">${esc(f.url)}</a>${f.note ? ` (your note: ${esc(f.note)})` : ''}</li>`).join('')}
  </ul>` : '';

const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:640px;margin:0 auto;padding:28px 18px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <p style="margin:0 0 4px;font-size:13px;color:#777;">Reel Digest · ${esc(week.week_label)}</p>
  <h1 style="margin:0 0 18px;font-size:26px;line-height:1.25;color:#111;">${esc(title)}</h1>
  ${paras(intro, P)}
  ${habitHtml}
  ${categoriesHtml}
  ${failedHtml}
  <p style="margin:36px 0 0;font-size:12px;color:#999;">${week.reel_count} Reels this week. Sent by your Reel Digest.</p>
</div></body></html>`;

// ---- 3. Plain-text version (for read-aloud and plain mail apps) ----
const lines = [title, week.week_label, '', intro, ''];
if (habit) lines.push(`HABIT OF THE WEEK: ${habit.habit}`, habit.why || '', habit.two_minute_version ? `Two-minute version: ${habit.two_minute_version}` : '', habit.habit_stack !== habit.habit ? habit.habit_stack || '' : '', '');
for (const c of week.categories) {
  lines.push(c.name.toUpperCase(), sections[c.name] || '', '');
  for (const r of c.reels) {
    lines.push(r.summary);
    r.action_steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.step}${s.how ? ` – ${s.how}` : ''}${s.two_minute_version ? ` (Start small: ${s.two_minute_version})` : ''}`));
    lines.push(`  ${r.url}`, '');
  }
}
if (week.failed.length) lines.push("COULDN'T READ THESE", ...week.failed.map((f) => `  ${f.url}`), '');
const text = lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');

return [{
  json: {
    subject: `${title} · Reel Digest ${week.week_label}`,
    html,
    text,
    week_start: week.week_start,
    week_end: week.week_end,
    reel_count: week.reel_count,
    reel_ids: week.reel_ids,
  },
}];
