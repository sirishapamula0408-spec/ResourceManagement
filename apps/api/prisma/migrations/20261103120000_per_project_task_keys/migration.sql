-- Task keys become "<project code>-<number>", numbered separately on each project.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "lastTaskNumber" INTEGER NOT NULL DEFAULT 0;

-- Stop the global sequence.
DROP INDEX "Task_number_key";
ALTER TABLE "Task" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "Task_number_seq";

-- Renumber existing tasks 1, 2, 3... per project, keeping their current order.
UPDATE "Task" AS t
SET "number" = r.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "number") AS rn
  FROM "Task"
) AS r
WHERE t."id" = r."id";

-- The next task on each project continues from its highest number.
UPDATE "Project" AS p
SET "lastTaskNumber" = m.max_number
FROM (SELECT "projectId", MAX("number") AS max_number FROM "Task" GROUP BY "projectId") AS m
WHERE p."id" = m."projectId";

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_number_key" ON "Task"("projectId", "number");
