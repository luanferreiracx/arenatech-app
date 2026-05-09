import { LoadingState } from "@/components/domain/loading-state";

export default function StockLoading() {
  return <LoadingState variant="table" rows={8} />;
}
