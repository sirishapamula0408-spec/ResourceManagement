-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'DELIVERY_HEAD';
ALTER TYPE "Role" ADD VALUE 'RESOURCE_MANAGER';

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
