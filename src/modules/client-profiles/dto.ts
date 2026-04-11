export type EnsureLessonSummaryRequestDto = {
  profileRecordId: string;
};

export type RecomputeSingleLessonSummaryRequestDto = {
  profileRecordId: string;
  lessonSummaryRecordId?: string;
};

export type RecomputeLessonSummariesRequestDto = {
  pageSize: number;
  maxProfiles: number;
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

export type ClientProfilesErrorResponse = {
  ok: false;
  error: string;
};

export type ClientProfileStatus = "Active" | "Paused" | "Inactive";

export type ClientProfileRecordDto = {
  recordId: string;
  status: ClientProfileStatus | null;
  notes: string | null;
  clientRecordId: string | null;
  organizationRecordId: string | null;
  lessonIds: string[];
  orderIds: string[];
  creditAccountIds: string[];
  clientActivationSummaryIds: string[];
  studentProfileIds: string[];
  clientName: string | null;
  clientPhone: string | null;
  lessonCount: number;
  orderCount: number;
  hasCreditAccount: boolean;
  hasClientActivationSummary: boolean;
  hasActivity: boolean;
  needsActivationSummaryCreation: boolean;
  missingClient: boolean;
  missingOrganization: boolean;
  missingCreditAccount: boolean;
  missingActivationSummary: boolean;
  hasException: boolean;
  exceptionReason: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
};

export type CreateClientProfileDto = {
  clientRecordId: string;
  organizationRecordId: string;
  status?: ClientProfileStatus;
  notes?: string;
};

export type UpdateClientProfileDto = {
  recordId: string;
  status?: ClientProfileStatus;
  notes?: string;
  clientRecordId?: string;
  organizationRecordId?: string;
};

export type FindClientProfileByContextDto = {
  clientRecordId: string;
  organizationRecordId: string;
};

export type ClientProfilesWorkflowRequestDto =
  | { operation: "create"; payload: CreateClientProfileDto }
  | { operation: "update"; payload: UpdateClientProfileDto }
  | { operation: "get"; payload: { recordId: string } }
  | { operation: "find_by_context"; payload: FindClientProfileByContextDto };

export type ClientProfilesWorkflowResponseDto =
  | { ok: true; operation: "create"; record: ClientProfileRecordDto }
  | { ok: true; operation: "update"; record: ClientProfileRecordDto }
  | { ok: true; operation: "get"; record: ClientProfileRecordDto }
  | { ok: true; operation: "find_by_context"; record: ClientProfileRecordDto | null };
