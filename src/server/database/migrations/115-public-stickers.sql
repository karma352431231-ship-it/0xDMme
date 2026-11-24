-- Public stickers (owner decision 24/11/2026). A public sticker is one small
-- image owned by a public profile, served at a stable address only while its
-- moderation review is released, like profile banners. Packs group up to 30
-- stickers; other profiles add packs to their sticker panel. Every table is
-- charged to the global content capacity and removed with its profile.
ALTER TABLE hash_talk.public_moderation DROP CONSTRAINT public_moderation_kind_check;
ALTER TABLE hash_talk.public_moderation ADD CHECK(kind IN
  ('avatar','profile-banner','community-photo','community-banner','post-media','sticker'));

CREATE TABLE hash_talk.public_stickers (
  id uuid PRIMARY KEY,
  owner uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  bytes bytea CHECK(octet_length(bytes) BETWEEN 1 AND 1000000),
  type text CHECK(type IN ('image/png','image/gif')),
  width integer NOT NULL CHECK(width BETWEEN 1 AND 1024),
  height integer NOT NULL CHECK(height BETWEEN 1 AND 1024),
  review uuid REFERENCES hash_talk.public_moderation(id) ON DELETE SET NULL,
  content_hash text GENERATED ALWAYS AS (encode(sha256(bytes),'hex')) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  charge integer GENERATED ALWAYS AS (256+coalesce(octet_length(bytes),0)) STORED,
  CHECK((bytes IS NULL)=(type IS NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX public_sticker_owner ON hash_talk.public_stickers(owner,created_at DESC,id DESC);

CREATE TABLE hash_talk.public_sticker_packs (
  id uuid PRIMARY KEY,
  owner uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  adds integer NOT NULL DEFAULT 0 CHECK(adds>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  charge integer GENERATED ALWAYS AS (256+octet_length(name)) STORED
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX public_sticker_pack_owner ON hash_talk.public_sticker_packs(owner,created_at DESC,id DESC);
CREATE INDEX public_sticker_pack_popular ON hash_talk.public_sticker_packs(adds DESC,created_at DESC,id DESC);

CREATE TABLE hash_talk.public_sticker_pack_items (
  pack uuid NOT NULL REFERENCES hash_talk.public_sticker_packs(id) ON DELETE CASCADE,
  sticker uuid NOT NULL REFERENCES hash_talk.public_stickers(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK(position BETWEEN 0 AND 29),
  charge integer NOT NULL DEFAULT 64 CHECK(charge=64),
  PRIMARY KEY(pack,sticker)
);
CREATE INDEX public_sticker_pack_item_sticker ON hash_talk.public_sticker_pack_items(sticker);

CREATE TABLE hash_talk.public_sticker_pack_adds (
  profile uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  pack uuid NOT NULL REFERENCES hash_talk.public_sticker_packs(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  charge integer NOT NULL DEFAULT 64 CHECK(charge=64),
  PRIMARY KEY(profile,pack)
);
CREATE INDEX public_sticker_pack_add_pack ON hash_talk.public_sticker_pack_adds(pack);

DO $$
DECLARE source text;
BEGIN
  FOREACH source IN ARRAY ARRAY['public_stickers','public_sticker_packs',
    'public_sticker_pack_items','public_sticker_pack_adds']
  LOOP
    EXECUTE format('CREATE TRIGGER content_usage_insert AFTER INSERT ON hash_talk.%I
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_statement_content_usage()',source);
    EXECUTE format('CREATE TRIGGER content_usage_update AFTER UPDATE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_statement_content_usage()',source);
    EXECUTE format('CREATE TRIGGER content_usage_delete AFTER DELETE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_statement_content_usage()',source);
  END LOOP;
END;
$$;
