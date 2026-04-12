import { SyncEndpointError } from "@/lib/errors";
import type {
  ClientProfileStatus,
  ClientProfilesWorkflowRequestDto,
  CreateClientProfileDto,
  EnsureLessonSummaryRequestDto,
  FindClientProfileByContextDto,
  UpdateClientProfileDto,
} from "./dto";

type EnsureLessonSummaryBody = {
	profileRecordId?: unknown;
	recordId?: unknown;
};

type RecomputeSingleLessonSummaryBody = {
	profileRecordId?: unknown;
	recordId?: unknown;
	lessonSummaryRecordId?: unknown;
};

type BackfillLessonSummariesBody = {
	pageSize?: unknown;
	maxProfiles?: unknown;
};

type RecomputeLessonSummariesBody = {
	pageSize?: unknown;
	maxProfiles?: unknown;
};

type ClientProfilesWorkflowBody = {
  operation?: unknown;
  payload?: unknown;
};

type ClientProfileCreateBody = {
  clientRecordId?: unknown;
  organizationRecordId?: unknown;
  status?: unknown;
  notes?: unknown;
};

type ClientProfileUpdateBody = {
  recordId?: unknown;
  clientRecordId?: unknown;
  organizationRecordId?: unknown;
  status?: unknown;
  notes?: unknown;
};

type ClientProfileFindByContextBody = {
  clientRecordId?: unknown;
  organizationRecordId?: unknown;
};

const PROFILE_STATUSES = new Set<ClientProfileStatus>(["Active", "Paused", "Inactive"]);

function asPositiveInteger(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		if (Number.isInteger(parsed) && parsed > 0) return parsed;
	}
	return null;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new SyncEndpointError(message, 400);
  }
  return value as Record<string, unknown>;
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStatus(value: unknown): ClientProfileStatus | undefined {
  const parsed = readTrimmedString(value);
  if (!parsed) return undefined;
  if (!PROFILE_STATUSES.has(parsed as ClientProfileStatus)) {
    throw new SyncEndpointError("Invalid status.", 400);
  }
  return parsed as ClientProfileStatus;
}

function parseCreateClientProfilePayload(payload: unknown): CreateClientProfileDto {
  const typed = asRecord(payload, "Invalid create payload.");
  const clientRecordId = readTrimmedString((typed as ClientProfileCreateBody).clientRecordId);
  const organizationRecordId = readTrimmedString(
    (typed as ClientProfileCreateBody).organizationRecordId,
  );

  if (!clientRecordId) throw new SyncEndpointError("Missing clientRecordId.", 400);
  if (!organizationRecordId) throw new SyncEndpointError("Missing organizationRecordId.", 400);

  return {
    clientRecordId,
    organizationRecordId,
    status: asStatus((typed as ClientProfileCreateBody).status),
    notes: readTrimmedString((typed as ClientProfileCreateBody).notes),
  };
}

function parseUpdateClientProfilePayload(payload: unknown): UpdateClientProfileDto {
  const typed = asRecord(payload, "Invalid update payload.");
  const recordId = readTrimmedString((typed as ClientProfileUpdateBody).recordId);
  if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);

  return {
    recordId,
    clientRecordId: readTrimmedString((typed as ClientProfileUpdateBody).clientRecordId),
    organizationRecordId: readTrimmedString(
      (typed as ClientProfileUpdateBody).organizationRecordId,
    ),
    status: asStatus((typed as ClientProfileUpdateBody).status),
    notes: readTrimmedString((typed as ClientProfileUpdateBody).notes),
  };
}

function parseFindByContextPayload(payload: unknown): FindClientProfileByContextDto {
  const typed = asRecord(payload, "Invalid find_by_context payload.");
  const clientRecordId = readTrimmedString((typed as ClientProfileFindByContextBody).clientRecordId);
  const organizationRecordId = readTrimmedString(
    (typed as ClientProfileFindByContextBody).organizationRecordId,
  );

  if (!clientRecordId) throw new SyncEndpointError("Missing clientRecordId.", 400);
  if (!organizationRecordId) throw new SyncEndpointError("Missing organizationRecordId.", 400);

  return { clientRecordId, organizationRecordId };
}

