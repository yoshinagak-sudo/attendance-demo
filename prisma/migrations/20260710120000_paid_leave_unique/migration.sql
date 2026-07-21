-- Add unique constraint on PaidLeaveGrant (userId, grantedOn, source) for idempotent auto-grant.
CREATE UNIQUE INDEX "PaidLeaveGrant_userId_grantedOn_source_key" ON "PaidLeaveGrant"("userId", "grantedOn", "source");
