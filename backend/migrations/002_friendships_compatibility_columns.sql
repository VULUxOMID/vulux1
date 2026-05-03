ALTER TABLE friendships ADD COLUMN IF NOT EXISTS requester_user_id TEXT;
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS addressee_user_id TEXT;
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE friendships
SET
  requester_user_id = COALESCE(requester_user_id, requested_by, user_low_id),
  addressee_user_id = COALESCE(
    addressee_user_id,
    CASE
      WHEN requested_by = user_low_id THEN user_high_id
      WHEN requested_by = user_high_id THEN user_low_id
      ELSE user_high_id
    END
  )
WHERE requester_user_id IS NULL OR addressee_user_id IS NULL;

