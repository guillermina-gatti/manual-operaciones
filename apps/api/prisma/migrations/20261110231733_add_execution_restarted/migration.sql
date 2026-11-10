-- HU33: an execution in progress closed without finishing, to restart on the current
-- version of its procedure. Additive only: no existing value or column changes.
-- AlterEnum
ALTER TYPE "ExecutionStatus" ADD VALUE 'RESTARTED';