export function parseClientProfilesWorkflowBody(body: unknown): ClientProfilesWorkflowRequestDto {
  const typed = asRecord(body, "Invalid request body.") as ClientProfilesWorkflowBody;
  const operation = readTrimmedString(typed.operation);
  if (!operation) throw new SyncEndpointError("Missing operation.", 400);

  if (operation === "create") {
    return { operation, payload: parseCreateClientProfilePayload(typed.payload) };
  }
  if (operation === "update") {
    return { operation, payload: parseUpdateClientProfilePayload(typed.payload) };
  }
  if (operation === "get") {
    const payload = asRecord(typed.payload, "Invalid get payload.");
    const recordId = readTrimmedString(payload.recordId);
    if (!recordId) throw new SyncEndpointError("Missing recordId.", 400);
    return { operation, payload: { recordId } };
  }
  if (operation === "find_by_context") {
    return { operation, payload: parseFindByContextPayload(typed.payload) };
  }

  throw new SyncEndpointError("Unsupported operation.", 400);
}

export function parseEnsureLessonSummaryBody(body: unknown): EnsureLessonSummaryRequestDto {
	if (typeof body !== "object" || body == null || Array.isArray(body)) {
		throw new SyncEndpointError("Invalid request body.", 400);
	}

	const typed = body as EnsureLessonSummaryBody;
	const profileRecordId =
		(typeof typed.profileRecordId === "string"
			? typed.profileRecordId
			: (typeof typed.recordId === "string" ? typed.recordId : "")).trim();

	if (!profileRecordId) {
		throw new SyncEndpointError("Missing profileRecordId.", 400);
	}

	return { profileRecordId };
}

export function parseBackfillLessonSummariesBody(body: unknown): {
	pageSize: number;
	maxProfiles: number;
} {
	if (body == null) {
		return { pageSize: 100, maxProfiles: 5000 };
	}

	if (typeof body !== "object" || Array.isArray(body)) {
		throw new SyncEndpointError("Invalid request body.", 400);
	}

	const typed = body as BackfillLessonSummariesBody;
	const pageSize = asPositiveInteger(typed.pageSize) ?? 100;
	const maxProfiles = asPositiveInteger(typed.maxProfiles) ?? 5000;

	if (pageSize > 100) {
		throw new SyncEndpointError("pageSize cannot exceed 100.", 400);
	}

	if (maxProfiles > 20000) {
		throw new SyncEndpointError("maxProfiles cannot exceed 20000.", 400);
	}

	return { pageSize, maxProfiles };
}

export function parseRecomputeLessonSummariesBody(body: unknown): {
	pageSize: number;
	maxProfiles: number;
} {
	if (body == null) {
		return { pageSize: 100, maxProfiles: 5000 };
	}

	if (typeof body !== "object" || Array.isArray(body)) {
		throw new SyncEndpointError("Invalid request body.", 400);
	}

	const typed = body as RecomputeLessonSummariesBody;
	const pageSize = asPositiveInteger(typed.pageSize) ?? 100;
	const maxProfiles = asPositiveInteger(typed.maxProfiles) ?? 5000;

	if (pageSize > 100) {
		throw new SyncEndpointError("pageSize cannot exceed 100.", 400);
	}

	if (maxProfiles > 20000) {
		throw new SyncEndpointError("maxProfiles cannot exceed 20000.", 400);
	}

	return { pageSize, maxProfiles };
}

export function parseRecomputeSingleLessonSummaryBody(body: unknown): {
	profileRecordId: string;
	lessonSummaryRecordId?: string;
} {
	if (typeof body !== "object" || body == null || Array.isArray(body)) {
		throw new SyncEndpointError("Invalid request body.", 400);
	}

	const typed = body as RecomputeSingleLessonSummaryBody;
	const profileRecordId =
		(typeof typed.profileRecordId === "string"
			? typed.profileRecordId
			: (typeof typed.recordId === "string" ? typed.recordId : "")).trim();
	const lessonSummaryRecordId =
		typeof typed.lessonSummaryRecordId === "string"
			? typed.lessonSummaryRecordId.trim()
			: "";

	if (!profileRecordId) {
		throw new SyncEndpointError("Missing profileRecordId.", 400);
	}

	return lessonSummaryRecordId ? { profileRecordId, lessonSummaryRecordId } : { profileRecordId };
}
