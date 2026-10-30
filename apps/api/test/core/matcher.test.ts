import { describe, it, expect } from "vitest";
import { matchService } from "../../src/core/matcher.js";
import { SlotSureError } from "@slotsure/shared";
import type { ServiceData } from "@slotsure/shared/ports";

const services: ServiceData[] = [
  { id: "discovery-call", name: "Discovery call", description: "", aliases: ["discovery", "intro call"], durationMins: 30, bufferMins: 15, pricePaise: 0, active: true, version: 1 },
  { id: "technical-consultation", name: "Technical consultation", description: "", aliases: ["consultation", "consult"], durationMins: 45, bufferMins: 15, pricePaise: 0, active: true, version: 1 },
];

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof SlotSureError ? e.code : "NONE";
  }
  return "NONE";
};

describe("matchService", () => {
  it("matches by exact id, name and alias (I1–I3)", () => {
    expect(matchService("discovery-call", services).id).toBe("discovery-call");
    expect(matchService("Discovery call", services).id).toBe("discovery-call");
    expect(matchService("consult", services).id).toBe("technical-consultation");
  });

  it("matches a typo via trigram similarity", () => {
    expect(matchService("discovry call", services).id).toBe("discovery-call");
  });

  it("raises SERVICE_NOT_FOUND for an unknown service", () => {
    expect(codeOf(() => matchService("a code audit package", services))).toBe("SERVICE_NOT_FOUND");
  });

  it("raises SERVICE_INACTIVE for a switched-off service", () => {
    const off = [{ ...services[0]!, active: false }];
    expect(codeOf(() => matchService("discovery-call", off))).toBe("SERVICE_INACTIVE");
  });
});
