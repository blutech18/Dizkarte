"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  variant = "button",
}: {
  readonly text: string;
  readonly label?: string;
  readonly variant?: "button" | "icon";
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is blocked
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className="dk-copy-icon-btn"
        style={{
          background: "transparent",
          border: "none",
          padding: "2px 4px",
          margin: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: copied ? "var(--dk-success)" : "var(--dk-textSecondary)",
          borderRadius: "var(--dk-radius-sm)",
          transition: "color var(--dk-transition-fast)",
          flexShrink: 0,
          lineHeight: 1,
          verticalAlign: "middle",
        }}
        title={copied ? "Copied!" : "Copy " + label}
        aria-label={copied ? "Copied" : "Copy " + label}
      >
        {copied ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="dk-btn dk-btn-secondary dk-btn-sm"
      style={{
        padding: "2px 8px",
        fontSize: 11.5,
        minHeight: 24,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        fontWeight: 500,
      }}
      title={"Copy " + label}
      aria-label={"Copy " + label}
    >
      {copied ? (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ color: "var(--dk-success)", fontWeight: 600 }}>Copied</span>
        </>
      ) : (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
