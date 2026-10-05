-- AlterTable
ALTER TABLE "memos" ADD COLUMN     "fallback_reason" TEXT;

-- CreateTable
CREATE TABLE "clef_calls" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL,

    CONSTRAINT "clef_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clef_calls_created_at_idx" ON "clef_calls"("created_at");
