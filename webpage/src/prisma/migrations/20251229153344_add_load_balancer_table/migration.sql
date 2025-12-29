-- CreateTable
CREATE TABLE "load_balancer" (
    "id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "colocation_center" TEXT NOT NULL,
    "last_checked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "load_balancer_pkey" PRIMARY KEY ("id")
);
