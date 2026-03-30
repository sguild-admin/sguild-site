import { NextResponse } from "next/server";
import { failureFromError } from "./service";
import { assertJsonRequest, parseJsonBody } from "@/lib/http/request";
import { validateOrdersSecret } from "./repo";
import { runOrderBilling } from "./service";

export function methodNotAllowed(): NextResponse {
	return NextResponse.json(
		{ ok: false, error: "Method Not Allowed" },
		{ status: 405, headers: { Allow: "POST" } },
	);
}

export async function handleProcessOrderBilling(request: Request) {
	try {
		validateOrdersSecret(request);
		assertJsonRequest(request);
		const body = await parseJsonBody(request);
		const response = await runOrderBilling(body);
		return NextResponse.json(response, { status: 200 });
	} catch (error) {
		const { status, body } = failureFromError(error);
		return NextResponse.json(body, { status });
	}
}
