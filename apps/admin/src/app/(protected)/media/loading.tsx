import { ListPageSkeleton } from "@/components/ui/AsyncState";

export default function Loading() {
  return <ListPageSkeleton columns={3} filters={1} />;
}
