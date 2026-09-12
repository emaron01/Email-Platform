/**
 * Initial published EULA body (console-editable after seed).
 */
import "server-only";

/** Placeholder replaced with a locale date when seeding. */
export const EULA_SEED_DATE_PLACEHOLDER = "[DATE]";

export const INITIAL_EULA_CONTENT = `END USER LICENSE AGREEMENT AND TERMS OF SERVICE

Last updated: ${EULA_SEED_DATE_PLACEHOLDER}

1. ACCEPTANCE OF TERMS
By creating an account and checking the acceptance box, you agree
to be bound by these Terms of Service and End User License Agreement
("Agreement"). If you do not agree, do not use the service.

2. LICENSE
SalesForecaster.io grants you a limited, non-exclusive,
non-transferable license to access and use the platform for your
internal business purposes only. You may not sublicense, resell,
reverse engineer, decompile, or attempt to derive the source code
of the platform.

3. PROHIBITED USE
You may not use the platform to: violate any applicable law;
infringe third-party rights; transmit malware or harmful code;
attempt to gain unauthorized access to any system or data;
resell or redistribute the service without written authorization.

4. BILLING AND SUBSCRIPTIONS
All billing is processed and payment information is maintained
exclusively by Stripe, Inc., a third-party payment processor.
SalesForecaster.io does not store your payment card information.

Subscriptions are billed on a recurring basis (monthly or annual)
per the plan selected at checkout.

"Cancel anytime" means your subscription will not renew at the
end of the current billing cycle. Cancellation takes effect at
the end of the period you have already paid for. No prorated
refunds are issued for partial billing periods.

Free trials: if you cancel before your trial ends, you will not
be charged. If you do not cancel, your trial converts to a paid
subscription and your payment method on file will be charged.

5. DATA AND PRIVACY
You retain ownership of your data. SalesForecaster.io will not
sell your data to third parties. We may use aggregated, anonymized
data to improve the platform. Please review our Privacy Policy
for full details.

6. INTELLECTUAL PROPERTY
The platform, including all software, designs, and content, is
the exclusive property of SalesForecaster.io. Nothing in this
Agreement transfers any intellectual property rights to you.

7. DISCLAIMER OF WARRANTIES
The platform is provided "as is" without warranties of any kind,
express or implied, including but not limited to merchantability,
fitness for a particular purpose, or non-infringement.

8. LIMITATION OF LIABILITY
To the maximum extent permitted by law, SalesForecaster.io shall
not be liable for any indirect, incidental, special, consequential,
or punitive damages, or any loss of profits or revenue, whether
incurred directly or indirectly.

9. GOVERNING LAW
This Agreement is governed by the laws of the Commonwealth of
Pennsylvania, United States, without regard to conflict of law
principles.

10. CHANGES TO TERMS
We may update these terms from time to time. When we do, we will
publish a new version and require your re-acceptance before you
can continue using the platform.

11. CONTACT
For questions about these terms, contact: erik@salesforecaster.io`;

export function fillEulaSeedDate(
  content: string,
  at: Date = new Date(),
): string {
  const formatted = at.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return content.split(EULA_SEED_DATE_PLACEHOLDER).join(formatted);
}
