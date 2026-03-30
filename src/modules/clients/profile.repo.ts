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

export type ClientProfileRecord = {
	recordId: string;
	clientId: string | null;
	lessonSummaryId: string | null;
	lessonIds: string[];
};

function readString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function readFirstLinkedId(value: unknown): string | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const first = value[0];
	return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readLinkedIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids: string[] = [];
	for (const item of value) {
		if (typeof item === "string" && item.trim().length > 0) ids.push(item.trim());
	}
	return ids;
}

function getProfilesTableName(): string {
	return airtableSchema.operations.tables.clientProfiles;
}

function getProfileClientLinkField(): string {
	return airtableSchema.operations.fields.clientProfiles.clientLink;
}

function getProfileLessonSummaryLinkField(): string {
	return airtableSchema.operations.fields.clientProfiles.lessonSummaryLink;
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

function toClientProfileRecord(record: AirtableRecord): ClientProfileRecord {
	const fields = record.fields ?? {};
	const clientField = getProfileClientLinkField();
	const summaryField = getProfileLessonSummaryLinkField();

	return {
		recordId: record.id,
		clientId: readFirstLinkedId(fields[clientField]),
		lessonSummaryId: readFirstLinkedId(fields[summaryField]),
		lessonIds: readLinkedIds(fields["Lessons"]),
	};
}

export async function getClientProfile(recordId: string): Promise<ClientProfileRecord> {
	const table = getProfilesTableName();
	const response = await airtableRequest(
		`${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`,
		{ method: "GET" },
	);

	if (response.status === 404) {
		throw new SyncEndpointError("Client Profile not found.", 404);
	}

	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to load Client Profile: ${message}`, 502);
	}

	const record = (await response.json()) as AirtableRecord;
	return toClientProfileRecord(record);
}

export async function listProfilesMissingLessonSummary(input?: {
	pageSize?: number;
	offset?: string;
}): Promise<{ profiles: ClientProfileRecord[]; nextOffset: string | null }> {
	const table = getProfilesTableName();
	const summaryField = getProfileLessonSummaryLinkField();
	const params = new URLSearchParams({
		pageSize: String(input?.pageSize ?? 100),
		// Linked-record fields serialize to empty string when no links exist.
		filterByFormula: `LEN(ARRAYJOIN({${summaryField}}))=0`,
	});
	if (input?.offset) params.set("offset", input.offset);

	const response = await airtableRequest(
		`${encodeURIComponent(table)}?${params.toString()}`,
		{ method: "GET" },
	);

	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to list Client Profiles: ${message}`, 502);
	}

	const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
	return {
		profiles: (body.records ?? []).map((record) => toClientProfileRecord(record)),
		nextOffset: typeof body.offset === "string" ? body.offset : null,
	};
}

export async function listClientProfiles(input?: {
	pageSize?: number;
	offset?: string;
}): Promise<{ profiles: ClientProfileRecord[]; nextOffset: string | null }> {
	const table = getProfilesTableName();
	const params = new URLSearchParams({
		pageSize: String(input?.pageSize ?? 100),
	});
	if (input?.offset) params.set("offset", input.offset);

	const response = await airtableRequest(
		`${encodeURIComponent(table)}?${params.toString()}`,
		{ method: "GET" },
	);

	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to list Client Profiles: ${message}`, 502);
	}

	const body = (await response.json()) as { records?: AirtableRecord[]; offset?: string };
	return {
		profiles: (body.records ?? []).map((record) => toClientProfileRecord(record)),
		nextOffset: typeof body.offset === "string" ? body.offset : null,
	};
}

export async function linkLessonSummaryToProfile(
	profileRecordId: string,
	lessonSummaryRecordId: string,
): Promise<void> {
	const table = getProfilesTableName();
	const summaryField = getProfileLessonSummaryLinkField();
	const response = await airtableRequest(
		`${encodeURIComponent(table)}/${encodeURIComponent(profileRecordId)}`,
		{
			method: "PATCH",
			body: JSON.stringify({
				fields: {
					[summaryField]: [lessonSummaryRecordId],
				},
			}),
		},
	);

	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to update Client Profile: ${message}`, 502);
	}
}
