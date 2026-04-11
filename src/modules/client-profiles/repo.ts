import { SyncEndpointError } from "@/lib/errors";
import { airtableSchema } from "@/config/airtable-schema";
import {
	airtableRequest,
	escapeAirtableFormulaString,
	parseAirtableError,
} from "@/lib/airtable/client";
import type {
	ClientProfileRecordDto,
	CreateClientProfileDto,
	FindClientProfileByContextDto,
	UpdateClientProfileDto,
} from "./dto";

type AirtableRecord = {
	id: string;
	fields?: Record<string, unknown>;
};

export type ClientProfileRecord = {
	recordId: string;
	clientId: string | null;
	lessonSummaryId: string | null;
	lessonIds: string[];
};

type ClientProfilesFieldMap = typeof airtableSchema.operations.fields.clientProfiles;

function readFirstLinkedId(value: unknown): string | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const first = value[0];
	return typeof first === "string" && first.trim().length > 0 ? first.trim() : null;
}

function readString(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (Array.isArray(value)) {
		for (const item of value) {
			const parsed = readString(item);
			if (parsed) return parsed;
		}
	}
	return null;
}

function readNumber(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		return Number.isFinite(parsed) ? parsed : 0;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			const parsed = readNumber(item);
			if (Number.isFinite(parsed) && parsed !== 0) return parsed;
		}
	}
	return 0;
}

function readFlag(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
		if (normalized === "0" || normalized === "false" || normalized === "no") return false;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			if (readFlag(item)) return true;
		}
	}
	return false;
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

function getProfilesFieldMap(): ClientProfilesFieldMap {
	return airtableSchema.operations.fields.clientProfiles;
}

function getProfileClientLinkField(): string {
	const fields = getProfilesFieldMap();
	return fields.client ?? fields.clientLink;
}

function getProfileLessonSummaryLinkField(): string {
	return airtableSchema.operations.fields.clientProfiles.lessonSummaryLink;
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

function toClientProfileWorkflowRecord(record: AirtableRecord): ClientProfileRecordDto {
	const fields = record.fields ?? {};
	const f = getProfilesFieldMap();

	const statusRaw = readString(fields[f.status]);
	const status =
		statusRaw === "Active" || statusRaw === "Paused" || statusRaw === "Inactive"
			? statusRaw
			: null;

	return {
		recordId: record.id,
		status,
		notes: readString(fields[f.notes]),
		clientRecordId: readFirstLinkedId(fields[f.client ?? f.clientLink]),
		organizationRecordId: readFirstLinkedId(fields[f.organization]),
		lessonIds: readLinkedIds(fields[f.lessons]),
		orderIds: readLinkedIds(fields[f.orders]),
		creditAccountIds: readLinkedIds(fields[f.creditAccount]),
		clientActivationSummaryIds: readLinkedIds(fields[f.clientActivationSummary]),
		studentProfileIds: readLinkedIds(fields[f.studentProfiles]),
		clientName: readString(fields[f.clientName]),
		clientPhone: readString(fields[f.clientPhone]),
		lessonCount: readNumber(fields[f.lessonCount]),
		orderCount: readNumber(fields[f.orderCount]),
		hasCreditAccount: readFlag(fields[f.hasCreditAccount]),
		hasClientActivationSummary: readFlag(fields[f.hasClientActivationSummary]),
		hasActivity: readFlag(fields[f.hasActivity]),
		needsActivationSummaryCreation: readFlag(fields[f.needsActivationSummaryCreation]),
		missingClient: readFlag(fields[f.missingClient]),
		missingOrganization: readFlag(fields[f.missingOrganization]),
		missingCreditAccount: readFlag(fields[f.missingCreditAccount]),
		missingActivationSummary: readFlag(fields[f.missingActivationSummary]),
		hasException: readFlag(fields[f.hasException]),
		exceptionReason: readString(fields[f.exceptionReason]),
		createdAt: readString(fields[f.createdAt]),
		modifiedAt: readString(fields[f.modifiedAt]),
	};
}

function toWorkflowWriteFields(
	input: Partial<CreateClientProfileDto | UpdateClientProfileDto>,
): Record<string, unknown> {
	const fieldsMap = getProfilesFieldMap();
	const writeFields: Record<string, unknown> = {};
	const writeClientField = fieldsMap.client ?? fieldsMap.clientLink;

	if ("clientRecordId" in input && input.clientRecordId) {
		writeFields[writeClientField] = [input.clientRecordId];
	}
	if ("organizationRecordId" in input && input.organizationRecordId) {
		writeFields[fieldsMap.organization] = [input.organizationRecordId];
	}
	if ("status" in input && input.status) writeFields[fieldsMap.status] = input.status;
	if ("notes" in input && input.notes != null) writeFields[fieldsMap.notes] = input.notes;

	return writeFields;
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

export async function createClientProfile(
	input: CreateClientProfileDto,
): Promise<ClientProfileRecordDto> {
	const table = getProfilesTableName();
	const writeFields = toWorkflowWriteFields(input);

	const response = await airtableRequest(encodeURIComponent(table), {
		method: "POST",
		body: JSON.stringify({ fields: writeFields }),
	});
	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to create Client Profile: ${message}`, 502);
	}

	return toClientProfileWorkflowRecord((await response.json()) as AirtableRecord);
}

export async function updateClientProfile(
	input: UpdateClientProfileDto,
): Promise<ClientProfileRecordDto> {
	const table = getProfilesTableName();
	const { recordId } = input;
	const writeFields = toWorkflowWriteFields(input);
	if (Object.keys(writeFields).length === 0) {
		return getClientProfileWorkflowRecord(recordId);
	}

	const response = await airtableRequest(
		`${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`,
		{
			method: "PATCH",
			body: JSON.stringify({ fields: writeFields }),
		},
	);
	if (response.status === 404) {
		throw new SyncEndpointError("Client Profile not found.", 404);
	}
	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to update Client Profile: ${message}`, 502);
	}

	return toClientProfileWorkflowRecord((await response.json()) as AirtableRecord);
}

export async function getClientProfileWorkflowRecord(
	recordId: string,
): Promise<ClientProfileRecordDto> {
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

	return toClientProfileWorkflowRecord((await response.json()) as AirtableRecord);
}

export async function findClientProfileByContext(
	input: FindClientProfileByContextDto,
): Promise<ClientProfileRecordDto | null> {
	const table = getProfilesTableName();
	const fields = getProfilesFieldMap();
	const clientField = fields.client ?? fields.clientLink;
	const escapedClient = escapeAirtableFormulaString(input.clientRecordId);
	const escapedOrg = escapeAirtableFormulaString(input.organizationRecordId);
	const formula = `AND(FIND('${escapedClient}', ARRAYJOIN({${clientField}})), FIND('${escapedOrg}', ARRAYJOIN({${fields.organization}})))`;
	const params = new URLSearchParams({ pageSize: "2", filterByFormula: formula });

	const response = await airtableRequest(
		`${encodeURIComponent(table)}?${params.toString()}`,
		{ method: "GET" },
	);
	if (!response.ok) {
		const message = await parseAirtableError(response);
		throw new SyncEndpointError(`Failed to find Client Profile by context: ${message}`, 502);
	}

	const body = (await response.json()) as { records?: AirtableRecord[] };
	const records = body.records ?? [];
	if (records.length === 0) return null;
	if (records.length > 1) {
		throw new SyncEndpointError(
			"Multiple Client Profiles found for same Client + Organization.",
			409,
		);
	}

	return toClientProfileWorkflowRecord(records[0]);
}
