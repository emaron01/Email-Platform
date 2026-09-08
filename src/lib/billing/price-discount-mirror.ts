/**
 * Pure helpers to mirror Stripe Price + Discount onto OrganizationBillingProfile.
 * Amounts come from the subscription's Price/coupons — never from env list price.
 */
export type MirroredCoupon = {
  id: string;
  percentOff: number | null;
  amountOffCents: number | null;
};

export type MirroredPriceDiscount = {
  stripePriceId: string | null;
  stripeProductId: string | null;
  stripePriceUnitAmountCents: number | null;
  stripePriceCurrency: string | null;
  stripePriceInterval: string | null;
  stripeDiscountPercentOff: number | null;
  stripeDiscountAmountOffCents: number | null;
  stripeCouponId: string | null;
  /** List unit amount after applying mirrored coupons (sequential %). */
  stripeEffectiveUnitAmountCents: number | null;
};

export function applyCouponsToUnitAmount(
  listUnitAmountCents: number,
  coupons: ReadonlyArray<MirroredCoupon>,
): number {
  let amount = listUnitAmountCents;
  for (const coupon of coupons) {
    if (coupon.percentOff != null && coupon.percentOff > 0) {
      amount = Math.round((amount * (100 - coupon.percentOff)) / 100);
    }
    if (coupon.amountOffCents != null && coupon.amountOffCents > 0) {
      amount = Math.max(0, amount - coupon.amountOffCents);
    }
  }
  return amount;
}

export function summarizeCoupons(
  coupons: ReadonlyArray<MirroredCoupon>,
): Pick<
  MirroredPriceDiscount,
  | "stripeDiscountPercentOff"
  | "stripeDiscountAmountOffCents"
  | "stripeCouponId"
> {
  if (coupons.length === 0) {
    return {
      stripeDiscountPercentOff: null,
      stripeDiscountAmountOffCents: null,
      stripeCouponId: null,
    };
  }
  let percent = 0;
  let amountOff = 0;
  let sawPercent = false;
  let sawAmount = false;
  for (const coupon of coupons) {
    if (coupon.percentOff != null && coupon.percentOff > 0) {
      percent += coupon.percentOff;
      sawPercent = true;
    }
    if (coupon.amountOffCents != null && coupon.amountOffCents > 0) {
      amountOff += coupon.amountOffCents;
      sawAmount = true;
    }
  }
  return {
    stripeDiscountPercentOff: sawPercent ? percent : null,
    stripeDiscountAmountOffCents: sawAmount ? amountOff : null,
    stripeCouponId: coupons[0]?.id ?? null,
  };
}

export function buildMirroredPriceDiscount(input: {
  priceId: string | null;
  productId: string | null;
  unitAmountCents: number | null;
  currency: string | null;
  interval: string | null;
  coupons: ReadonlyArray<MirroredCoupon>;
}): MirroredPriceDiscount {
  const summary = summarizeCoupons(input.coupons);
  const list = input.unitAmountCents;
  return {
    stripePriceId: input.priceId,
    stripeProductId: input.productId,
    stripePriceUnitAmountCents: list,
    stripePriceCurrency: input.currency,
    stripePriceInterval: input.interval,
    ...summary,
    stripeEffectiveUnitAmountCents:
      list == null
        ? null
        : applyCouponsToUnitAmount(list, input.coupons),
  };
}

/** True when any coupon reduces the amount below list (or amount_off present). */
export function hasActiveDiscount(mirror: {
  stripeDiscountPercentOff: number | null;
  stripeDiscountAmountOffCents: number | null;
  stripeEffectiveUnitAmountCents: number | null;
  stripePriceUnitAmountCents: number | null;
}): boolean {
  if (
    mirror.stripeDiscountPercentOff != null &&
    mirror.stripeDiscountPercentOff > 0
  ) {
    return true;
  }
  if (
    mirror.stripeDiscountAmountOffCents != null &&
    mirror.stripeDiscountAmountOffCents > 0
  ) {
    return true;
  }
  if (
    mirror.stripeEffectiveUnitAmountCents != null &&
    mirror.stripePriceUnitAmountCents != null &&
    mirror.stripeEffectiveUnitAmountCents < mirror.stripePriceUnitAmountCents
  ) {
    return true;
  }
  return false;
}
