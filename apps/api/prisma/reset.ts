import { createPrisma } from "../src/db/prisma.js";

/**
 * Demo reset (build spec §11): inside ONE transaction, delete bookings + events, increment
 * resetGeneration (so pre-reset quotes can no longer book and their replays return
 * BOOKING_NOT_FOUND), then re-seed. A scheduled job calls POST /admin/reset nightly at 03:00 IST.
 */
const prisma = createPrisma(process.env.DATABASE_URL ?? "");

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.bookingEvent.deleteMany({});
    await tx.booking.deleteMany({});
    await tx.business.updateMany({ data: { resetGeneration: { increment: 1 } } });
  });
  // re-seed sample data after the generation bump
  await import("./seed.js");
   
  console.log("reset complete: bookings/events cleared, generation bumped, re-seeded.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
     
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
