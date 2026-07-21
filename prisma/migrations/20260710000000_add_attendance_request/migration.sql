-- AlterTable
ALTER TABLE "User" ADD COLUMN "defaultScheduledEndTime" TEXT;
ALTER TABLE "User" ADD COLUMN "defaultScheduledStartTime" TEXT;
ALTER TABLE "User" ADD COLUMN "hireDate" DATETIME;

-- CreateTable
CREATE TABLE "AttendanceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "workDate" DATETIME NOT NULL,
    "startAt" DATETIME,
    "endAt" DATETIME,
    "durationMinutes" INTEGER,
    "leaveDays" REAL,
    "paidLeaveKind" TEXT,
    "scheduledAt" DATETIME,
    "reason" TEXT,
    "substituteForId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "reviewerId" TEXT,
    "reviewedAt" DATETIME,
    "reviewComment" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRequest_substituteForId_fkey" FOREIGN KEY ("substituteForId") REFERENCES "OvertimeRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AttendanceRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaidLeaveGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "grantedOn" DATETIME NOT NULL,
    "expiresOn" DATETIME NOT NULL,
    "days" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "grantedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaidLeaveGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaidLeaveGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OvertimeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workDate" DATETIME NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "workSiteName" TEXT NOT NULL,
    "workSiteId" TEXT,
    "description" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "category" TEXT NOT NULL DEFAULT 'overtime',
    "reviewerId" TEXT,
    "reviewedAt" DATETIME,
    "reviewComment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "OvertimeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OvertimeRequest_workSiteId_fkey" FOREIGN KEY ("workSiteId") REFERENCES "WorkSite" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OvertimeRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OvertimeRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OvertimeRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OvertimeRequest" ("createdAt", "description", "durationMinutes", "endAt", "id", "parentId", "requestType", "reviewComment", "reviewedAt", "reviewerId", "startAt", "status", "updatedAt", "userId", "workDate", "workSiteId", "workSiteName") SELECT "createdAt", "description", "durationMinutes", "endAt", "id", "parentId", "requestType", "reviewComment", "reviewedAt", "reviewerId", "startAt", "status", "updatedAt", "userId", "workDate", "workSiteId", "workSiteName" FROM "OvertimeRequest";
DROP TABLE "OvertimeRequest";
ALTER TABLE "new_OvertimeRequest" RENAME TO "OvertimeRequest";
CREATE INDEX "OvertimeRequest_userId_workDate_idx" ON "OvertimeRequest"("userId", "workDate");
CREATE INDEX "OvertimeRequest_status_workDate_idx" ON "OvertimeRequest"("status", "workDate");
CREATE INDEX "OvertimeRequest_workDate_idx" ON "OvertimeRequest"("workDate");
CREATE INDEX "OvertimeRequest_category_status_workDate_idx" ON "OvertimeRequest"("category", "status", "workDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AttendanceRequest_userId_workDate_idx" ON "AttendanceRequest"("userId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceRequest_category_status_workDate_idx" ON "AttendanceRequest"("category", "status", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceRequest_status_workDate_idx" ON "AttendanceRequest"("status", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceRequest_workDate_idx" ON "AttendanceRequest"("workDate");

-- CreateIndex
CREATE INDEX "PaidLeaveGrant_userId_grantedOn_idx" ON "PaidLeaveGrant"("userId", "grantedOn");

-- CreateIndex
CREATE INDEX "PaidLeaveGrant_userId_expiresOn_idx" ON "PaidLeaveGrant"("userId", "expiresOn");

