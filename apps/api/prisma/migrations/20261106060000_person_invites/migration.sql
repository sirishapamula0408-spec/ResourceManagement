-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Person_inviteTokenHash_key" ON "Person"("inviteTokenHash");
