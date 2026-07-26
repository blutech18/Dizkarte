"use client";

import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { setCategoryActiveAction } from "../actions";

export function CategoryStateControls({
  categoryId,
  active,
}: {
  readonly categoryId: string;
  readonly active: boolean;
}) {
  const router = useRouter();

  async function setActive(next: boolean, reason: string) {
    const result = await setCategoryActiveAction({ categoryId, active: next, reason });
    if (result.ok) router.refresh();
    return result;
  }

  return active ? (
    <ConfirmDialog
      triggerLabel="Deactivate"
      triggerVariant="destructive"
      variant="destructive"
      title="Deactivate category"
      description="Deactivating hides this category from new task creation. It is never deleted, and tasks that already reference it are unaffected."
      confirmLabel="Deactivate"
      requireReason
      onConfirm={(reason) => setActive(false, reason)}
    />
  ) : (
    <ConfirmDialog
      triggerLabel="Activate"
      triggerVariant="primary"
      title="Activate category"
      description="The category becomes available for new task creation again."
      confirmLabel="Activate"
      requireReason
      onConfirm={(reason) => setActive(true, reason)}
    />
  );
}
