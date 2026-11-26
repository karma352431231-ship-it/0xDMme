-- Video stickers (owner decision 26/11/2026): a GIF from the chat becomes a
-- sticker in its original MP4 format, several times smaller than an animated
-- GIF. The rule only loosens, so every existing row still satisfies it; the
-- 1 MB and 1024 px bounds are unchanged.
ALTER TABLE hash_talk.public_stickers DROP CONSTRAINT public_stickers_type_check;
ALTER TABLE hash_talk.public_stickers ADD CONSTRAINT public_stickers_type_check
  CHECK(type IN ('image/png','image/gif','video/mp4'));
