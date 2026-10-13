-- Keep visible text limits in the shared contracts; these extra bounded bytes
-- hold stable public mention references. Capacity still charges actual octets.
ALTER TABLE hash_talk.community_posts DROP CONSTRAINT community_posts_title_check;
ALTER TABLE hash_talk.community_posts ADD CONSTRAINT community_posts_title_check CHECK(length(title)<=10000);
ALTER TABLE hash_talk.community_posts DROP CONSTRAINT community_posts_text_check;
ALTER TABLE hash_talk.community_posts ADD CONSTRAINT community_posts_text_check CHECK(length(text)<=16000);
ALTER TABLE hash_talk.communities DROP CONSTRAINT communities_description_check;
ALTER TABLE hash_talk.communities ADD CONSTRAINT communities_description_check CHECK(length(description)<=12000);
ALTER TABLE hash_talk.public_profile_descriptions DROP CONSTRAINT public_profile_descriptions_description_check;
ALTER TABLE hash_talk.public_profile_descriptions ADD CONSTRAINT public_profile_descriptions_description_check CHECK(char_length(description)<=10000);
CREATE FUNCTION hash_talk.community_name_key(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT replace(lower(trim(regexp_replace(normalize(value,NFKC) COLLATE pg_catalog."und-x-icu",'\s+',' ','g'))),'ς','σ');
$$;
-- Deliberately fail if old names collide: never silently rename owners' communities.
CREATE UNIQUE INDEX community_unique_name ON hash_talk.communities(hash_talk.community_name_key(name) text_pattern_ops);
