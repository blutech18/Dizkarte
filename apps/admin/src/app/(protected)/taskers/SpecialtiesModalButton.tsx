"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";

export type SpecialtiesModalButtonProps = {
  readonly specialties: ReadonlyArray<string>;
  readonly applicantName: string;
};

export function SpecialtiesModalButton({
  specialties,
  applicantName,
}: SpecialtiesModalButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open]);

  if (specialties.length === 0) {
    return <span className="dk-muted">None listed</span>;
  }

  const countLabel = `${specialties.length} ${specialties.length === 1 ? "Specialty" : "Specialties"}`;

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
        className="dk-dialog dk-specialties-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="dk-specialties-dialog-header">
          <div>
            <h2 id={titleId} className="dk-dialog-title" style={{ marginBottom: 4 }}>
              Specialties ({specialties.length})
            </h2>
            <p className="dk-dialog-body" style={{ margin: 0 }}>
              Declared by <strong>{applicantName}</strong> in their Tasker application.
            </p>
          </div>
          <button
            type="button"
            className="dk-dialog-close-icon-btn"
            onClick={() => setOpen(false)}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="dk-specialties-list">
          {specialties.map((specialty, index) => (
            <div key={specialty} className="dk-specialties-list-item">
              <div className="dk-specialties-item-main">
                <span className="dk-specialties-item-num">{index + 1}.</span>
                <span className="dk-specialties-item-name">{specialty}</span>
              </div>
              <span className="dk-specialties-item-check" aria-hidden="true" title="Declared specialty">
                ✓
              </span>
            </div>
          ))}
        </div>

        <div className="dk-dialog-actions">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="dk-specialties-btn"
        onClick={() => setOpen(true)}
        title={`View ${countLabel} for ${applicantName}`}
        aria-label={`View ${countLabel} for ${applicantName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="dk-specialties-count">{specialties.length}</span>
        <span>{specialties.length === 1 ? "Specialty" : "Specialties"}</span>
      </button>

      {open && mounted ? createPortal(modal, document.body) : null}
    </>
  );
}
