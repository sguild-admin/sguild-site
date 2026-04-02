import {
	createLessonSummaryForProfile,
	findLessonSummaryByProfile,
	listLessonsByRecordIds,
	updateLessonSummaryForRecompute,
	writeLessonSummarySyncError,
	writeLessonSummarySyncState,
} from "./repo";
import type { RecomputeLessonSummaryInputDto, RecomputeLessonSummaryResultDto } from "./dto";

export async function findExistingLessonSummaryForProfile(profileRecordId: string) {
	return findLessonSummaryByProfile(profileRecordId);
}

export async function createInitialLessonSummaryForProfile(profileRecordId: string) {
	return createLessonSummaryForProfile(profileRecordId);
}

function normalizeStatus(status: string | null): string {
	return (status ?? "").trim().toLowerCase();
}

function isCompletedStatus(status: string): boolean {
	return status === "completed" || status === "complete";
}

function isCanceledStatus(status: string): boolean {
	return status === "canceled" || status === "cancelled";
}

function isNoShowStatus(status: string): boolean {
	return status === "no show" || status === "no-show" || status === "noshow";
}

function isScheduledStatus(status: string): boolean {
	return status === "scheduled";
}

function toIsoDate(value: Date): string {
	const year = value.getUTCFullYear();
	const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
	const day = `${value.getUTCDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export async function recomputeLessonSummaryForClientProfile(
	input: RecomputeLessonSummaryInputDto,
): Promise<void> {
	const lessons = await listLessonsByRecordIds(input.lessonRecordIds);
	const now = Date.now();

	let completedLessonCount = 0;
	let canceledLessonCount = 0;
	let noShowLessonCount = 0;
	let scheduledFutureLessonCount = 0;

	let lastLessonDate: Date | null = null;
	let lastLessonStatus: string | null = null;
	let nextLessonDate: Date | null = null;

	for (const lesson of lessons) {
		const normalizedStatus = normalizeStatus(lesson.status);

		if (isCompletedStatus(normalizedStatus)) completedLessonCount += 1;
		if (isCanceledStatus(normalizedStatus)) canceledLessonCount += 1;
		if (isNoShowStatus(normalizedStatus)) noShowLessonCount += 1;

		if (!lesson.startAt) continue;
		const startDate = new Date(lesson.startAt);
		if (Number.isNaN(startDate.getTime())) continue;
		const startMs = startDate.getTime();

		if (isScheduledStatus(normalizedStatus) && startMs > now) {
			scheduledFutureLessonCount += 1;
			if (!nextLessonDate || startMs < nextLessonDate.getTime()) {
				nextLessonDate = startDate;
			}
		}

		if (startMs <= now && (!lastLessonDate || startMs > lastLessonDate.getTime())) {
			lastLessonDate = startDate;
			lastLessonStatus = lesson.status;
		}
	}

	await updateLessonSummaryForRecompute(input.lessonSummaryRecordId, {
		lastLessonAt: lastLessonDate ? lastLessonDate.toISOString() : null,
		nextLessonAt: nextLessonDate ? toIsoDate(nextLessonDate) : null,
		completedLessonCount,
		canceledLessonCount,
		noShowLessonCount,
		scheduledFutureLessonCount,
		lastLessonStatus,
		lastRefreshedAt: new Date().toISOString(),
		needsRefresh: false,
		syncStatus: lessons.length === 0 ? "Ignored" : "Synced",
		syncError: null,
	});
}

export async function recomputeLessonSummary(
	input: RecomputeLessonSummaryInputDto,
): Promise<RecomputeLessonSummaryResultDto> {
	await recomputeLessonSummaryForClientProfile(input);
	return {
		ok: true,
		lessonSummaryRecordId: input.lessonSummaryRecordId,
		recomputedAt: new Date().toISOString(),
	};
}

export async function writeLessonSummaryRecomputeError(
	lessonSummaryRecordId: string,
	errorMessage: string,
): Promise<void> {
	await writeLessonSummarySyncError(lessonSummaryRecordId, errorMessage);
}

export async function markLessonSummarySyncPending(
	lessonSummaryRecordId: string,
): Promise<void> {
	await writeLessonSummarySyncState(lessonSummaryRecordId, {
		syncStatus: "Pending",
		syncError: null,
	});
}
