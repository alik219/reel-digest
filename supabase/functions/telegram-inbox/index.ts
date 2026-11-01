// Supabase Edge Function "telegram-inbox" (step 6, the Supabase catcher).
// Telegram calls this URL (its "webhook") for every message sent to the bot. It saves
// the message to telegram_updates straight away, so Reels shared while the PC is off
// are kept, and n8n's Inbox handles them the next time it runs.
// Deployed with verify_jwt off: Telegram can't send a Supabase login, so the function
// does its own check and only keeps messages from you.

import { createClient } from 'npm:@supabase/supabase-js@2';

const MY_TELEGRAM_ID = 9225448547; // same number as in Inbox's "Parse updates"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // provided by Supabase, never in code
);

Deno.serve(async (req) => {
  // Always answer 200 to anything we choose to skip, or Telegram keeps retrying it
  if (req.method !== 'POST') return new Response('ok');

  let update;
  try {
    update = await req.json();
  } catch {
    return new Response('ok');
  }
  if (typeof update?.update_id !== 'number') return new Response('ok');
  if (update.message?.from?.id !== MY_TELEGRAM_ID) return new Response('ok'); // not you

  // update_id is the primary key, so a Telegram retry can't create a second row
  const { error } = await supabase
    .from('telegram_updates')
    .upsert({ update_id: update.update_id, payload: update }, { onConflict: 'update_id', ignoreDuplicates: true });

  if (error) {
    console.error('save failed', error.message);
    return new Response('retry', { status: 500 }); // Telegram tries again later
  }
  return new Response('ok');
});
