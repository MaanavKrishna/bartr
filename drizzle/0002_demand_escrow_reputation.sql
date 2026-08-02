-- Escrow, verified photos, demand, saved searches, moments.
--
-- These serve both marketplaces. Nothing here is campus-specific: a student
-- selling a mini fridge in May and a family clearing a garage in spring are
-- the same shape of transaction, so the tables are keyed on community rather
-- than on any notion of "student".

-- PostGIS lives in the `extensions` schema, and search_path does not carry
-- across migration files, so the `geography` type below needs it re-added.
SET search_path = public, extensions;

-- ------------------------------------------------------- photo verification
-- A photo taken inside the app is worth far more than an uploaded one: it
-- cannot be a stock image lifted from a retailer, which is how item-never-
-- existed fraud usually starts.

ALTER TABLE listing_images
  ADD COLUMN IF NOT EXISTS capture_source text NOT NULL DEFAULT 'upload'
    CHECK (capture_source IN ('upload', 'in_app_camera')),
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  -- Perceptual hash, so the same picture reposted across accounts is findable
  -- even after a crop or recompression.
  ADD COLUMN IF NOT EXISTS phash text;

CREATE INDEX IF NOT EXISTS listing_images_phash_idx ON listing_images (phash)
  WHERE phash IS NOT NULL;

-- ------------------------------------------------------------------- escrow
-- Holds a buyer's money between payment and handoff. The point is not payment
-- processing, it is removing the reason to go off-platform: neither side has
-- to trust the other, so neither has a motive to move to a payment rail with
-- no recourse.

CREATE TABLE IF NOT EXISTS escrows (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id         uuid NOT NULL REFERENCES listings (id) ON DELETE RESTRICT,
  buyer_id           uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  seller_id          uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  amount_cents       integer NOT NULL CHECK (amount_cents > 0),
  fee_cents          integer NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  currency           text NOT NULL DEFAULT 'USD',
  state              text NOT NULL DEFAULT 'created' CHECK (state IN (
                       'created', 'funded', 'released', 'refunded',
                       'disputed', 'cancelled')),
  -- Stripe PaymentIntent. Nullable until the buyer actually pays.
  payment_ref        text,
  buyer_confirmed_at  timestamptz,
  seller_confirmed_at timestamptz,
  funded_at          timestamptz,
  released_at        timestamptz,
  refunded_at        timestamptz,
  disputed_at        timestamptz,
  dispute_reason     text,
  /**
   * Money must never be held indefinitely. Once funded, this is the deadline
   * after which the funds release to the seller if the buyer neither confirms
   * nor disputes.
   */
  auto_release_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escrows_distinct_parties CHECK (buyer_id <> seller_id),
  -- A funded escrow must know which payment it belongs to, or the money is
  -- unreconcilable.
  CONSTRAINT escrows_funded_has_payment CHECK (
    state = 'created' OR state = 'cancelled' OR payment_ref IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS escrows_listing_idx ON escrows (listing_id);
CREATE INDEX IF NOT EXISTS escrows_buyer_idx   ON escrows (buyer_id);
CREATE INDEX IF NOT EXISTS escrows_seller_idx  ON escrows (seller_id);
-- Worker queue for auto-release; partial so the scan stays small.
CREATE INDEX IF NOT EXISTS escrows_auto_release_idx ON escrows (auto_release_at)
  WHERE state = 'funded' AND auto_release_at IS NOT NULL;

-- ------------------------------------------------------ demand and interest
-- `wanted` is a public "I am looking for X" post — the inverse index. Half of
-- barter starts from need, not supply, and no general marketplace indexes
-- demand well.
--
-- `saved_searches` is the private form of the same thing: stored criteria that
-- notify when a match appears. Both are matched against new listings by the
-- same code (src/lib/matching.ts), which is why their criteria columns are
-- deliberately identical in shape.

CREATE TABLE IF NOT EXISTS wanted_listings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   uuid NOT NULL REFERENCES communities (id) ON DELETE RESTRICT,
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text NOT NULL DEFAULT '',
  category       text,
  /** Budget ceiling in cents. Null means "open to offers". */
  budget_cents   integer CHECK (budget_cents IS NULL OR budget_cents >= 0),
  /** What the requester would trade instead of paying. */
  offering       text[] NOT NULL DEFAULT '{}',
  latitude       double precision,
  longitude      double precision,
  radius_m       integer NOT NULL DEFAULT 16000 CHECK (radius_m >= 0),
  status         text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'fulfilled', 'expired')),
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wanted_lat_range CHECK (latitude  IS NULL OR latitude  BETWEEN -90  AND 90),
  CONSTRAINT wanted_lng_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),

  geog geography(Point, 4326)
    GENERATED ALWAYS AS (
      CASE WHEN latitude IS NULL OR longitude IS NULL THEN NULL
           ELSE extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::geography
      END
    ) STORED,

  search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED
);

