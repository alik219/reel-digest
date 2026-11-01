// n8n Code node "Read summary" (mode: Run Once for Each Item).
// Input: OpenRouter's reply. Output: the columns "Save summary" writes, with
// status 'done'. Throws on anything unusable, so the item goes down the error
// output to "Describe failure" and gets one retry.

const CATEGORIES = [
  'AI & Tech',
  'Self-Help & Mindset',
  'Socialising & Relationships',
  'Health & Fitness',
  'Money & Career',
  'Other',
];

const id = $('Build request').item.json.id;

// OpenRouter can answer 200 with an error inside (e.g. every model was busy)
if ($json.error) throw new Error(`OpenRouter: ${$json.error.message ?? JSON.stringify($json.error)}`);

const content = $json.choices?.[0]?.message?.content ?? '';
const model = $json.model ?? 'unknown model';

// Free models sometimes wrap the JSON in ```json fences or add a sentence around it
const start = content.indexOf('{');
const end = content.lastIndexOf('}');
if (start === -1 || end <= start) throw new Error(`${model} didn't return JSON: ${content.slice(0, 200)}`);

let data;
try {
  data = JSON.parse(content.slice(start, end + 1));
} catch (e) {
  throw new Error(`${model} returned broken JSON: ${e.message}`);
}

const summary = String(data.summary ?? '').trim();
if (!summary) throw new Error(`${model} returned no summary`);

// Match the category even if the model changed its case or spacing; anything else is Other
const wanted = String(data.category ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const category = CATEGORIES.find((c) => c.toLowerCase() === wanted) ?? 'Other';

const actionSteps = (Array.isArray(data.action_steps) ? data.action_steps : [])
  .filter((s) => s && String(s.step ?? '').trim())
  .slice(0, 3)
  .map((s) => ({
    step: String(s.step).trim(),
    how: String(s.how ?? '').trim(),
    two_minute_version: String(s.two_minute_version ?? '').trim(),
  }));

return {
  json: { id, summary, category, action_steps: actionSteps, status: 'done' },
};
