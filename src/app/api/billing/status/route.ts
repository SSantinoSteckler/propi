import { billingRequest } from "@/lib/billing/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export function GET(request: Request) { return billingRequest(request, "status"); }
