"use server";

import { headers } from "next/headers";
import { passwordResetRequestSchema } from "@dizkarte/domain";
import { requestAdminPasswordReset } from "@/lib/session";

export type ResetRequestState = {
  readonly error: string | null;
  readonly sent: boolean;
};

/**
 * Resolve this deployment's own origin for the emailed link.
 *
 * Derived from the request rather than hard-coded so the same build works in
 * local development and behind a proxy. `ADMIN_SITE_URL` overrides it when the
 * forwarded headers cannot be trusted. The value only ever forms a link back to
 * this app, and Supabase additionally rejects any redirect URL that is not
 * allow-listed in the project's Auth settings.
 */
async function requestOrigin(): Promise<string> {
  const configured = process.env["ADMIN_SITE_URL"]?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestResetAction(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = passwordResetRequestSchema.safeParse({ email: String(formData.get("email") ?? "") });
  if (!parsed.success) {
    return { error: "Enter a valid email address.", sent: false };
  }

  await requestAdminPasswordReset(parsed.data.email, await requestOrigin());
  // Always reports the same outcome: the console must not reveal whether the
  // address exists or holds Admin access.
  return { error: null, sent: true };
}
