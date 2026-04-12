export const lessonsSchema = {
  fields: {
    status: "Status",
    startAt: "Start At",
    cancellationReason: "Cancellation Reason",
    outcomeNotes: "Outcome Notes",
    notes: "Notes",
    requestedOutcome: "Requested Outcome",
    requestOutcome: "Request Outcome",
    futureStartAt: "Future Start At",
    isTerminalLesson: "Is Terminal Lesson",
    hasActiveReservation: "Has Active Reservation",
    hasException: "Has Exception",
    hasCreditLedgerImpactingException: "Has Credit Ledger Impacting Exception",
    missingRequiredLinks: "Missing Required Links",
    payingCreditAccount: "Paying Credit Account",
  },
} as const;
