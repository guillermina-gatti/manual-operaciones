-- CreateTable
CREATE TABLE "user_invitations" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invitation_areas" (
    "invitation_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,

    CONSTRAINT "user_invitation_areas_pkey" PRIMARY KEY ("invitation_id","area_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_token_hash_key" ON "user_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "user_invitations_email_idx" ON "user_invitations"("email");

-- CreateIndex
CREATE INDEX "user_invitations_expires_at_idx" ON "user_invitations"("expires_at");

-- CreateIndex
CREATE INDEX "user_invitations_created_by_id_idx" ON "user_invitations"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_one_pending_per_email_idx" ON "user_invitations"("email") WHERE ("accepted_at" IS NULL AND "revoked_at" IS NULL);

-- CreateIndex
CREATE INDEX "user_invitation_areas_area_id_idx" ON "user_invitation_areas"("area_id");

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitation_areas" ADD CONSTRAINT "user_invitation_areas_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "user_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitation_areas" ADD CONSTRAINT "user_invitation_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
