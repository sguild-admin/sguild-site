import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import { ensureAirtableSchemaValidated } from "@/lib/airtable/schema-guard";

type AirtableRecord = {
	id: string;
	fields?: Record<string, unknown>;
};

type AirtableError = {
	error?: {
		type?: string;
		message?: string;
	};
};

export type LessonForSummaryRecompute = {
	recordId: string;
	status: string | null;
	startAt: string | null;
};

export type LessonSummaryRecomputeFields = {
	lastLessonAt?: string | null;
	nextLessonAt?: string | null;
	completedLessonCount?: number;
	canceledLessonCount?: number;
	noShowLessonCount?: number;
	scheduledFutureLessonCount?: number;
	lastLessonStatus?: string | null;
	lastRefreshedAt?: string;
	needsRefresh?: boolean;
	syncStatus?: "Pending" | "Synced" | "Failed" | "Ignored";
	syncError?: string | null;
};

function readString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function readLinkedIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids: string[] = [];
	for (const item of value) {
		if (typeof item === "string" && item.trim().length > 0) {
			ids.push(item.trim());
		}
	}
	return ids;
}

function getLessonSummariesTableName(): string {
	return airtableSchema.operations.tables.clientLessonSummaries;
}

function getSummaryProfileLinkField(): string {
	return airtableSchema.operations.fields.clientLessonSummaries.profileLink;
}

function getLessonsTableName(): string {
	return airtableSchema.operations.tables.lessons;
}

function getAirtableConfig(): { token: string; baseId: string } {
	const token = readString(process.env.AIRTABLE_OPERATIONS_TOKEN) ?? readString(process.env.AIRTABLE_TOKEN);
	const baseId = readString(process.env.AIRTABLE_OPERATIONS_BASE_ID) ?? readString(process.env.AIRTABLE_BASE_ID);

	if (!token || !baseId) {
		throw new SyncEndpointError("Airtable configuration is missing.", 500, {
			exposeMessage: false,
		});
	}

	return { token, baseId };
}

async function parseAirtableError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as AirtableError;
		if (body.error?.message) return body.error.message;
	} catch {
		// fall through
	}
	return response.statusText || "Unknown Airtable error";
}

async function airtableRequest(path: string, init?: RequestInit): Promise<Response> {
	const { token, baseId } = getAirtableConfig();
	await ensureAirtableSchemaValidated({ token, baseId, scope: "operations" });
	return fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
		cache: "no-store",
	});
}

function escapeAirtableFormulaString(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function readStringLike(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			const parsed = readStringLike(item);
			if (parsed) return parsed;
		}
	}
	return null;
}

export async function findLessonSummaryByProfile(
	profileRecordId: string,
): Promise<{ recordId: string } | null> {
	const table = getLessonSummariesTableName();
	const profileField = getSummaryProfileLinkField();
	const escapedId = escapeAirtableFormulaString(profileRecordId);
	const params = new URLSearchParams({
		maxRecords: "5",
		filterByFormula: `FIND('${escapedId}', ARRAYJOIN({${profileField}}))`,
	});

	const response = await airtableRequest(
		`${encodeURIComponent(table)}?${params.toString()}`,
		{ method: "GET" },
	);

	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to find Lesson Summary: ${message}`, 502);
	}

	const body = (await response.json()) as { records?: AirtableRecord[] };
	for (const record of body.records ?? []) {
		const linkedProfileIds = readLinkedIds((record.fields ?? {})[profileField]);
		if (!linkedProfileIds.includes(profileRecordId)) continue;
		return { recordId: record.id };
	}

	return null;
}

export async function createLessonSummaryForProfile(
	profileRecordId: string,
): Promise<{ recordId: string }> {
	const table = getLessonSummariesTableName();
	const profileField = getSummaryProfileLinkField();
	const response = await airtableRequest(encodeURIComponent(table), {
		method: "POST",
		body: JSON.stringify({
			records: [
				{
					fields: {
						[profileField]: [profileRecordId],
					},
				},
			],
		}),
	});

	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to create Lesson Summary: ${message}`, 502);
	}

	const body = (await response.json()) as { records?: AirtableRecord[] };
	const recordId = body.records?.[0]?.id;
	if (!recordId) {
		throw new SyncEndpointError("Lesson Summary was created without a record ID.", 502, {
			exposeMessage: false,
		});
	}

	return { recordId };
}

