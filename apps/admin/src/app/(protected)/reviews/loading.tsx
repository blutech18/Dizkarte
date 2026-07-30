import { ListPageSkeleton } from "@/components/ui/AsyncState";

export default function Loading() {
  return <ListPageSkeleton columns={6} filters={0} />;
}
