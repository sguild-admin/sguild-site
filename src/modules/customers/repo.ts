import { createLeadAndAttribution as createLeadAndAttributionRecord } from "@/lib/airtable/leads";

export async function createLeadAndAttribution(input: {
	firstName: string;
	lastName: string;
	formattedPhone: string;
	zipCode: string;
	lessonSetting: string;
	ageGroup: string;
	startTimeline: string;
	landingUrl: string;
	campaignCode: string;
}) {
	return createLeadAndAttributionRecord(input);
}
