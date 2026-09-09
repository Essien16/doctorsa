export const USER_ROLES = [
  "PATIENT",
  "DOCTOR",
] as const;

export type UserRole = (typeof USER_ROLES)[number];