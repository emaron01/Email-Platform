import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function LegacyCustomPersonaPage({ params }: PageProps) {
  const { productId } = await params;
  redirect(`/setup/${productId}/personas/new`);
}
