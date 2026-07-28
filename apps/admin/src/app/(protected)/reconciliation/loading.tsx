import { ListPageSkeleton } from "@/components/ui/AsyncState";

export default function Loading() {
  return <ListPageSkeleton columns={4} filters={0} />;
}
