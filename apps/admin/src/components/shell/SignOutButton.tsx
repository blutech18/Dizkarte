"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/app/(protected)/actions";
import { Button } from "@/components/ui/Button";
import { LogOutIcon } from "./icons";

export function SignOutButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open]);

  function handleSignOut() {
    startTransition(async () => {
      await signOutAction();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="dk-topbar-logout-btn"
        aria-label="Logout"
        title="Logout"
        onClick={() => setOpen(true)}
      >
        <LogOutIcon width={18} height={18} aria-hidden="true" />
      </button>

      {open && mounted
        ? createPortal(
            <div
              className="dk-overlay"
              role="presentation"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget && !pending) setOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !pending) setOpen(false);
              }}
            >
              <div
                className="dk-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                ref={dialogRef}
                tabIndex={-1}
              >
                <h2 id={titleId} className="dk-dialog-title">
                  Log out
                </h2>
                <p id={descId} className="dk-dialog-body">
                  Are you sure you want to log out of your session?
                </p>
                <div className="dk-dialog-actions">
                  <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleSignOut} loading={pending}>
                    {pending ? "Logging out…" : "Log out"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
