import {
  getCreditReservationById,
  listReservationsForLesson,
  listReservationLockEntries,
  resolveReservationStatus,
} from "@/modules/credit-reservations/repo";

export const reservationsRepo = {
  getReservationById: getCreditReservationById,
  listReservationsForLesson,
  listLockDebitEntries: listReservationLockEntries,
  consumeReservation: async (
    reservationId: string,
    resolutionReason: "Lesson Completed" | "Lesson Canceled" | "Lesson No-Show",
    resolvedAt?: string,
  ) =>
    resolveReservationStatus({
      creditReservationRecordId: reservationId,
      status: "Consumed",
      resolutionReason,
      resolvedAt,
    }),
  releaseReservation: async (
    reservationId: string,
    resolutionReason: "Lesson Canceled" | "Lesson No-Show" | "Policy Release",
    resolvedAt?: string,
    notes?: string,
  ) => {
    console.info(
      `[RESERVATION_RELEASE] Start reservation=${reservationId} resolutionReason="${resolutionReason}"`,
    );
    await resolveReservationStatus({
      creditReservationRecordId: reservationId,
      status: "Released",
      resolutionReason,
      resolvedAt,
      notes,
    });
    console.info(
      `[RESERVATION_RELEASE] Success reservation=${reservationId} resolutionReason="${resolutionReason}"`,
    );
  },
};
