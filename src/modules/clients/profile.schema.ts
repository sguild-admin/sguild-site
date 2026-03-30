import { SyncEndpointError } from "@/lib/errors";

type EnsureLessonSummaryBody = {
	profileRecordId?: unknown;
};

type RecomputeSingleLessonSummaryBody = {
	profileRecordId?: unknown;
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

export type EnsureLessonSummaryResponse = {
	ok: true;
	profileRecordId: string;
	lessonSummaryRecordId: string;
	result: "created" | "linked_existing" | "already_exists";
};

export type BackfillLessonSummariesResponse = {
	ok: true;
	scanned: number;
	created: number;
	linkedExisting: number;
	alreadyExists: number;
	failed: number;
	failures: Array<{ profileRecordId: string; error: string }>;
};

export type RecomputeLessonSummariesResponse = {
	ok: true;
	scanned: number;
	recomputed: number;
	created: number;
	linkedExisting: number;
	alreadyExists: number;
	failed: number;
	failures: Array<{ profileRecordId: string; error: string }>;
};

export type RecomputeSingleLessonSummaryResponse = {
	ok: true;
	profileRecordId: string;
	lessonSummaryRecordId: string;
	result: "created" | "linked_existing" | "already_exists";
	recomputed: true;
};

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

export function parseEnsureLessonSummaryBody(body: unknown): { profileRecordId: string } {
	if (typeof body !== "object" || body == null || Array.isArray(body)) {
		throw new SyncEndpointError("Invalid request body.", 400);
	}

	const typed = body as EnsureLessonSummaryBody;
	const profileRecordId =
		typeof typed.profileRecordId === "string" ? typed.profileRecordId.trim() : "";

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
		typeof typed.profileRecordId === "string" ? typed.profileRecordId.trim() : "";
	const lessonSummaryRecordId =
		typeof typed.lessonSummaryRecordId === "string"
			? typed.lessonSummaryRecordId.trim()
			: "";

	if (!profileRecordId) {
		throw new SyncEndpointError("Missing profileRecordId.", 400);
	}

	return lessonSummaryRecordId ? { profileRecordId, lessonSummaryRecordId } : { profileRecordId };
}
