-- 0031_notification_alert_categories.sql
--
-- Add the opt-in alert categories from the product specification (nearby tasks,
-- promotions, and safety) to the set a user can toggle in notification
-- preferences. These are user-configurable groupings; delivery of the alerts
-- themselves is emitted by future/opt-in flows and always respects the stored
-- preference (the same way muting "offers" suppresses offer notifications).
--
-- Additive only: every previously valid category stays valid.

alter table public.notification_preferences
  drop constraint if exists notification_preferences_category_check;

alter table public.notification_preferences
  add constraint notification_preferences_category_check
  check (category in
    ('verification', 'offers', 'bookings', 'payments', 'messages', 'disputes',
     'reviews', 'system', 'nearby', 'promotions', 'safety'));
