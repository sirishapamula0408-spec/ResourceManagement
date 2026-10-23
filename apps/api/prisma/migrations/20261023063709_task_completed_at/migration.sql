-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- Backfill: tasks already Done count as completed at their last update.
UPDATE "Task" SET "completedAt" = "updatedAt" WHERE "status" = 'DONE';
