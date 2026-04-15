import {
  runReservationLock,
  runReservationVoid,
} from "@/modules/credit-reservations/service";

export async function lockReservation(
  recordId: string,
  opts?: { idempotencyKey?: string },
) {
  return runReservationLock({ recordId, idempotencyKey: opts?.idempotencyKey });
}

export async function voidReservation(
  recordId: string,
  notes?: string,
  force?: boolean,
  opts?: { idempotencyKey?: string },
) {
  return runReservationVoid({
    recordId,
    notes,
    force,
    idempotencyKey: opts?.idempotencyKey,
  });
}
