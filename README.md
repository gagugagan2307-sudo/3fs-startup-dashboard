# 3FS Creative Studio — Final Editable Dashboard

Upload `index.html`, `portal.html` and `3fs-logo.jpg` to the root of the existing GitHub Pages repository.

Features:
- Working dashboard and portal
- Custom add/edit/delete for clients, projects, teams, services, enquiries and partners
- Team 1–7 plus sub-member management
- Project completed/not completed status
- Income, revenue, investment and profit/loss fields
- Partner share and investment fields
- Project history
- Notifications/data sections
- Working theme selector with persistent themes
- Your 3FS logo
- Browser localStorage data persistence

The site can run on GitHub Pages or any static host. With Supabase configured, shared data is stored in the live database and synchronized in real time; localStorage is used as a fallback/cache.


## Multi-user authentication and access
This version uses Supabase Auth with email/password accounts. Every active 3FS team member is automatically an **Admin Team Member** with full access to the dashboard, data, user management, and real-time features. There are no Owner, CEO, Manager, Viewer, or restricted-member levels.

New accounts are created as `admin` automatically by the database trigger. You do not need to promote users manually. Database RLS enforces the same full-access team policy server-side.

Do not place a Supabase service-role/secret key in the website.


## No-Login Mode
Login authentication has been removed. The dashboard opens directly and existing admin permission checks remain enabled for all users. Supabase live sync uses the publishable key without requiring a signed-in session; configure Supabase RLS policies to allow the required anonymous access if live sync is desired.