export async function listLessonsByRecordIds(
	lessonRecordIds: string[],
): Promise<LessonForSummaryRecompute[]> {
	if (lessonRecordIds.length === 0) return [];

	const table = getLessonsTableName();
	const statusField = airtableSchema.operations.fields.lessons.status;
	const startAtField = airtableSchema.operations.fields.lessons.startAt;
	const rows: LessonForSummaryRecompute[] = [];
	const chunkSize = 25;

	for (let i = 0; i < lessonRecordIds.length; i += chunkSize) {
		const chunk = lessonRecordIds.slice(i, i + chunkSize);
		const orFormula = chunk
			.map((id) => `RECORD_ID()='${escapeAirtableFormulaString(id)}'`)
			.join(",");
		const formula = `OR(${orFormula})`;
		const params = new URLSearchParams({
			pageSize: "100",
			filterByFormula: formula,
		});

		const response = await airtableRequest(
			`${encodeURIComponent(table)}?${params.toString()}`,
			{ method: "GET" },
		);

		if (!response.ok) {
			const message = await parseAirtableError(response);
			throw new SyncEndpointError(`Failed to list Lessons for profile: ${message}`, 502);
		}

		const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
		for (const record of body.records ?? []) {
			const fields = record.fields ?? {};
			rows.push({
				recordId: record.id,
				status: readStringLike(fields[statusField]),
				startAt: readStringLike(fields[startAtField]),
			});
		}
	}

	return rows;
}

export async function updateLessonSummaryForRecompute(
	summaryRecordId: string,
	input: LessonSummaryRecomputeFields,
): Promise<void> {
	const table = getLessonSummariesTableName();
	const fieldsMap = airtableSchema.operations.fields.clientLessonSummaries;
	const fields: Record<string, unknown> = {
		[fieldsMap.lastLessonAt]: input.lastLessonAt ?? null,
		[fieldsMap.nextLessonAt]: input.nextLessonAt ?? null,
		[fieldsMap.completedLessonCount]: input.completedLessonCount ?? 0,
		[fieldsMap.canceledLessonCount]: input.canceledLessonCount ?? 0,
		[fieldsMap.noShowLessonCount]: input.noShowLessonCount ?? 0,
		[fieldsMap.scheduledFutureLessonCount]: input.scheduledFutureLessonCount ?? 0,
		[fieldsMap.lastLessonStatus]: input.lastLessonStatus ?? null,
		[fieldsMap.lastRefreshedAt]: input.lastRefreshedAt ?? new Date().toISOString(),
		[fieldsMap.needsRefresh]: input.needsRefresh ?? false,
		[fieldsMap.syncStatus]: input.syncStatus ?? "Synced",
		[fieldsMap.syncError]: input.syncError ?? null,
	};

	const optionalFields = new Set(Object.keys(fields));
	const fieldsToWrite: Record<string, unknown> = { ...fields };

	while (true) {
		const response = await airtableRequest(
			`${encodeURIComponent(table)}/${encodeURIComponent(summaryRecordId)}`,
			{
				method: "PATCH",
				body: JSON.stringify({ fields: fieldsToWrite }),
			},
		);

		if (response.ok) return;

		const message = await parseAirtableError(response);
		const missingFieldMatch = message.match(/Unknown field name: "([^"]+)"/);
		const missingField = missingFieldMatch?.[1];

		if (missingField && optionalFields.has(missingField) && missingField in fieldsToWrite) {
			delete fieldsToWrite[missingField];
			if (Object.keys(fieldsToWrite).length === 0) return;
			continue;
		}

		if (/Insufficient permissions to create new select option/i.test(message)) {
			const statusField = fieldsMap.lastLessonStatus;
			if (statusField in fieldsToWrite) {
				delete fieldsToWrite[statusField];
				if (Object.keys(fieldsToWrite).length === 0) return;
				continue;
			}
		}

		throw new SyncEndpointError(`Failed to update Lesson Summary: ${message}`, 502);
	}
}

export async function writeLessonSummarySyncError(
	summaryRecordId: string,
	errorMessage: string | null,
): Promise<void> {
	await writeLessonSummarySyncState(summaryRecordId, {
		syncError: errorMessage,
		syncStatus: errorMessage ? "Failed" : "Synced",
	});
}

export async function writeLessonSummarySyncState(
	summaryRecordId: string,
	input: {
		syncStatus?: "Pending" | "Synced" | "Failed" | "Ignored";
		syncError?: string | null;
	},
): Promise<void> {
	const table = getLessonSummariesTableName();
	const syncErrorField = airtableSchema.operations.fields.clientLessonSummaries.syncError;
	const syncStatusField = airtableSchema.operations.fields.clientLessonSummaries.syncStatus;
	const fields: Record<string, unknown> = {};
	if (input.syncError !== undefined) fields[syncErrorField] = input.syncError;
	if (input.syncStatus !== undefined) fields[syncStatusField] = input.syncStatus;

	const response = await airtableRequest(
		`${encodeURIComponent(table)}/${encodeURIComponent(summaryRecordId)}`,
		{
			method: "PATCH",
			body: JSON.stringify({
				fields,
			}),
		},
	);

	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to write Lesson Summary sync state: ${message}`, 502);
	}
}
