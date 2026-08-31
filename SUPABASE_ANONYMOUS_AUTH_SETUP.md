# 3FS Supabase + Reports Final Setup

## Anonymous Sign-Ins
The website already calls `supabase.auth.signInAnonymously()`.

Supabase must allow anonymous authentication in the project:
1. Open Supabase Dashboard for the project used by `supabase-config.js`.
2. Go to Authentication -> Sign In / Providers (the exact menu label can vary).
3. Enable **Anonymous Sign-Ins / Anonymous provider**.
4. Save.
5. Ensure the SQL in `database.sql` has been run in SQL Editor.
6. Enable Realtime for `public.threefs_state` if it is not already enabled.
7. Reload the 3FS website and check the top status for Live / realtime connection.

The browser must only use the publishable key. Never put a Supabase service-role/secret key into the website.

## Included fixes
- Projects navigation is a real button and has a touch-safe navigation fallback.
- Project records preserve the Assigned Team field.
- Reports have separate editable Profit and Loss slots.
- Report Data Entry lets the team enter corrected Profit, Loss and Notes.
- 3-Day Snapshot creates a fresh snapshot on demand.
- Every team receives a separate Team-wise 3-Day Snapshot card.
- Snapshot data is also kept in the 3FS shared store for Supabase sync.
