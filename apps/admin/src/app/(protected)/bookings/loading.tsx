import { ListPageSkeleton } from "@/components/ui/AsyncState";

export default function Loading() {
  return <ListPageSkeleton columns={5} filters={0} />;
}
