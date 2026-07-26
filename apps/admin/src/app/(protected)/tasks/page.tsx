import type { Metadata } from "next";
import { formatPhp } from "@dizkarte/domain";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TaskRow } from "@/lib/repository/types";
import { TaskRowActions } from "./TaskRowActions";

export const metadata: Metadata = { title: "Tasks & media" };

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  "DRAFT",
  "OPEN",
  "BOOKING_PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETION_REQUESTED",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "DISPUTED",
  "REMOVED",
] as const;

export default async function TasksPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    status?: string;
    q?: string;
    category?: string;
    city?: string;
    page?: string;
  }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, q, category, city, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const isValidStatus = status && (STATUS_OPTIONS as ReadonlyArray<string>).includes(status);
  const repository = getAdminRepository();

  // The category picker is populated from the real catalog rather than a
  // hardcoded list, so it always matches what Clients can actually choose.
  const [result, categories] = await Promise.all([
    repository.listTasks({
      page,
      pageSize: PAGE_SIZE,
      ...(isValidStatus ? { status } : {}),
      ...(q ? { query: q } : {}),
      ...(category ? { categoryId: category } : {}),
      ...(city ? { cityCode: city } : {}),
    }),
    repository.listCategories({ page: 1, pageSize: 100 }),
  ]);

  const columns: ReadonlyArray<ColumnDef<TaskRow>> = [
    {
      key: "title",
      header: "Title",
      render: (row) => (
        <>
          {row.title} {row.flagged ? <StatusBadge tone="warning" label="Flagged" /> : null}
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={row.status === "REMOVED" ? "error" : "brand"} label={row.status} />
      ),
    },
    { key: "budget", header: "Budget", render: (row) => formatPhp(row.budgetCentavos) },
    { key: "city", header: "City code", render: (row) => row.cityCode },
    {
      key: "actions",
      header: "Actions",
      showInCard: false,
      render: (row) => <TaskRowActions taskId={row.id} status={row.status} />,
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (isValidStatus) params.set("status", status);
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (city) params.set("city", city);
    params.set("page", String(nextPage));
    return `/tasks?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tasks & media" }]}
      />
      <PageSection
        title="Tasks & media"
        subtitle="Public-safe fields only. Exact address and private coordinates are never shown here."
      >
        <form method="get" className="dk-row" style={{ marginBottom: 16 }} role="search">
          <label className="dk-visually-hidden" htmlFor="q">
            Search task titles and descriptions
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            className="dk-input"
            placeholder="Search title or description"
          />
          <label className="dk-visually-hidden" htmlFor="category">
            Category
          </label>
          <select id="category" name="category" className="dk-input" defaultValue={category ?? ""}>
            <option value="">All categories</option>
            {categories.items.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <label className="dk-visually-hidden" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="dk-input" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label className="dk-visually-hidden" htmlFor="city">
            City code
          </label>
          <input
            id="city"
            name="city"
            defaultValue={city ?? ""}
            className="dk-input"
            placeholder="City code"
            inputMode="numeric"
          />
          <button type="submit" className="dk-btn dk-btn-secondary dk-btn-sm">
            Filter
          </button>
        </form>

        {result.items.length === 0 ? (
          <EmptyState title="No tasks" description="There are no tasks matching this filter." />
        ) : (
          <>
            <RecordList
              rows={result.items}
              columns={columns}
              getRowKey={(row) => row.id}
              caption="Tasks"
              cardTitle={(row) => row.title}
            />
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              hasMore={result.hasMore}
              makeHref={hrefFor}
            />
          </>
        )}
      </PageSection>
    </>
  );
}
