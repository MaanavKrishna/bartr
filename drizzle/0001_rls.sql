-- Row level security.
--
-- Supabase exposes every table in `public` through PostgREST, reachable with
-- the anon key — which is published in the browser bundle by design. Without
-- RLS that key can read and write everything, including other people's
-- messages and offers. This migration closes that.
--
-- Posture: **deny by default**. The application reads and writes over a direct
-- Postgres connection as the table owner, which bypasses RLS, so locking the
-- PostgREST surface down costs the app nothing. Only data that is genuinely
-- public gets a read policy; everything else is unreachable with the anon key
-- until real auth exists and owner-scoped policies can be written against
-- `auth.uid()`.

-- `anon` and `authenticated` exist on Supabase but not on a bare local
-- Postgres. Create them only if missing so this migration runs in both places.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

ALTER TABLE communities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;

-- Public, read-only surface -------------------------------------------------
-- A marketplace's listings are meant to be browsable, so these three are
-- readable without a session. Note the `status = 'active'` predicate: closed
-- and pending listings stay private even here.

DROP POLICY IF EXISTS communities_public_read ON communities;
CREATE POLICY communities_public_read ON communities
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS listings_public_read ON listings;
CREATE POLICY listings_public_read ON listings
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS listing_images_public_read ON listing_images;
CREATE POLICY listing_images_public_read ON listing_images
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_images.listing_id AND l.status = 'active'
    )
  );

-- Everything else ------------------------------------------------------------
-- `users` deliberately gets no public read policy: the table holds email
-- addresses and RLS is row-level, not column-level, so a "public profile"
-- policy would leak them. Seller names reach the browser through the
-- server-rendered page instead. When auth lands, the shape to add is a
-- `public_profiles` view over the safe columns, plus owner-scoped policies
-- keyed on `auth.uid()` for offers, threads, messages, saves and
-- notifications.

-- Fixes the `function_search_path_mutable` advisory: pinning search_path stops
-- a caller from shadowing `array_to_string` with their own function, so the
-- schema-qualified call below is the only one that can run.
CREATE OR REPLACE FUNCTION bartr_join(arr text[])
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  RETURNS NULL ON NULL INPUT
  SET search_path = ''
AS $$ SELECT pg_catalog.array_to_string(arr, ' ') $$;