CREATE INDEX IF NOT EXISTS wanted_community_idx ON wanted_listings (community_id);
CREATE INDEX IF NOT EXISTS wanted_user_idx      ON wanted_listings (user_id);
CREATE INDEX IF NOT EXISTS wanted_status_idx    ON wanted_listings (status);
CREATE INDEX IF NOT EXISTS wanted_geog_idx      ON wanted_listings USING GIST (geog);
CREATE INDEX IF NOT EXISTS wanted_search_idx    ON wanted_listings USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS saved_searches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  community_id  uuid REFERENCES communities (id) ON DELETE CASCADE,
  name          text NOT NULL,
  /** The serialised ListingQuery, so a saved search is a shareable URL. */
  criteria      jsonb NOT NULL DEFAULT '{}'::jsonb,
  latitude      double precision,
  longitude     double precision,
  radius_m      integer NOT NULL DEFAULT 16000 CHECK (radius_m >= 0),
  cadence       text NOT NULL DEFAULT 'daily'
                  CHECK (cadence IN ('instant', 'daily', 'weekly', 'off')),
  last_run_at   timestamptz,
  last_notified_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_searches_user_idx ON saved_searches (user_id);
-- Worker queue: which alerts are due.
CREATE INDEX IF NOT EXISTS saved_searches_due_idx
  ON saved_searches (cadence, last_run_at)
  WHERE cadence <> 'off';

-- ------------------------------------------------------------------ moments
-- Trading is seasonal in both marketplaces, just on different calendars:
-- campus move-out in May, city moving season in summer, spring clearing, the
-- weeks after the winter holidays. A moment is a named window that the app can
-- surface ("selling before you move out?") and that analytics can group by.

CREATE TABLE IF NOT EXISTS moments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL,
  name         text NOT NULL,
  blurb        text NOT NULL DEFAULT '',
  /** Null community means the moment applies everywhere. */
  community_id uuid REFERENCES communities (id) ON DELETE CASCADE,
  /** Recurring window as month/day, so it repeats every year. */
  starts_month smallint NOT NULL CHECK (starts_month BETWEEN 1 AND 12),
  starts_day   smallint NOT NULL CHECK (starts_day BETWEEN 1 AND 31),
  ends_month   smallint NOT NULL CHECK (ends_month BETWEEN 1 AND 12),
  ends_day     smallint NOT NULL CHECK (ends_day BETWEEN 1 AND 31),
  categories   text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS moments_slug_key ON moments (slug, community_id)
  NULLS NOT DISTINCT;

-- ------------------------------------------------- reputation portability
-- Ratings are already global rather than per-community, so reputation ports
-- between the two marketplaces for free. What was missing is the evidence a
-- viewer needs to trust a cross-context score: how many trades, over how long,
-- and where they were earned.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_trade_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_trade_at  timestamptz,
  /** Denormalised count of distinct communities traded in. */
  ADD COLUMN IF NOT EXISTS communities_traded_in integer NOT NULL DEFAULT 0;

-- Which community a rating was earned in, so a profile can show provenance
-- ("32 trades at Dartmouth, 4 in the open marketplace").
ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES communities (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ratings_community_idx ON ratings (community_id);

-- ------------------------------------------------------------------- RLS
-- Same deny-by-default posture as 0001. Wanted listings are public demand, so
-- they are readable; everything else stays server-only.

ALTER TABLE escrows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wanted_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE moments         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wanted_public_read ON wanted_listings;
CREATE POLICY wanted_public_read ON wanted_listings
  FOR SELECT TO anon, authenticated
  USING (status = 'open');

DROP POLICY IF EXISTS moments_public_read ON moments;
CREATE POLICY moments_public_read ON moments
  FOR SELECT TO anon, authenticated
  USING (true);
