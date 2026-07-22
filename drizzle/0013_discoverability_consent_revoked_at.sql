ALTER TABLE "discoverability_consents" ALTER COLUMN "granted_at" DROP DEFAULT;
ALTER TABLE "discoverability_consents" ALTER COLUMN "granted_at" DROP NOT NULL;
ALTER TABLE "discoverability_consents" ADD COLUMN "revoked_at" timestamp with time zone;
