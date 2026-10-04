-- CreateTable
CREATE TABLE "memos" (
    "id" TEXT NOT NULL,
    "content" VARCHAR(200) NOT NULL,
    "model_category" TEXT NOT NULL,
    "final_category" TEXT NOT NULL,
    "scores" JSONB,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memos_pkey" PRIMARY KEY ("id")
);
