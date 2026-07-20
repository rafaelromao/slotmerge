import { redirect } from "next/navigation";

export default async function SearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/searches/${id}/results`);
}
