-- Appended to the generated init migration (see README.md). The real guarantee: Postgres,
-- not application code, makes overlapping confirmed bookings impossible for a given staff.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("startsAt", "blockedUntil", '[)') WITH &&
  ) WHERE (status = 'CONFIRMED');

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_time_order
  CHECK ("endsAt" > "startsAt" AND "blockedUntil" >= "endsAt");
