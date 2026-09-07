import { ListPageSkeleton } from "@/components/ui/AsyncState";

export default function Loading() {
  return <ListPageSkeleton columns={7} filters={3} />;
}
