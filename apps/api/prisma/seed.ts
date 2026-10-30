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

  // TODO(Phase 4): seed ~4 sample bookings relative to now so the dashboard isn't empty,
  // leaving the next weekday 19:00 IST slot free as the race-demo slot.

   
  console.log("seed complete: business + capabilities + 2 services + Ayush + call hours.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
     
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
