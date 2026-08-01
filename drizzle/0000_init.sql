-- Bartr initial schema.
--
-- Safe to run on Supabase: both extensions below are available there, and
-- `postgis` lives in the `extensions` schema on Supabase but resolves through
-- the default search_path either way.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- `array_to_string` is declared STABLE rather than IMMUTABLE because, for an
-- arbitrary element type, it depends on that type's output function. For
-- `text[]` specifically there is no such dependency — joining text with a
-- literal separator is genuinely immutable — so this narrowly-typed wrapper is
-- safe to declare IMMUTABLE, and lets the search vector below be a generated
-- column instead of a trigger.
CREATE OR REPLACE FUNCTION bartr_join(arr text[])
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  RETURNS NULL ON NULL INPUT
AS $$ SELECT array_to_string(arr, ' ') $$;

-- ---------------------------------------------------------------- communities

CREATE TABLE IF NOT EXISTS communities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL,
  name             text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('university', 'public')),
  email_domain     text,
  center_lat       double precision,
  center_lng       double precision,
  default_radius_m integer NOT NULL DEFAULT 8000,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- A university community is only meaningful with a domain to verify against;
  -- a public one must not claim a domain.
  CONSTRAINT communities_domain_matches_kind CHECK (
    (kind = 'university' AND email_domain IS NOT NULL) OR
    (kind = 'public'     AND email_domain IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS communities_slug_key ON communities (slug);
CREATE UNIQUE INDEX IF NOT EXISTS communities_email_domain_key ON communities (email_domain);

-- --------------------------------------------------------------------- users

CREATE TABLE IF NOT EXISTS users (
  id                 uuid PRIMARY KEY,
  email              text NOT NULL,
  handle             text NOT NULL,
  display_name       text NOT NULL,
  bio                text NOT NULL DEFAULT '',
  avatar_url         text,
  home_lat           double precision,
  home_lng           double precision,
  home_label         text,
  preferred_radius_m integer NOT NULL DEFAULT 16000,
  rating_avg         double precision,
  rating_count       integer NOT NULL DEFAULT 0,
  trades_completed   integer NOT NULL DEFAULT 0,
  email_verified_at  timestamptz,
  suspended_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_rating_range CHECK (rating_avg IS NULL OR (rating_avg >= 0 AND rating_avg <= 5))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_handle_key ON users (lower(handle));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

-- ------------------------------------------------------------- verifications

CREATE TABLE IF NOT EXISTS verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('email', 'student', 'phone')),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  community_id uuid REFERENCES communities (id) ON DELETE CASCADE,
  evidence     text,
  verified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Only student verifications are scoped to a community.
  CONSTRAINT verifications_community_matches_kind CHECK (
    (kind = 'student' AND community_id IS NOT NULL) OR
    (kind <> 'student' AND community_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS verifications_user_idx ON verifications (user_id);

-- NULLS NOT DISTINCT so a user cannot hold two `email` rows (both with a null
-- community), which plain UNIQUE would allow.
CREATE UNIQUE INDEX IF NOT EXISTS verifications_unique
  ON verifications (user_id, kind, community_id) NULLS NOT DISTINCT;

-- ------------------------------------------------------------------ listings

CREATE TABLE IF NOT EXISTS listings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   uuid NOT NULL REFERENCES communities (id) ON DELETE RESTRICT,
  seller_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('sale', 'barter', 'free')),
  price_cents    integer,
  wants          text[] NOT NULL DEFAULT '{}',
  category       text NOT NULL,
  condition      text NOT NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'closed')),
  latitude       double precision NOT NULL,
  longitude      double precision NOT NULL,
  location_label text NOT NULL,
  tags           text[] NOT NULL DEFAULT '{}',
  views          integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT listings_lat_range CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT listings_lng_range CHECK (longitude BETWEEN -180 AND 180),

  -- Enforce in the database what the Zod schema enforces at the edge: only
  -- sale listings carry a price, and it is never negative.
  CONSTRAINT listings_price_matches_kind CHECK (
    (kind = 'sale' AND price_cents IS NOT NULL AND price_cents >= 0) OR
    (kind <> 'sale' AND price_cents IS NULL)
  ),

  -- Geography point derived from the two columns above, so they cannot drift.
  geog geography(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED,

  -- Weighted full-text index: a title hit outranks a tag hit outranks prose.
  search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(bartr_join(tags), '')), 'B') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(bartr_join(wants), '')), 'C')
    ) STORED
);

CREATE INDEX IF NOT EXISTS listings_community_idx ON listings (community_id);
CREATE INDEX IF NOT EXISTS listings_seller_idx    ON listings (seller_id);
CREATE INDEX IF NOT EXISTS listings_category_idx  ON listings (category);
CREATE INDEX IF NOT EXISTS listings_created_idx   ON listings (created_at DESC);
CREATE INDEX IF NOT EXISTS listings_status_idx    ON listings (status);
CREATE INDEX IF NOT EXISTS listings_geog_idx      ON listings USING GIST (geog);
CREATE INDEX IF NOT EXISTS listings_search_idx    ON listings USING GIN (search_vector);
-- Trigram index rescues misspelled searches that full-text misses entirely.
CREATE INDEX IF NOT EXISTS listings_title_trgm_idx ON listings USING GIN (title gin_trgm_ops);

-- ------------------------------------------------------------ listing images

CREATE TABLE IF NOT EXISTS listing_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  width        integer,
  height       integer,
  blurhash     text,
  position     smallint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_images_listing_idx ON listing_images (listing_id, position);

-- -------------------------------------------------------------------- offers

CREATE TABLE IF NOT EXISTS offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('cash', 'trade')),
  amount_cents integer,
  offered_item text,
  message      text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT offers_shape_matches_kind CHECK (
    (kind = 'cash'  AND amount_cents IS NOT NULL AND amount_cents >= 0) OR
    (kind = 'trade' AND offered_item IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS offers_listing_idx   ON offers (listing_id);
CREATE INDEX IF NOT EXISTS offers_from_user_idx ON offers (from_user_id);

-- ------------------------------------------------------------------ messages

CREATE TABLE IF NOT EXISTS threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  buyer_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seller_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT threads_distinct_parties CHECK (buyer_id <> seller_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS threads_listing_buyer_key ON threads (listing_id, buyer_id);
CREATE INDEX IF NOT EXISTS threads_seller_idx ON threads (seller_id);

CREATE TABLE IF NOT EXISTS messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body       text NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (thread_id, created_at);

-- ------------------------------------------------------------------- ratings

CREATE TABLE IF NOT EXISTS ratings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  rater_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ratee_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  score      smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ratings_no_self CHECK (rater_id <> ratee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ratings_unique    ON ratings (listing_id, rater_id);
CREATE INDEX        IF NOT EXISTS ratings_ratee_idx ON ratings (ratee_id);

-- ------------------------------------------------------------ saved listings

CREATE TABLE IF NOT EXISTS saved_listings (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS saved_listings_user_idx ON saved_listings (user_id, created_at DESC);

-- ------------------------------------------------------------- notifications

CREATE TABLE IF NOT EXISTS notifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN (
                     'offer_received', 'offer_accepted', 'offer_declined',
                     'message_received', 'rating_received')),
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at          timestamptz,
  emailed_at       timestamptz,
  email_suppressed boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- Unsent email queue: the partial index keeps the worker's scan tiny.
CREATE INDEX IF NOT EXISTS notifications_pending_email_idx
  ON notifications (created_at)
  WHERE emailed_at IS NULL AND email_suppressed = false;
