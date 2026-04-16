import { SyncEndpointError } from "@/lib/errors";
import type { LeadRequestBody, Utms } from "./dto";

const LESSON_LOCATIONS = new Set([
  "Home Pool",
  "Condo or Community Pool",
  "Condo/Public Pool",
  "Condo/Public Pool (I have access)",
  "Condo/Public Pool (Access Required)",
  "Ocean / Open Water",
  "Open Water (Ocean)",
  "Ocean",
]);
const LESSON_FOR_OPTIONS = new Set(["Adults", "Adult", "Kids", "Child", "Mixed Ages"]);
const LESSON_TIMELINES = new Set([
  "Within the Next 2 Weeks",
  "Within the Next Month",
  "This summer",
  "This Summer",
  "This Spring/Summer",
  "Just Exploring Options",
]);
const UTM_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content"]);

const ZIP_REGEX = /^\d{5}$/;
const PHONE_REGEX = /^\d{10}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidUtms(value: unknown): value is Utms {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  for (const [key, v] of Object.entries(value)) {
    if (!UTM_KEYS.has(key)) return false;
    if (v != null && typeof v !== "string") return false;
  }
  return true;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(normalizePhone(value));
}

function isValidZip(value: string): boolean {
  return ZIP_REGEX.test(value.trim());
}

export function parseLeadBody(body: unknown): LeadRequestBody {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new SyncEndpointError("Invalid request body.", 400);
  }

  const typed = body as LeadRequestBody;

  if (!isNonEmptyString(typed.lessonLocation) || !LESSON_LOCATIONS.has(typed.lessonLocation)) {
    throw new SyncEndpointError("Invalid lesson location.", 400);
  }

  if (!isNonEmptyString(typed.lessonFor) || !LESSON_FOR_OPTIONS.has(typed.lessonFor)) {
    throw new SyncEndpointError("Invalid lesson audience.", 400);
  }

  if (!isNonEmptyString(typed.lessonTimeline) || !LESSON_TIMELINES.has(typed.lessonTimeline)) {
    throw new SyncEndpointError("Invalid lesson timeline.", 400);
  }

  if (!isNonEmptyString(typed.firstName)) {
    throw new SyncEndpointError("First Name is required.", 400);
  }

  if (!isNonEmptyString(typed.lastName)) {
    throw new SyncEndpointError("Last Name is required.", 400);
  }

  if (!isNonEmptyString(typed.phoneNumber) || !isValidPhone(typed.phoneNumber.trim())) {
    throw new SyncEndpointError("Phone Number must be exactly 10 digits with numbers only.", 400);
  }

  if (!isNonEmptyString(typed.zipCode) || !isValidZip(typed.zipCode)) {
    throw new SyncEndpointError("Please enter a valid ZIP code.", 400);
  }

  if (!isValidUtms(typed.utms)) {
    throw new SyncEndpointError("Invalid UTM payload.", 400);
  }

  return typed;
}

export function normalizeLeadFields(input: LeadRequestBody) {
  const landingUrl = typeof input.landingUrl === "string" ? input.landingUrl : "";
  const campaignCode =
    typeof input.utms?.utm_campaign === "string" ? input.utms.utm_campaign.trim().toLowerCase() : "";
  const normalizedPhone = normalizePhone(input.phoneNumber!.trim());
  const formattedPhone = `(${normalizedPhone.slice(0, 3)}) ${normalizedPhone.slice(3, 6)}-${normalizedPhone.slice(6)}`;

  const lessonSetting =
    input.lessonLocation === "Home Pool"
      ? "home_pool"
      : input.lessonLocation === "Condo or Community Pool" ||
          input.lessonLocation === "Condo/Public Pool" ||
          input.lessonLocation === "Condo/Public Pool (I have access)" ||
          input.lessonLocation === "Condo/Public Pool (Access Required)"
        ? "public_pool"
        : input.lessonLocation === "Ocean / Open Water" ||
            input.lessonLocation === "Open Water (Ocean)" ||
            input.lessonLocation === "Ocean"
          ? "open_water"
          : input.lessonLocation!.toLowerCase().replace(/\s+/g, "_");

  const ageGroup =
    input.lessonFor === "Adults" || input.lessonFor === "Adult"
      ? "adult"
      : input.lessonFor === "Kids" || input.lessonFor === "Child"
        ? "child"
        : input.lessonFor === "Mixed Ages"
          ? "mixed_ages"
        : input.lessonFor!.toLowerCase().replace(/\s+/g, "_");

  const startTimeline =
    input.lessonTimeline === "Within the Next 2 Weeks"
      ? "2_weeks"
      : input.lessonTimeline === "Within the Next Month"
        ? "1_month"
        : input.lessonTimeline === "This summer" ||
            input.lessonTimeline === "This Summer" ||
            input.lessonTimeline === "This Spring/Summer"
          ? "spring_summer"
          : input.lessonTimeline === "Just Exploring Options"
            ? "unsure"
            : input.lessonTimeline!;

  return {
    firstName: input.firstName!.trim(),
    lastName: input.lastName!.trim(),
    zipCode: input.zipCode!.trim(),
    landingUrl,
    campaignCode,
    formattedPhone,
    lessonSetting,
    ageGroup,
    startTimeline,
  };
}
