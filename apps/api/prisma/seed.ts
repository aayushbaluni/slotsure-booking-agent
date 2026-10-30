import { createHash, randomInt } from "node:crypto";
import { DateTime } from "luxon";
import { ulid } from "ulid";
import { createPrisma } from "../src/db/prisma.js";

/**
 * Deterministic seed (build spec §11): the business profile + verified capabilities, the two
 * free services, Ayush as the one bookable person, and the call windows. Sample bookings are
 * left as a TODO so the schedule starts clean; the next weekday 19:00 IST slot is the race-demo
 * slot named in the README.
 */
const prisma = createPrisma(process.env.DATABASE_URL ?? "");
const BUSINESS_ID = "ayush-baluni";

const CAPABILITIES = [
  "React/TypeScript web apps",
  "Backend APIs and third-party integrations",
  "Payment integrations",
  "Medusa and marketplace builds",
  "LLM agents and workflow automation",
];

async function main() {
  await prisma.business.upsert({
    where: { id: BUSINESS_ID },
    create: {
      id: BUSINESS_ID,
      name: "Ayush Baluni — independent software developer",
      timezone: "Asia/Kolkata",
      currency: "INR",
      capabilities: CAPABILITIES,
      minLeadMins: 60,
      maxDaysAhead: 14,
      slotStepMins: 15,
      cancelCutoffMins: 120,
    },
    update: { capabilities: CAPABILITIES },
  });

  await prisma.service.upsert({
    where: { id: "discovery-call" },
    create: {
      id: "discovery-call",
      businessId: BUSINESS_ID,
      name: "Discovery call",
      description: "Talk through a project idea.",
      aliases: ["discovery", "intro call", "first call"],
      durationMins: 30,
      bufferMins: 15,
      pricePaise: 0,
    },
    update: { description: "Talk through a project idea." },
  });
  await prisma.service.upsert({
    where: { id: "technical-consultation" },
    create: {
      id: "technical-consultation",
      businessId: BUSINESS_ID,
      name: "Technical consultation",
      description: "Review an existing system's architecture or integration plan.",
      aliases: ["consultation", "consult", "architecture review"],
      durationMins: 45,
      bufferMins: 15,
      pricePaise: 0,
    },
    update: { description: "Review an existing system's architecture or integration plan." },
  });

  await prisma.staff.upsert({
    where: { businessId_sortOrder: { businessId: BUSINESS_ID, sortOrder: 0 } },
    create: { id: "ayush", businessId: BUSINESS_ID, displayName: "Ayush", sortOrder: 0 },
    update: {},
  });

  // Ayush offers both services.
  for (const serviceId of ["discovery-call", "technical-consultation"]) {
    await prisma.staffService.upsert({
      where: { staffId_serviceId: { staffId: "ayush", serviceId } },
      create: { staffId: "ayush", serviceId },
      update: {},
    });
  }

  // Call hours (IST): Mon–Fri 18:00–21:00; Sat & Sun 10:00–13:00 and 17:00–20:00.
  const hours: { weekday: number; opensAt: string; closesAt: string }[] = [];
  for (const wd of [1, 2, 3, 4, 5]) hours.push({ weekday: wd, opensAt: "18:00", closesAt: "21:00" });
  for (const wd of [6, 7]) {
    hours.push({ weekday: wd, opensAt: "10:00", closesAt: "13:00" });
    hours.push({ weekday: wd, opensAt: "17:00", closesAt: "20:00" });
  }
  for (const h of hours) {
    await prisma.openingHours.upsert({
      where: { businessId_weekday_opensAt: { businessId: BUSINESS_ID, weekday: h.weekday, opensAt: h.opensAt } },
      create: { businessId: BUSINESS_ID, ...h },
      update: { closesAt: h.closesAt },
    });
  }

  // Sample bookings so the schedule isn't empty — only when the table is empty, so reboots and
  // real demo bookings never duplicate them (a reset clears bookings, then re-seed repopulates).
  const biz = await prisma.business.findFirstOrThrow({ select: { id: true, resetGeneration: true } });
  if ((await prisma.booking.count()) === 0) {
    await seedSampleBookings(biz.id, biz.resetGeneration);
  }

   
  console.log("seed complete: business + capabilities + 2 services + Ayush + call hours + samples.");
}

/** Places up to 4 confirmed demo bookings on upcoming days, one per day (so they never overlap),
 *  at each day's first call window + 30 min. Skips a weekday 19:00 (reserved race-demo slot). */
async function seedSampleBookings(businessId: string, generation: number): Promise<void> {
  const zone = "Asia/Kolkata";
  const now = DateTime.now().setZone(zone);
  const windowsFor = (weekday: number): [string, string][] =>
    weekday >= 1 && weekday <= 5 ? [["18:00", "21:00"]] : [["10:00", "13:00"], ["17:00", "20:00"]];
  const samples = [
    { name: "Riya", type: "web_app", brief: "Booking app for a salon with SMS reminders and a simple admin view." },
    { name: "Arjun", type: "api_integration", brief: "Integrate a payment gateway into an existing storefront checkout." },
    { name: "Meera", type: "ai_agent", brief: "A support agent that answers customer questions from our docs." },
    { name: "Sam", type: "ecommerce", brief: "A Medusa marketplace MVP with multiple vendors and payouts." },
  ];
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const ref = () => "SB-" + Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

  let made = 0;
  for (let off = 1; off <= 7 && made < samples.length; off++) {
    const day = now.plus({ days: off }).startOf("day");
    const [open] = windowsFor(day.weekday)[0]!;
    const [h, m] = open.split(":").map((n) => Number.parseInt(n, 10));
    const start = day.set({ hour: h, minute: m, second: 0, millisecond: 0 }).plus({ minutes: 30 });
    if (day.weekday <= 5 && start.hour === 19 && start.minute === 0) continue; // keep race slot free
    const ends = start.plus({ minutes: 30 });
    const blocked = ends.plus({ minutes: 15 });
    const s = samples[made]!;
    await prisma.booking.create({
      data: {
        id: `bk_${ulid()}`,
        businessId,
        reference: ref(),
        manageCodeHash: createHash("sha256").update(ulid()).digest("hex"), // placeholder; samples aren't looked up
        quoteId: ulid(),
        serviceId: "discovery-call",
        staffId: "ayush",
        startsAt: start.toUTC().toJSDate(),
        endsAt: ends.toUTC().toJSDate(),
        blockedUntil: blocked.toUTC().toJSDate(),
        serviceName: "Discovery call",
        durationMins: 30,
        bufferMins: 15,
        pricePaise: 0,
        serviceVersion: 1,
        generation,
        customerName: s.name,
        projectType: s.type,
        projectBrief: s.brief,
        status: "CONFIRMED",
        isDemo: true,
      },
    });
    made++;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
     
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
