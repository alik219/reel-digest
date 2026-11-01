-- Reel Digest: step 6, the Supabase catcher.
-- Telegram sends every message to the "telegram-inbox" Edge Function, which saves it
-- here straight away, even while the PC (and n8n) are off. n8n's Inbox reads the rows
-- with processed_at empty and fills processed_at in once it has replied.

create table telegram_updates (
  update_id     bigint primary key,               -- Telegram's own id; retries can't duplicate
  payload       jsonb not null,                   -- the whole Telegram update, as sent
  received_at   timestamptz not null default now(),
  processed_at  timestamptz                       -- empty until Inbox has handled it
);

-- Speeds up "which messages hasn't Inbox handled yet?"
create index telegram_updates_unprocessed_idx on telegram_updates (update_id) where processed_at is null;

-- Same lock-down as the other tables: only the secret key (n8n, the Edge Function) gets in
alter table telegram_updates enable row level security;
grant select, insert, update, delete on telegram_updates to service_role;
