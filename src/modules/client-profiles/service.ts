import {
	createClientProfile,
	findClientProfileByContext,
	getClientProfileWorkflowRecord,
	getClientProfile,
	linkLessonSummaryToProfile,
	listClientProfiles,
	listProfilesMissingLessonSummary,
	updateClientProfile,
} from "./repo";
import {
	createInitialLessonSummaryForProfile,
	findExistingLessonSummaryForProfile,
	markLessonSummarySyncPending,
	recomputeLessonSummaryForClientProfile,
	writeLessonSummaryRecomputeError,
} from "@/modules/lesson-summaries";
import type {
	BackfillLessonSummariesResponse,
	ClientProfilesWorkflowResponseDto,
	EnsureLessonSummaryResponse,
	RecomputeLessonSummariesResponse,
	RecomputeSingleLessonSummaryResponse,
} from "./dto";
import { parseClientProfilesWorkflowBody } from "./schema";

export async function ensureLessonSummaryForClientProfile(
	profileRecordId: string,
): Promise<EnsureLessonSummaryResponse> {
	const profile = await getClientProfile(profileRecordId);

	if (profile.lessonSummaryId) {
		return {
			ok: true,
			profileRecordId: profile.recordId,
			lessonSummaryRecordId: profile.lessonSummaryId,
			result: "already_exists",
		};
	}

	const existingSummary = await findExistingLessonSummaryForProfile(profile.recordId);
	if (existingSummary) {
		await linkLessonSummaryToProfile(profile.recordId, existingSummary.recordId);
		return {
			ok: true,
			profileRecordId: profile.recordId,
			lessonSummaryRecordId: existingSummary.recordId,
			result: "linked_existing",
		};
	}

	const createdSummary = await createInitialLessonSummaryForProfile(profile.recordId);
	await linkLessonSummaryToProfile(profile.recordId, createdSummary.recordId);

	return {
		ok: true,
		profileRecordId: profile.recordId,
		lessonSummaryRecordId: createdSummary.recordId,
		result: "created",
	};
}

export async function backfillClientProfileLessonSummaries(input: {
	pageSize: number;
	maxProfiles: number;
}): Promise<BackfillLessonSummariesResponse> {
	let offset: string | null = null;
	let scanned = 0;
	let created = 0;
	let linkedExisting = 0;
	let alreadyExists = 0;
	let failed = 0;
	const failures: Array<{ profileRecordId: string; error: string }> = [];

	do {
		const page = await listProfilesMissingLessonSummary({
			pageSize: input.pageSize,
			...(offset ? { offset } : {}),
		});

		for (const profile of page.profiles) {
			if (scanned >= input.maxProfiles) {
				offset = null;
				break;
			}

			scanned += 1;
			try {
				const ensured = await ensureLessonSummaryForClientProfile(profile.recordId);
				if (ensured.result === "created") created += 1;
				else if (ensured.result === "linked_existing") linkedExisting += 1;
				else alreadyExists += 1;
			} catch (error) {
				failed += 1;
				failures.push({
					profileRecordId: profile.recordId,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		offset = page.nextOffset;
	} while (offset);

	return {
		ok: true,
		scanned,
		created,
		linkedExisting,
		alreadyExists,
		failed,
		failures,
	};
}

export async function recomputeAllClientProfileLessonSummaries(input: {
	pageSize: number;
	maxProfiles: number;
}): Promise<RecomputeLessonSummariesResponse> {
	let offset: string | null = null;
	let scanned = 0;
	let recomputed = 0;
	let created = 0;
	let linkedExisting = 0;
	let alreadyExists = 0;
	let failed = 0;
	const failures: Array<{ profileRecordId: string; error: string }> = [];

	do {
		const page = await listClientProfiles({
			pageSize: input.pageSize,
			...(offset ? { offset } : {}),
		});

		for (const profile of page.profiles) {
			if (scanned >= input.maxProfiles) {
				offset = null;
				break;
			}

			scanned += 1;
			let lessonSummaryRecordId: string | null = profile.lessonSummaryId;
			try {
				const ensured = await ensureLessonSummaryForClientProfile(profile.recordId);
				lessonSummaryRecordId = ensured.lessonSummaryRecordId;
				if (ensured.result === "created") created += 1;
				else if (ensured.result === "linked_existing") linkedExisting += 1;
				else alreadyExists += 1;

				await markLessonSummarySyncPending(lessonSummaryRecordId);
				await recomputeLessonSummaryForClientProfile({
					profileRecordId: profile.recordId,
					lessonSummaryRecordId,
					lessonRecordIds: profile.lessonIds,
				});
				recomputed += 1;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				failed += 1;
				failures.push({
					profileRecordId: profile.recordId,
					error: errorMessage,
				});
				if (lessonSummaryRecordId) {
					try {
						await writeLessonSummaryRecomputeError(lessonSummaryRecordId, errorMessage);
					} catch {
						// Preserve original error reporting even if error writeback fails.
					}
				}
			}
		}

		offset = page.nextOffset;
	} while (offset);

	return {
		ok: true,
		scanned,
		recomputed,
		created,
		linkedExisting,
		alreadyExists,
		failed,
		failures,
	};
}

export async function recomputeClientProfileLessonSummary(input: {
	profileRecordId: string;
	lessonSummaryRecordId?: string;
}): Promise<RecomputeSingleLessonSummaryResponse> {
	let lessonSummaryRecordId: string | null = input.lessonSummaryRecordId ?? null;
	try {
		const profile = await getClientProfile(input.profileRecordId);
		const ensured = await ensureLessonSummaryForClientProfile(profile.recordId);
		lessonSummaryRecordId = ensured.lessonSummaryRecordId;

		await markLessonSummarySyncPending(ensured.lessonSummaryRecordId);
		await recomputeLessonSummaryForClientProfile({
			profileRecordId: profile.recordId,
			lessonSummaryRecordId: ensured.lessonSummaryRecordId,
			lessonRecordIds: profile.lessonIds,
		});

		return {
			ok: true,
			profileRecordId: profile.recordId,
			lessonSummaryRecordId: ensured.lessonSummaryRecordId,
			result: ensured.result,
			recomputed: true,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		if (lessonSummaryRecordId) {
			try {
				await writeLessonSummaryRecomputeError(lessonSummaryRecordId, errorMessage);
			} catch {
				// Preserve original error.
			}
		}
		throw error;
	}
}

export async function runClientProfilesWorkflow(
	body: unknown,
): Promise<ClientProfilesWorkflowResponseDto> {
	const parsed = parseClientProfilesWorkflowBody(body);

	if (parsed.operation === "create") {
		const record = await createClientProfile(parsed.payload);
		return { ok: true, operation: "create", record };
	}
	if (parsed.operation === "update") {
		const record = await updateClientProfile(parsed.payload);
		return { ok: true, operation: "update", record };
	}
	if (parsed.operation === "get") {
		const record = await getClientProfileWorkflowRecord(parsed.payload.recordId);
		return { ok: true, operation: "get", record };
	}

	const record = await findClientProfileByContext(parsed.payload);
	return { ok: true, operation: "find_by_context", record };
}
