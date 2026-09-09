export const VISIT_STATUSES = [
  "OPEN",
  "BIDDING",
  "PAID",
  "ASSIGNED",
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];