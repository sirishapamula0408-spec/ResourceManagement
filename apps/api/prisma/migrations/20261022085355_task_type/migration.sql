-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('STORY', 'TASK', 'BUG', 'SUPPORT');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "type" "TaskType" NOT NULL DEFAULT 'TASK';
