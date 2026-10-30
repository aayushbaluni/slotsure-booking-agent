/**
 * Admin API client. The admin token is entered once and held in sessionStorage (build spec §9);
 * every admin route verifies it server-side. Base URL from VITE_API_URL (defaults to local).
 */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://127.0.0.1:3000";
const TOKEN_KEY = "slotsure_admin_token";

export const getToken = (): string | null => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => sessionStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => sessionStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code?: string,
  ) {
    super(code ?? `HTTP ${status}`);
  }
}

async function admin<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token ?? ""}` };
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) } });
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
  if (!res.ok) throw new ApiError(res.status, body?.error?.code);
  return body as T;
}

// ---- response shapes (dates arrive as ISO strings over JSON) ----
export type FaultMode = "none" | "latency" | "error_503" | "fail_after_commit";
export interface Status {
  fault: { mode: FaultMode; tools: string[]; expiresAt: number | null };
  faultsEnabled: boolean;
  activeBookings: number;
  capacity: number;
  generation: number;
}
export interface BookingRow {
  reference: string;
  serviceName: string;
  staffId: string;
  startsAt: string;
  status: "CONFIRMED" | "CANCELLED";
  projectType: string;
  createdAt: string;
}
export interface EventRow {
  type: string;
  requestId: string;
  detail: unknown;
  createdAt: string;
}

export const api = {
  status: () => admin<{ data: Status }>("/admin/status").then((r) => r.data),
  bookings: () => admin<{ data: { bookings: BookingRow[] } }>("/admin/bookings").then((r) => r.data.bookings),
  events: () => admin<{ data: { events: EventRow[] } }>("/admin/events?limit=100").then((r) => r.data.events),
  reset: () => admin<{ data: { generation: number } }>("/admin/reset", { method: "POST" }).then((r) => r.data),
  setFault: (mode: FaultMode) =>
    admin("/admin/faults", { method: "PUT", body: JSON.stringify({ mode, tools: ["confirm_booking"], ttl_s: 600 }) }),
  runRace: () =>
    admin<{ data: { created: number; rejected: number; display: string } }>("/admin/run-race", { method: "POST" }).then((r) => r.data),
};
