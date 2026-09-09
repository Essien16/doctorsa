CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Convert existing application timestamps to timestamptz.
-- Existing values were stored as UTC, so AT TIME ZONE 'UTC'
-- preserves their original point in time.

ALTER TABLE "users"
ALTER COLUMN "created_at"
TYPE TIMESTAMPTZ(3)
USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at"
TYPE TIMESTAMPTZ(3)
USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "doctor_profiles"
ALTER COLUMN "created_at"
TYPE TIMESTAMPTZ(3)
USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at"
TYPE TIMESTAMPTZ(3)
USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "specialties"
ALTER COLUMN "created_at"
TYPE TIMESTAMPTZ(3)
USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at"
TYPE TIMESTAMPTZ(3)
USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "visits"
ALTER COLUMN "preferred_at"
TYPE TIMESTAMPTZ(3)
USING "preferred_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at"
TYPE TIMESTAMPTZ(3)
USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at"
TYPE TIMESTAMPTZ(3)
USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "bids"
ALTER COLUMN "created_at"
TYPE TIMESTAMPTZ(3)
USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at"
TYPE TIMESTAMPTZ(3)
USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "payments"
ALTER COLUMN "paid_at"
TYPE TIMESTAMPTZ(3)
USING "paid_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at"
TYPE TIMESTAMPTZ(3)
USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at"
TYPE TIMESTAMPTZ(3)
USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "webhook_events"
ALTER COLUMN "processed_at"
TYPE TIMESTAMPTZ(3)
USING "processed_at" AT TIME ZONE 'UTC';

ALTER TABLE "visit_status_history"
ALTER COLUMN "created_at"
TYPE TIMESTAMPTZ(3)
USING "created_at" AT TIME ZONE 'UTC';

-- Add scheduling and doctor-reservation columns.
-- scheduled_end_at starts nullable so existing visits
-- can be backfilled safely.
ALTER TABLE "visits"
ADD COLUMN "scheduled_end_at" TIMESTAMPTZ(3),
ADD COLUMN "reserved_doctor_profile_id" UUID,
ADD COLUMN "doctor_reservation_expires_at" TIMESTAMPTZ(3);

-- Every existing visit occupies one hour.
UPDATE "visits"
SET "scheduled_end_at" =
  "preferred_at" + INTERVAL '1 hour';

ALTER TABLE "visits"
ALTER COLUMN "scheduled_end_at" SET NOT NULL;

CREATE INDEX
  "visits_reserved_doctor_profile_id_idx"
ON "visits"("reserved_doctor_profile_id");

CREATE INDEX
  "visits_doctor_reservation_expires_at_idx"
ON "visits"("doctor_reservation_expires_at");

ALTER TABLE "visits"
ADD CONSTRAINT
  "visits_reserved_doctor_profile_id_fkey"
FOREIGN KEY ("reserved_doctor_profile_id")
REFERENCES "doctor_profiles"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Prevent overlapping patient appointments.
-- [) allows a new visit to begin exactly when the
-- previous one ends.
ALTER TABLE "visits"
ADD CONSTRAINT "visits_patient_schedule_exclusion"
EXCLUDE USING gist (
  "patient_id" WITH =,
  tstzrange(
    "preferred_at",
    "scheduled_end_at",
    '[)'
  ) WITH &&
);

-- Prevent overlapping doctor reservations and assignments.
ALTER TABLE "visits"
ADD CONSTRAINT "visits_doctor_schedule_exclusion"
EXCLUDE USING gist (
  "reserved_doctor_profile_id" WITH =,
  tstzrange(
    "preferred_at",
    "scheduled_end_at",
    '[)'
  ) WITH &&
)
WHERE ("reserved_doctor_profile_id" IS NOT NULL);