-- JIRA two-way sync (M3-02, M3-03): last agreed values per task, and sync runs.
-- AlterTable: changes made by the sync rather than a person.
ALTER TABLE "AuditLog" ADD COLUMN "via" TEXT;

-- CreateTable
CREATE TABLE "JiraSyncState" (
    "taskId" TEXT NOT NULL,
    "base" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraSyncState_pkey" PRIMARY KEY ("taskId")
);

-- CreateTable
CREATE TABLE "JiraSyncRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "pulled" INTEGER NOT NULL DEFAULT 0,
    "pushed" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,

    CONSTRAINT "JiraSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JiraSyncRun_projectId_startedAt_idx" ON "JiraSyncRun"("projectId", "startedAt");

-- AddForeignKey
ALTER TABLE "JiraSyncState" ADD CONSTRAINT "JiraSyncState_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JiraSyncRun" ADD CONSTRAINT "JiraSyncRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

