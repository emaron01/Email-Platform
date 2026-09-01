import type { ProductCampaignReadiness } from "@/lib/workflow/product-campaign-readiness";

export function formatProductSetupClause(
  productName: string,
  readiness: ProductCampaignReadiness,
): string {
  if (readiness.ready) return `${productName} ready`;

  const blocker = readiness.blockers[0] ?? "needs setup";
  if (blocker === "Needs an ICP with criteria") {
    return `${productName} needs an ICP`;
  }
  if (blocker === "Needs at least one saved persona") {
    return `${productName} needs a persona`;
  }
  if (
    blocker === "Product needs review and approval" ||
    blocker === "Product is still a draft" ||
    blocker === "Product is not approved"
  ) {
    return `${productName} needs approval`;
  }
  if (blocker === "Product setup not started") {
    return `${productName} needs product setup`;
  }
  return `${productName} needs setup`;
}

export function buildHomeSetupLine(input: {
  products: Array<{ name: string; readiness: ProductCampaignReadiness }>;
  totalIcps: number;
  totalPersonas: number;
}): { text: string; href: string | null } {
  if (input.products.length === 0) {
    return {
      text: "No products yet. Add a product to start setup.",
      href: "/setup/new",
    };
  }

  const allReady = input.products.every((product) => product.readiness.ready);
  if (allReady) {
    const productCount = input.products.length;
    const icpCount = input.totalIcps;
    const personaCount = input.totalPersonas;
    return {
      text: `Setup complete · ${productCount} product${productCount === 1 ? "" : "s"} · ${icpCount} ICP${icpCount === 1 ? "" : "s"} · ${personaCount} persona${personaCount === 1 ? "" : "s"}`,
      href: "/products",
    };
  }

  return {
    text: input.products
      .map((product) =>
        formatProductSetupClause(product.name, product.readiness),
      )
      .join(" · "),
    href: "/products",
  };
}
