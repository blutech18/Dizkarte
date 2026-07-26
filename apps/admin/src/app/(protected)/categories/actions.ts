"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";

export async function createCategoryAction(input: {
  name: string;
  slug: string;
}): Promise<{ ok: boolean; message?: string; categoryId?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPER"]);
  const repository = getAdminRepository();
  const result = await repository.createCategory({
    name: input.name,
    slug: input.slug,
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) revalidatePath("/categories");
  return result;
}

export async function renameCategoryAction(input: {
  categoryId: string;
  name: string;
  slug: string;
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPER"]);
  const repository = getAdminRepository();
  const result = await repository.renameCategory({
    categoryId: input.categoryId,
    name: input.name,
    slug: input.slug,
    reason: input.reason,
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) {
    revalidatePath("/categories");
    revalidatePath(`/categories/${input.categoryId}`);
  }
  return result;
}

export async function setCategoryActiveAction(input: {
  categoryId: string;
  active: boolean;
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPER"]);
  const repository = getAdminRepository();
  const result = await repository.setCategoryActive({
    categoryId: input.categoryId,
    active: input.active,
    reason: input.reason,
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) {
    revalidatePath("/categories");
    revalidatePath(`/categories/${input.categoryId}`);
  }
  return result;
}

export async function reorderCategoryAction(input: {
  categoryId: string;
  displayOrder: number;
  reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const session = await requireAdminSession(["ADMIN_SUPER"]);
  const repository = getAdminRepository();
  const result = await repository.reorderCategory({
    categoryId: input.categoryId,
    displayOrder: input.displayOrder,
    reason: input.reason,
    actor: session.email,
    capability: session.capabilities[0] ?? null,
  });
  if (result.ok) {
    revalidatePath("/categories");
    revalidatePath(`/categories/${input.categoryId}`);
  }
  return result;
}
