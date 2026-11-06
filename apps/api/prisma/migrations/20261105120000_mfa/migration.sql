-- Two-step sign-in with an authenticator app (AS-25, AS-26).
ALTER TABLE "Person" ADD COLUMN "mfaSecret" TEXT,
ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mfaLastStep" INTEGER;
