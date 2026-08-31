# 3FS Live Database — one required setup step

The mobile/layout and sync code is fixed, but real cross-device database sync cannot work until this file contains your actual Supabase project URL and publishable key.

Edit `supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  publishableKey: 'YOUR_SUPABASE_PUBLISHABLE_KEY'
};
```

Then run `database.sql` in the same Supabase project. The current SQL uses authenticated RLS, while the old front-end login is only a local gate. The included database migration enables the authenticated-session policies needed by the 3FS Anonymous Auth model. Do not put a service-role/secret key in the website.
