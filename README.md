# Reel Digest

Share TikTok and Instagram Reels to a private Telegram bot; every Sunday at 9 AM get one article of summaries and habit-style Action Steps by email. Terms are defined in [CONTEXT.md](CONTEXT.md).

## Tools

n8n (Docker, local) · Telegram bot · Apify · Groq Whisper · OpenRouter · Supabase · Resend. All on free tiers.

## Build progress

- [x] 1. Supabase tables: run [sql/001_tables.sql](sql/001_tables.sql) and [sql/002_lock_rls_helper.sql](sql/002_lock_rls_helper.sql) in the Supabase SQL Editor
- [x] 2. n8n + Telegram bot + Receipt: follow [docs/step-2.md](docs/step-2.md) (workflow: [n8n/workflows/inbox.json](n8n/workflows/inbox.json))
- [ ] 3. Apify + Groq Whisper → Transcript
- [ ] 4. OpenRouter per-Reel summary
- [ ] 5. Sunday Digest via Resend
- [ ] 6. Supabase catcher (Reels saved while the PC is off)

## Later (parked)

- No-speech Reels read by a vision model
- ElevenLabs Narration
- Tracking whether Action Steps were done
- Live product: other users on paid monthly subscriptions

## Secrets

API keys live in n8n's credential store and a git-ignored `.env`. Never commit them.
