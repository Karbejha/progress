-- Run before db push. Existing installations allowed the same physical device
-- to remain linked to multiple accounts. Keep its most recent registration.
DO $$
BEGIN
  IF to_regclass('public."DeviceToken"') IS NOT NULL THEN
    DELETE FROM "DeviceToken" old
    USING "DeviceToken" newer
    WHERE old."token" = newer."token"
      AND (old."updatedAt", old."id") < (newer."updatedAt", newer."id");
    CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_token_key" ON "DeviceToken"("token");
  END IF;
END $$;
