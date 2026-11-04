-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "labels" TEXT[] DEFAULT ARRAY[]::TEXT[];
