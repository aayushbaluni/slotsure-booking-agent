import { SlotSureError } from "@slotsure/shared";
import type { ServiceData } from "@slotsure/shared/ports";

/**
 * Service matching (build spec §7 I1–I3). Resolve id | name | alias (case-insensitive) first;
 * then trigram similarity for typos ("discovry call", "consult"). ≥ 0.4 matches; 2+ strong
 * matches → SERVICE_AMBIGUOUS; none → SERVICE_NOT_FOUND. An exact id/name/alias hit wins
 * outright and never triggers ambiguity.
 */
const THRESHOLD = 0.4;

export function matchService(input: string, services: ServiceData[]): ServiceData {
  const q = norm(input);
  if (!q) throw notFound(services);

  // 1) exact id / name / alias
  const exact = services.filter(
    (s) => norm(s.id) === q || norm(s.name) === q || s.aliases.some((a) => norm(a) === q),
  );
  if (exact.length === 1) return activeOrThrow(exact[0]!);
  if (exact.length > 1) throw ambiguous(exact);

  // 2) fuzzy over name + aliases
  const scored = services
    .map((s) => ({ s, score: bestTrigram(q, [s.name, ...s.aliases]) }))
    .filter((x) => x.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) throw notFound(services);
  // clearly ambiguous when the top two are near-tied
  if (scored.length > 1 && scored[0]!.score - scored[1]!.score < 0.1) throw ambiguous(scored.map((x) => x.s));
  return activeOrThrow(scored[0]!.s);
}

function activeOrThrow(s: ServiceData): ServiceData {
  if (!s.active) throw new SlotSureError("SERVICE_INACTIVE", `${s.name} isn't being offered right now.`);
  return s;
}

function notFound(services: ServiceData[]): SlotSureError {
  const names = services.filter((s) => s.active).map((s) => s.name).join(" and ");
  return new SlotSureError("SERVICE_NOT_FOUND", `Ayush offers a ${names}. Which would you like?`);
}
function ambiguous(services: ServiceData[]): SlotSureError {
  const names = services.map((s) => s.name).join(" or ");
  return new SlotSureError("SERVICE_AMBIGUOUS", `Did you mean the ${names}?`, {
    matches: services.map((s) => ({ id: s.id, name: s.name })),
  });
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** trigram (Jaccard) similarity, a lightweight stand-in for pg_trgm. */
function bestTrigram(q: string, candidates: string[]): number {
  const qg = trigrams(q);
  let best = 0;
  for (const c of candidates) {
    const cg = trigrams(norm(c));
    const inter = [...qg].filter((g) => cg.has(g)).length;
    const union = new Set([...qg, ...cg]).size;
    if (union > 0) best = Math.max(best, inter / union);
  }
  return best;
}
function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}
