-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "config" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_id_key" ON "Room"("id");
