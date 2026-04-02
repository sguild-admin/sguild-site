export type RecordId = string;

export type AirtableFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | AirtableFieldValue[]
  | Record<string, unknown>;

export type AirtableFields = Record<string, AirtableFieldValue>;

export type AirtableRecord<TFields extends AirtableFields = AirtableFields> = {
  id: RecordId;
  fields?: TFields;
};

