// n8n Code node "Check speech" (mode: Run Once for Each Item).
// Input: Groq Whisper's verbose_json. Output: the fields "Save transcript" writes.
// On music-only Reels Whisper still "hears" a few words, so a short result, or one
// Whisper itself thinks is probably not speech, counts as a No-speech Reel.

const MIN_WORDS = 15;          // fewer than this is not enough to summarise
const MAX_NO_SPEECH = 0.5;     // Whisper's own "this is probably not speech" score, 0 to 1

const text = ($json.text ?? '').trim();
const segments = $json.segments ?? [];

const words = text.split(/\s+/).filter(Boolean).length;
const noSpeech = segments.length
  ? segments.reduce((sum, s) => sum + (s.no_speech_prob ?? 0), 0) / segments.length
  : 1;
const hasSpeech = words >= MIN_WORDS && noSpeech < MAX_NO_SPEECH;

const media = $('Pick media').item.json;
return {
  json: {
    id: media.id,
    url: media.realUrl,
    caption: media.caption,
    has_speech: hasSpeech,
    transcript: hasSpeech ? text : '',
  },
};
