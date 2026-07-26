import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Email link confirmation endpoint.
 *
 * Supabase emails a one-time `token_hash` rather than a session. This route
 * handler exchanges it for a real cookie-backed session and then redirects to
 * the follow-up screen. It is a route handler (not a Server Component) because
 * only handlers and Server Actions may write the auth cookies.
 *
 * Security notes:
 *  - `next` is constrained to a same-origin absolute path, so a crafted link
 *    cannot turn the confirmation into an open redirect.
 *  - A missing, malformed, expired, or already-used token lands on `/login`
 *    with a generic notice; nothing distinguishes "no such account" from
 *    "wrong token".
 */
const ALLOWED_TYPES: ReadonlyArray<EmailOtpType> = ["recovery", "email", "invite", "signup"];

function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  // Same-origin absolute paths only. Reject protocol-relative ("//evil.com")
  // and anything with a scheme.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export async function GET(request: NextRequest): Promise<never> {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  const type = (ALLOWED_TYPES as ReadonlyArray<string>).includes(rawType ?? "")
    ? (rawType as EmailOtpType)
    : null;

  if (!tokenHash || !type) {
    redirect("/login?notice=link-invalid");
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    redirect("/login?notice=link-invalid");
  }

  redirect(next);
}
