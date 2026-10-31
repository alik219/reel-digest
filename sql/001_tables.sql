-- Reel Digest: step 1 tables.
-- Paste this whole file into Supabase > SQL Editor and click Run.

-- One row per weekly Digest. Created first because reels point to it.
create table digests (
  id          bigint generated always as identity primary key,
  week_start  date not null,                 -- first day covered
  week_end    date not null,                 -- last day covered
  article     text,                          -- the finished Digest (email HTML)
  reel_count  int  not null default 0,       -- 0 = the "no Reels this week" email
  sent_at     timestamptz,                   -- empty until Resend sends it
  created_at  timestamptz not null default now()
);

-- One row per Reel shared into the Inbox.
create table reels (
  id            bigint generated always as identity primary key,
  url           text not null unique,        -- cleaned link; unique blocks duplicates
  platform      text not null
                check (platform in ('tiktok', 'instagram', 'youtube', 'other')),
  shared_at     timestamptz not null default now(),
  note          text,                        -- what you typed with the link

  -- Filled in by step 3 (Apify + Whisper)
  caption       text,
  transcript    text,
  has_speech    boolean,                     -- false = No-speech Reel

  -- Filled in by step 4 (OpenRouter)
  summary       text,
  category      text
                check (category in ('AI & Tech', 'Self-Help & Mindset',
                  'Socialising & Relationships', 'Health & Fitness',
                  'Money & Career', 'Other')),
  action_steps  jsonb,                       -- flexible shape, so the style can change

  -- Processing state
  status        text not null default 'new'
                check (status in ('new', 'done', 'failed')),
  retry_count   int  not null default 0,
  last_error    text,

  digest_id     bigint references digests (id),  -- empty until a Digest covers it
  created_at    timestamptz not null default now()
);

-- Speeds up "which Reels still need processing / a Digest?"
create index reels_status_idx on reels (status);
create index reels_digest_idx on reels (digest_id);

-- Lock the tables to the public key. n8n uses the secret key, which bypasses this.
alter table digests enable row level security;
alter table reels   enable row level security;

-- New tables aren't exposed to the Data API automatically (we turned that off),
-- so give only the secret-key role (what n8n uses) access.
grant select, insert, update, delete on digests, reels to service_role;
