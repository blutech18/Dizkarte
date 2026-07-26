import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/session";
import { Breadcrumbs } from "@/components/ui/Field";
import { DeniedState } from "@/components/ui/AsyncState";
import { LinkButton } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Access restricted" };
export const dynamic = "force-dynamic";

const CAPABILITY_LABEL: Record<string, string> = {
  ADMIN_SUPER: "Super Admin",
  ADMIN_FINANCE: "Finance Admin",
  ADMIN_SUPPORT: "Support Admin",
};

/**
 * Shown when a signed-in Admin opens a page their capability does not cover.
 *
 * This is a readable outcome, not a security boundary: the page was already
 * refused server-side before any data was read. It states which capabilities
 * the current account holds so the user knows whether to ask for a different
 * grant or simply navigate elsewhere.
 */
export default async function AccessRestrictedPage() {
  const session = await requireAdminSession();
  const held = session.capabilities
    .map((capability) => CAPABILITY_LABEL[capability] ?? capability)
    .join(", ");

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Access restricted" }]}
      />
      <DeniedState
        title="Access restricted"
        description={`That section requires an Admin capability your account does not hold. You are signed in as ${session.displayName} with: ${held || "no Admin capability"}.`}
      />
      <div className="dk-row" style={{ marginTop: 16 }}>
        <LinkButton href="/dashboard" variant="primary">
          Back to dashboard
        </LinkButton>
      </div>
    </>
  );
}
