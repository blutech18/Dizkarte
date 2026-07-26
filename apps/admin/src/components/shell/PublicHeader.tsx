import { LinkButton } from "@/components/ui/Button";

/**
 * Shared header for public (unauthenticated) pages — the landing page and the
 * login page. Airtasker-style: logo left, a couple of pill-shaped actions
 * right, sticky white bar with a subtle bottom border.
 */
export function PublicHeader({
  variant = "landing",
}: {
  readonly variant?: "landing" | "login";
}) {
  return (
    <header className="dk-public-header">
      <a href="/" className="dk-public-header-brand">
        <img src="/brand/app-icon-logo.png" alt="" />
        <span className="dk-public-header-brand-name">Dizkarte Admin</span>
      </a>
      <div className="dk-public-header-actions">
        {variant === "landing" ? (
          <LinkButton href="/login" variant="primary" size="sm">
            Admin sign in
          </LinkButton>
        ) : (
          <LinkButton href="/" variant="text" size="sm">
            Back to overview
          </LinkButton>
        )}
      </div>
    </header>
  );
}
