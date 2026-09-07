"use client";

import { useEffect, useId, useRef, useState, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { CreateCategoryForm } from "./CreateCategoryForm";

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function CreateCategoryModal() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const modal = (
    <div
      className="dk-overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <div
        className="dk-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
        style={{ maxWidth: 520 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <div>
            <h2 id={titleId} className="dk-dialog-title" style={{ margin: 0 }}>
              Add category
            </h2>
            <p
              className="dk-muted"
              style={{ margin: "4px 0 0", fontSize: 13 }}
            >
              Add a new service category to the marketplace catalog.
            </p>
          </div>
          <button
            type="button"
            className="dk-dialog-close-icon-btn"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <XIcon width={16} height={16} />
          </button>
        </div>

        <CreateCategoryForm
          onSuccess={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </div>
    </div>
  );

  return (
    <>
      <Button
        variant="primary"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 600,
        }}
      >
        <PlusIcon width={15} height={15} />
        <span>Add category</span>
      </Button>
      {mounted && open ? createPortal(modal, document.body) : null}
    </>
  );
}
