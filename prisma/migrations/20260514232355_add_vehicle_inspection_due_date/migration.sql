-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "vehicleInspectionDueDate" DATETIME;

-- CreateIndex
CREATE INDEX "Vehicle_vehicleInspectionDueDate_idx" ON "Vehicle"("vehicleInspectionDueDate");
