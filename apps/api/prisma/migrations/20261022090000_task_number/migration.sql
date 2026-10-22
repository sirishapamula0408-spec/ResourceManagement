-- AlterTable: SERIAL backfills existing rows with 1..n
ALTER TABLE "Task" ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Task_number_key" ON "Task"("number");
