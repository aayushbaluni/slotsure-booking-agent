import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type FaultMode } from "./api.js";

const POLL = 3000; // live refresh every 3s (build spec §9)

export const useStatus = () => useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: POLL });
export const useBookings = () => useQuery({ queryKey: ["bookings"], queryFn: api.bookings, refetchInterval: POLL });
export const useEvents = () => useQuery({ queryKey: ["events"], queryFn: api.events, refetchInterval: POLL });

export function useAdminMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries();
  return {
    reset: useMutation({ mutationFn: api.reset, onSuccess: invalidate }),
    setFault: useMutation({ mutationFn: (mode: FaultMode) => api.setFault(mode), onSuccess: invalidate }),
    runRace: useMutation({ mutationFn: api.runRace, onSuccess: invalidate }),
  };
}
