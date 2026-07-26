import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RenameCategoryForm } from "./RenameCategoryForm";
import { CategoryStateControls } from "./CategoryStateControls";
import { ReorderCategoryForm } from "./ReorderCategoryForm";

export const metadata: Metadata = { title: "Category" };

export default async function CategoryDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPER"]);
  const { id } = await params;
  const repository = getAdminRepository();
  const detail = await repository.getCategory(id);

  if (!detail) {
    notFound();
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Categories", href: "/categories" },
          { label: detail.name },
        ]}
      />
      <div className="dk-page-header">
        <div>
          <h1 className="dk-page-title">{detail.name}</h1>
          <p className="dk-page-subtitle">
            <code>{detail.slug}</code> · Order {detail.displayOrder} · {detail.taskCount} task
            {detail.taskCount === 1 ? "" : "s"} · Updated{" "}
            {new Date(detail.updatedAt).toLocaleString("en-PH")}
          </p>
        </div>
        <StatusBadge
          tone={detail.active ? "success" : "neutral"}
          label={detail.active ? "Active" : "Inactive"}
        />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Rename / change slug</h2>
        <RenameCategoryForm categoryId={detail.id} name={detail.name} slug={detail.slug} />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>Display order</h2>
        <ReorderCategoryForm categoryId={detail.id} displayOrder={detail.displayOrder} />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>State</h2>
        {detail.taskCount > 0 && detail.active ? (
          <p className="dk-muted">
            {detail.taskCount} task{detail.taskCount === 1 ? "" : "s"} currently reference this
            category. Deactivating hides it from new task creation without deleting it or the tasks
            that reference it.
          </p>
        ) : null}
        <CategoryStateControls categoryId={detail.id} active={detail.active} />
      </div>

      <div className="dk-card">
        <h2 style={{ marginTop: 0 }}>History</h2>
        <table className="dk-table">
          <caption className="dk-visually-hidden">Category history</caption>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">Actor</th>
              <th scope="col">Capability</th>
              <th scope="col">Reason</th>
              <th scope="col">At</th>
            </tr>
          </thead>
          <tbody>
            {detail.history.map((event, index) => (
              <tr key={index}>
                <td>{event.type}</td>
                <td>{event.fromValue ?? "—"}</td>
                <td>{event.toValue}</td>
                <td>{event.actor}</td>
                <td>{event.capability ?? "—"}</td>
                <td>{event.reason ?? "—"}</td>
                <td>{new Date(event.at).toLocaleString("en-PH")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
