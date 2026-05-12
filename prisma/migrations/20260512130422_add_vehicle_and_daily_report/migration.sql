-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plate" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "depot" TEXT NOT NULL,
    "inspectionDueDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VehicleAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignDate" DATETIME NOT NULL,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DrivingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATETIME NOT NULL,
    "startAt" DATETIME NOT NULL,
    "startOdometer" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "workSiteName" TEXT NOT NULL,
    "workSiteId" TEXT,
    "endAt" DATETIME,
    "endOdometer" INTEGER,
    "distanceKm" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DrivingLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DrivingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DrivingLog_workSiteId_fkey" FOREIGN KEY ("workSiteId") REFERENCES "WorkSite" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefuelingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refuelDate" DATETIME NOT NULL,
    "liters" REAL NOT NULL,
    "amountJpy" INTEGER NOT NULL,
    "stationName" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefuelingLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RefuelingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "progressNote" TEXT NOT NULL DEFAULT '',
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedAt" DATETIME,
    "acknowledgedById" TEXT,
    "acknowledgedAt" DATETIME,
    "ackComment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyReport_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyReportItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "workSiteName" TEXT NOT NULL,
    "workSiteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyReportItem_workSiteId_fkey" FOREIGN KEY ("workSiteId") REFERENCES "WorkSite" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE INDEX "Vehicle_isActive_idx" ON "Vehicle"("isActive");

-- CreateIndex
CREATE INDEX "Vehicle_inspectionDueDate_idx" ON "Vehicle"("inspectionDueDate");

-- CreateIndex
CREATE INDEX "VehicleAssignment_vehicleId_assignDate_idx" ON "VehicleAssignment"("vehicleId", "assignDate");

-- CreateIndex
CREATE INDEX "VehicleAssignment_userId_assignDate_idx" ON "VehicleAssignment"("userId", "assignDate");

-- CreateIndex
CREATE INDEX "DrivingLog_vehicleId_workDate_idx" ON "DrivingLog"("vehicleId", "workDate");

-- CreateIndex
CREATE INDEX "DrivingLog_userId_workDate_idx" ON "DrivingLog"("userId", "workDate");

-- CreateIndex
CREATE INDEX "DrivingLog_status_workDate_idx" ON "DrivingLog"("status", "workDate");

-- CreateIndex
CREATE INDEX "DrivingLog_workDate_idx" ON "DrivingLog"("workDate");

-- CreateIndex
CREATE INDEX "RefuelingLog_vehicleId_refuelDate_idx" ON "RefuelingLog"("vehicleId", "refuelDate");

-- CreateIndex
CREATE INDEX "RefuelingLog_refuelDate_idx" ON "RefuelingLog"("refuelDate");

-- CreateIndex
CREATE INDEX "DailyReport_reportDate_idx" ON "DailyReport"("reportDate");

-- CreateIndex
CREATE INDEX "DailyReport_status_reportDate_idx" ON "DailyReport"("status", "reportDate");

-- CreateIndex
CREATE INDEX "DailyReport_userId_reportDate_idx" ON "DailyReport"("userId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_userId_reportDate_key" ON "DailyReport"("userId", "reportDate");

-- CreateIndex
CREATE INDEX "DailyReportItem_reportId_orderIndex_idx" ON "DailyReportItem"("reportId", "orderIndex");

-- CreateIndex
CREATE INDEX "DailyReportItem_workSiteId_idx" ON "DailyReportItem"("workSiteId");
