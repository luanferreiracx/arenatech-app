import { PublicOrderView } from "./public-order-view";

interface Props {
  params: Promise<{ publicLink: string }>;
}

export default async function PublicOrderPage({ params }: Props) {
  const { publicLink } = await params;
  return <PublicOrderView publicLink={publicLink} />;
}
