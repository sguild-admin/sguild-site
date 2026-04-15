export type Utms = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

export type LeadRequestBody = {
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

export type LeadSubmissionResponse = {
  ok: true;
  leadId: string;
};
