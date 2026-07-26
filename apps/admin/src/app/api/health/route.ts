import { NextResponse } from "next/server";
import { evaluateServerConfig } from "@dizkarte/config";

export const dynamic = "force-dynamic";

/**
 * Health/readiness check. Reveals only readiness booleans — never
 * configuration values, secrets, or violation messages that could disclose
 * environment internals to an unauthenticated caller.
 */
export function GET() {
  const { ok } = evaluateServerConfig(process.env);
  return NextResponse.json({ success: true, data: { ready: ok } });
}
