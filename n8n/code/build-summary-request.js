// n8n Code node "Build request" (mode: Run Once for Each Item).
// Input: one transcribed Reel row from Supabase. Output: { id, body }, where body is
// the OpenRouter chat request that the "Summarise" HTTP node sends as-is.

// Tried in order; if one is down or rate-limited, OpenRouter moves to the next.
// openrouter/free picks any free model that's up, so the list can't go fully stale.
const MODELS = [
  'openai/gpt-oss-120b:free',
  'google/gemma-4-31b-it:free',
  'openrouter/free',
];

const CATEGORIES = [
  'AI & Tech',
  'Self-Help & Mindset',
  'Socialising & Relationships',
  'Health & Fitness',
  'Money & Career',
  'Other',
];

const SYSTEM = `You turn one short video (an Instagram Reel, TikTok or YouTube Short) into notes for a weekly self-improvement digest written in the style of Atomic Habits: practical, specific, no hype.

Reply with ONLY a JSON object, no markdown, in exactly this shape:
{
  "summary": "2-3 plain sentences: the video's main idea and why it matters. No 'In this video'.",
  "category": "one of: ${CATEGORIES.join(' | ')}",
  "action_steps": [
    {
      "step": "one concrete thing to do, as an instruction, max 12 words",
      "how": "exactly how to do it: when, where, or the words to say. 1-2 sentences.",
      "two_minute_version": "a version that takes under two minutes, to start the habit today"
    }
  ]
}

Rules:
- Use only what the video says. Never add facts, numbers, names or advice it doesn't contain.
- 1 to 3 action steps, best first. If the video has nothing anyone could act on (news, a joke), return an empty list.
- If the viewer left a note, it says what they care about: put that part first and build the steps around it.
- If there is no transcript, work from the caption only and keep the summary short. Don't guess what was said.
- Category guide: AI tools, apps, coding, tech news = "AI & Tech". Habits, discipline, motivation, mindset = "Self-Help & Mindset". Conversation, dating, friends, family = "Socialising & Relationships". Exercise, food, sleep = "Health & Fitness". Money, investing, jobs, skills for work = "Money & Career". Anything else = "Other".`;

const MAX_TRANSCRIPT_CHARS = 12000; // a long video still fits a free model's window

const reel = $json;
const transcript = (reel.transcript || '').slice(0, MAX_TRANSCRIPT_CHARS);
const user = [
  `Viewer's note: ${reel.note || '(none)'}`,
  `Caption: ${reel.caption || '(none)'}`,
  reel.has_speech && transcript
    ? `Transcript:\n${transcript}`
    : 'Transcript: (none: this video has no speech, only music and on-screen text)',
].join('\n\n');

return {
  json: {
    id: reel.id,
    body: {
      models: MODELS,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    },
  },
};
