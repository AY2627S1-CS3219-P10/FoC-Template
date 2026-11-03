CREATE TABLE "errand_bookmarks" (
  "errand_id" UUID NOT NULL REFERENCES "errands"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("errand_id", "user_id")
);
CREATE INDEX "errand_bookmarks_user_id_errand_id_idx" ON "errand_bookmarks"("user_id", "errand_id");
