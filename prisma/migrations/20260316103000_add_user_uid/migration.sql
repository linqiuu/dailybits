ALTER TABLE "User"
ADD COLUMN "uid" TEXT;

CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");
