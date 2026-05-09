import { LoadingState } from "@/components/domain/loading-state";

export default function ServiceOrdersLoading() {
  return <LoadingState variant="table" rows={8} />;
}
