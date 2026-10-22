-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'BACKLOG';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "billable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "client" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "startDate" DATE;
