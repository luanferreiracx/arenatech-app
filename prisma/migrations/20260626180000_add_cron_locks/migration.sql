-- CreateTable
CREATE TABLE "cron_locks" (
    "job_name" TEXT NOT NULL,
    "locked_by" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_locks_pkey" PRIMARY KEY ("job_name")
);
