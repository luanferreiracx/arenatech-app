import { LoadingState } from "@/components/domain/loading-state";

export default function CustomersLoading() {
  return <LoadingState variant="table" rows={8} />;
}
