-- CreateEnum
CREATE TYPE "TaskLinkType" AS ENUM ('BLOCKS', 'RELATES');

-- CreateTable
CREATE TABLE "TaskLink" (
    "id" TEXT NOT NULL,
    "type" "TaskLinkType" NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskLink_toId_idx" ON "TaskLink"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLink_fromId_toId_type_key" ON "TaskLink"("fromId", "toId", "type");

-- AddForeignKey
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
