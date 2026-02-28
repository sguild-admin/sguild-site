// app/api/webhooks/meta/route.ts
import crypto from "crypto"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 })
  }

  return new Response("Forbidden", { status: 403 })
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) return new Response("Server misconfigured", { status: 500 })

  const rawBody = await req.text()
console.log("META_WEBHOOK_HIT", {
  method: "POST",
  sig: req.headers.get("x-hub-signature-256"),
  len: rawBody.length,
})
  const sigHeader = req.headers.get("x-hub-signature-256") || ""
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")

  if (!timingSafeEqual(expected, sigHeader)) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Acknowledge quickly
  // Process later in a job/queue. For now just log the key fields
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response("Bad Request", { status: 400 })
  }

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field === "leadgen") {
        const leadgenId = change?.value?.leadgen_id
        const pageId = change?.value?.page_id || entry?.id
        console.log("meta leadgen webhook", { pageId, leadgenId })
        // TODO: enqueue fetchLeadDetails({ pageId, leadgenId, raw: body })
      }
    }
  }

  return new Response("OK", { status: 200 })
}
