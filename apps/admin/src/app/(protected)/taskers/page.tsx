import type { Metadata } from "next";
import { requirePageCapability } from "@/lib/guard";
import { getAdminRepository } from "@/lib/repository";
import { Breadcrumbs } from "@/components/ui/Field";
import { PageSection, Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/AsyncState";
import { RecordList, type ColumnDef } from "@/components/ui/RecordList";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import type { TaskerApplicationRow } from "@/lib/repository/types";

export const metadata: Metadata = { title: "Tasker applications" };

const PAGE_SIZE = 20;

function tone(status: string): BadgeTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
    case "SUSPENDED":
      return "error";
    case "RESUBMISSION_REQUIRED":
      return "warning";
    case "IN_REVIEW":
      return "info";
    default:
      return "neutral";
  }
}

export default async function TaskerApplicationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePageCapability(["ADMIN_SUPPORT"]);
  const { status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const repository = getAdminRepository();
  const result = await repository.listTaskerApplications({
    page,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const columns: ReadonlyArray<ColumnDef<TaskerApplicationRow>> = [
    {
      key: "user",
      header: "Applicant",
      render: (row) => <a href={`/taskers/${row.id}`}>{row.userDisplayName}</a>,
    },
    { key: "specialties", header: "Specialties", render: (row) => row.specialties.join(", ") },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge tone={tone(row.status)} label={row.status.replace(/_/g, " ")} />
      ),
    },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (row) => new Date(row.submittedAt).toLocaleString("en-PH"),
    },
  ];

  function hrefFor(nextPage: number): string {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", String(nextPage));
    return `/taskers?${params.toString()}`;
  }

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tasker applications" }]}
      />
      <PageSection
        title="Tasker applications"
        subtitle="Application approval is separate from identity verification and is revocable/suspendable at any time."
      >
        {result.items.length === 0 ? (
          <EmptyState
            title="No applications"
            description="There are no applications matching this filter."
          />
        ) : (
          <>
            <RecordList
              rows={result.items}
              columns={columns}
              getRowKey={(row) => row.id}
              caption="Tasker applications"
              cardTitle={(row) => row.userDisplayName}
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
