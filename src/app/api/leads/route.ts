import { NextResponse } from "next/server";

type Utms = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

const LEADS_TABLE = "Leads";
const SOURCES_TABLE = "Lead Attribution";
const CAMPAIGNS_TABLE = "Campaigns";

type LeadRequestBody = {
  lessonLocation?: string;
  lessonFor?: string;
  lessonTimeline?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  zipCode?: string;
  utms?: Utms;
  landingUrl?: string;
};

const LESSON_LOCATIONS = new Set([
  "Home Pool",
  "Condo/Public Pool (I have access)",
  "Open Water (Ocean)",
]);
const LESSON_FOR_OPTIONS = new Set(["Adult", "Child"]);
const LESSON_TIMELINES = new Set([
  "Within the Next 2 Weeks",
  "Within the Next Month",
  "This Spring/Summer",
  "Just Exploring Options",
]);
const UTM_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content"]);

const ZIP_REGEX = /^\d{5}$/;
const PHONE_REGEX = /^\d{10}$/;

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhone(value: string): string {
  const digits = normalizePhone(value);
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(normalizePhone(value));
}

function isValidZip(value: string): boolean {
  return ZIP_REGEX.test(value.trim());
}

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

function normalizeTimeline(value: string): string {
  switch (value) {
    case "Within the Next 2 Weeks":
      return "2_weeks";
    case "Within the Next Month":
      return "1_month";
    case "This Spring/Summer":
      return "spring_summer";
    case "Just Exploring Options":
      return "unsure";
    default:
      return value;
  }
}

function normalizeLessonSetting(value: string): string {
  switch (value) {
    case "Home Pool":
      return "home_pool";
    case "Condo/Public Pool (I have access)":
      return "public_pool";
    case "Open Water (Ocean)":
      return "open_water";
    default:
      return value.toLowerCase().replace(/\s+/g, "_");
  }
}

function normalizeAgeGroup(value: string): string {
  switch (value) {
    case "Adult":
      return "adult";
    case "Child":
      return "child";
    default:
      return value.toLowerCase().replace(/\s+/g, "_");
  }
}

async function createAirtableRecord(
  baseId: string,
  tableName: string,
  token: string,
  fields: Record<string, unknown>,
) {
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      records: [{ fields }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as {
    records?: Array<{ id: string }>;
  };
}

function escapeAirtableFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findCampaignRecordId(
  baseId: string,
  tableName: string,
  token: string,
  campaignCode: string,
): Promise<string | null> {
  const escapedCode = escapeAirtableFormulaString(campaignCode);
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{Campaign Code}='${escapedCode}'`,
  });
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable campaign lookup failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { records?: Array<{ id: string }> };
  return data.records?.[0]?.id ?? null;
}

export async function POST(request: Request) {
  try {
    const token = process.env.AIRTABLE_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;

    if (!token || !baseId) {
      return NextResponse.json(
        { ok: false, error: "Airtable configuration is missing." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as LeadRequestBody;

    if (!isNonEmptyString(body.lessonLocation) || !LESSON_LOCATIONS.has(body.lessonLocation)) {
      return NextResponse.json(
        { ok: false, error: "Invalid lesson location." },
        { status: 400 },
      );
    }

    if (!isNonEmptyString(body.lessonFor) || !LESSON_FOR_OPTIONS.has(body.lessonFor)) {
      return NextResponse.json({ ok: false, error: "Invalid lesson audience." }, { status: 400 });
    }

    if (!isNonEmptyString(body.lessonTimeline) || !LESSON_TIMELINES.has(body.lessonTimeline)) {
      return NextResponse.json({ ok: false, error: "Invalid lesson timeline." }, { status: 400 });
    }

    if (!isNonEmptyString(body.firstName)) {
      return NextResponse.json({ ok: false, error: "First Name is required." }, { status: 400 });
    }

    if (!isNonEmptyString(body.lastName)) {
      return NextResponse.json({ ok: false, error: "Last Name is required." }, { status: 400 });
    }

    if (!isNonEmptyString(body.phoneNumber) || !isValidPhone(body.phoneNumber.trim())) {
      return NextResponse.json(
        { ok: false, error: "Phone Number must be exactly 10 digits with numbers only." },
        { status: 400 },
      );
    }

    if (!isNonEmptyString(body.zipCode) || !isValidZip(body.zipCode)) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid ZIP code." },
        { status: 400 },
      );
    }

    if (!isValidUtms(body.utms)) {
      return NextResponse.json(
        { ok: false, error: "Invalid UTM payload." },
        { status: 400 },
      );
    }

    const landingUrl = typeof body.landingUrl === "string" ? body.landingUrl : "";
    const lessonSetting = normalizeLessonSetting(body.lessonLocation);
    const ageGroup = normalizeAgeGroup(body.lessonFor);
    const startTimeline = normalizeTimeline(body.lessonTimeline);
    const campaignCode =
      typeof body.utms?.utm_campaign === "string" ? body.utms.utm_campaign.trim().toLowerCase() : "";

    const fullName = `${body.firstName.trim()} ${body.lastName.trim()}`.trim();

    const normalizedPhone = normalizePhone(body.phoneNumber.trim());
    const formattedPhone = formatPhone(normalizedPhone);
    const leadCreate = await createAirtableRecord(baseId, LEADS_TABLE, token, {
      Name: fullName,
      Phone: formattedPhone,
      Zip: body.zipCode.trim(),
      "Lesson Setting": lessonSetting,
      "Age Group": ageGroup,
      "Start Timeline": startTimeline,
      "External Provider": "Website",
    });

    const leadId = leadCreate.records?.[0]?.id;
    if (!leadId) {
      return NextResponse.json(
        { ok: false, error: "Lead was created without a record ID." },
        { status: 500 },
      );
    }

    try {
      let campaignRecordId: string | null = null;
      if (campaignCode) {
        campaignRecordId = await findCampaignRecordId(baseId, CAMPAIGNS_TABLE, token, campaignCode);
      }

      const attributionFields: Record<string, unknown> = {
        Lead: [leadId],
        "Landing URL": landingUrl,
      };
      if (campaignRecordId) attributionFields.Campaign = [campaignRecordId];

      await createAirtableRecord(baseId, SOURCES_TABLE, token, attributionFields);
    } catch (attributionError) {
      console.warn("Lead saved but attribution write failed", {
        leadId,
        error: attributionError instanceof Error ? attributionError.message : attributionError,
      });
    }

    return NextResponse.json({ ok: true, leadId });
  } catch (error) {
    console.error("Failed to handle lead submission", error);
    return NextResponse.json(
      { ok: false, error: "Unable to submit your request right now." },
      { status: 500 },
    );
  }
}
