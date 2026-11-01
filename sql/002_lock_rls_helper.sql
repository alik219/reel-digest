-- Supabase's "Enable automatic RLS" option created public.rls_auto_enable().
-- Its security check flagged that anyone with the public key can call it.
-- Only Supabase's own trigger needs it, so take that away from the public roles.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
