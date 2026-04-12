import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const apiUrl = process.env.API_URL;
  const syncSecret = process.env.SYNC_SECRET;

  // Query Airtable for reservations to lock
  const filter = encodeURIComponent(
    'AND({Status} = "Reserved", {Lesson Start At} != "", DATETIME_DIFF({Lesson Start At}, NOW(), "hours") <= 48, DATETIME_DIFF({Lesson Start At}, NOW(), "hours") > 0)'
  );

  const airtableUrl = `https://api.airtable.com/v0/${baseId}/Credit%20Reservations?filterByFormula=${filter}&fields%5B%5D=Status`;

  const listRes = await fetch(airtableUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!listRes.ok) {
    const text = await listRes.text();
    return NextResponse.json({ ok: false, error: `Airtable query failed: ${text}` }, { status: 500 });
  }

  const data = await listRes.json();
  const records = data.records || [];

  const results = [];

  for (const record of records) {
    try {
      const lockRes = await fetch(`${apiUrl}/api/reservations/lock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${syncSecret}`,
        },
        body: JSON.stringify({ recordId: record.id }),
      });

      const raw = await lockRes.text();
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        body = { raw };
      }

      results.push({ recordId: record.id, status: lockRes.status, result: body });
    } catch (err) {
      results.push({ recordId: record.id, error: String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
