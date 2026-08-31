import type { Metadata } from "next";
import { Suspense } from "react";
import { formatPhp } from "@dizkarte/domain";
import { AppLink } from "@/components/ui/AppLink";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState, SkeletonFilterRow, TableRegionSkeleton } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QueueFilters } from "@/components/ui/QueueFilters";
import type { TaskRow } from "@/lib/repository/types";
import { TASK_STATUS_OPTIONS, taskStatusLabel, taskStatusTone } from "./status";
import { TaskRowActions } from "./TaskRowActions";

export const metadata: Metadata = { title: "Tasks & media" };

const PAGE_SIZE = 20;

/**
 * Tasks & media queue.
 *
 * Breadcrumbs and heading need no query, so they paint immediately. The two
 * reads behind this page are independent, so each streams in behind its own
 * boundary: the filter row, whose category options come from the live catalog,
 * and the results table. Splitting them keeps a slow table from holding back the
 * filters, and the catalog read from waiting on the table.
 *
 * Only the table boundary is keyed by the applied filters and page, so changing
 * a filter re-shows its skeleton rather than leaving the previous rows on screen;
 * the filter row's own data does not depend on the filters, so it stays put.
 */
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
  const isValidStatus = status && (TASK_STATUS_OPTIONS as ReadonlyArray<string>).includes(status);

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tasks & media" }]}
      />
      <PageSection
        title="Tasks & media"
        subtitle="Public-safe fields only. Exact address and private coordinates are never shown here."
      >
        <Suspense fallback={<SkeletonFilterRow count={4} />}>
          <TasksFilters q={q} status={status} category={category} city={city} />
        </Suspense>

        <Suspense
          key={`${isValidStatus ? status : ""}|${q ?? ""}|${category ?? ""}|${city ?? ""}|${page}`}
          fallback={<TableRegionSkeleton columns={5} />}
        >
          <TasksTable page={page} q={q} status={status} category={category} city={city} />
        </Suspense>
      </PageSection>
    </>
  );
}

async function TasksFilters({
  q,
  status,
  category,
  city,
}: {
  readonly q: string | undefined;
  readonly status: string | undefined;
  readonly category: string | undefined;
  readonly city: string | undefined;
}) {
  const isValidStatus = status && (TASK_STATUS_OPTIONS as ReadonlyArray<string>).includes(status);
  // The category picker is populated from the real catalog rather than a
  // hardcoded list, so it always matches what Clients can actually choose.
  const categories = await getAdminRepository().listCategories({ page: 1, pageSize: 100 });

  return (
    <QueueFilters
      basePath="/tasks"
      search={{
        label: "Search task titles and descriptions",
        placeholder: "Search title or description",
        value: q?.trim() ?? "",
      }}
      selects={[
        {
          name: "category",
          label: "Filter by category",
          allLabel: "All categories",
          value: category,
          options: categories.items.map((option) => ({
            value: option.id,
            label: option.name,
          })),
        },
        {
          name: "status",
          label: "Filter by task status",
          allLabel: "All statuses",
          value: isValidStatus ? status : undefined,
          options: TASK_STATUS_OPTIONS.map((option) => ({
            value: option,
            label: taskStatusLabel(option),
          })),
        },
      ]}
      texts={[
        {
          name: "city",
          label: "Filter by PSGC city code",
          placeholder: "City code",
          value: city?.trim() ?? "",
          inputMode: "numeric",
        },
      ]}
    />
  );
}

async function TasksTable({
  page,
  q,
  status,
  category,
  city,
}: {
  readonly page: number;
  readonly q: string | undefined;
  readonly status: string | undefined;
  readonly category: string | undefined;
  readonly city: string | undefined;
}) {
  const isValidStatus = status && (TASK_STATUS_OPTIONS as ReadonlyArray<string>).includes(status);
  const result = await getAdminRepository().listTasks({
    page,
    pageSize: PAGE_SIZE,
    ...(isValidStatus ? { status } : {}),
    ...(q ? { query: q } : {}),
    ...(category ? { categoryId: category } : {}),
    ...(city ? { cityCode: city } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<TaskRow>> = [
    {
      key: "title",
      header: "Title",
      render: (row) => (
        <>
          <AppLink href={`/tasks/${row.id}`}>{row.title}</AppLink>{" "}
          {row.flagged ? <StatusBadge tone="warning" label="Flagged" /> : null}
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={taskStatusTone(row.status)} label={taskStatusLabel(row.status)} />
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

  if (result.items.length === 0) {
    return <EmptyState title="No tasks" description="There are no tasks matching this filter." />;
  }

  return (
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
  );
}

