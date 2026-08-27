/**
 * Platform-created orgs + member management (requires DATABASE_URL).
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createPlatformOrganization } from "@/lib/platform/orgs";
import {
  changeOrganizationMemberRole,
  createIndividualWorkspace,
  removeOrganizationMember,
} from "@/lib/org/signup";
import { FREE_BILLING_DEFAULTS } from "@/lib/billing/billing-state";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "createPlatformOrganization",
  { timeout: 60_000 },
  () => {
    it("creates a free ENTERPRISE org and OWNER invite", async () => {
      const stamp = Date.now().toString(36);
      const admin = await createIndividualWorkspace({
        email: `sa-create-${stamp}@example.com`,
        firstName: "Super",
        lastName: "Admin",
      });
      await prisma.user.update({
        where: { id: admin.user.id },
        data: { platformRole: "SUPER_ADMIN", emailVerifiedAt: new Date() },
      });

      const ownerEmail = `owner-${stamp}@example.com`;
      const created = await createPlatformOrganization({
        actorUserId: admin.user.id,
        name: `Friends Co ${stamp}`,
        accountType: "ENTERPRISE",
        ownerEmail,
      });

      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: created.organizationId },
        include: {
          billingProfile: true,
          usagePolicy: true,
          invitations: true,
          memberships: true,
        },
      });

      expect(org.accountType).toBe("ENTERPRISE");
      expect(org.status).toBe("ACTIVE");
      expect(org.memberships).toHaveLength(0);
      expect(org.billingProfile?.planCode).toBe(FREE_BILLING_DEFAULTS.planCode);
      expect(org.billingProfile?.billingStatus).toBe("FREE");
      expect(org.billingProfile?.stripeCustomerId).toBeNull();
      expect(org.usagePolicy?.activeResearchedCompanyLimit).toBe(100);
      expect(org.invitations).toHaveLength(1);
      expect(org.invitations[0]?.email).toBe(ownerEmail);
      expect(org.invitations[0]?.role).toBe("OWNER");

      const audit = await prisma.adminAuditEvent.findFirst({
        where: {
          action: "PLATFORM_ORGANIZATION_CREATED",
          organizationId: org.id,
        },
      });
      expect(audit?.actorUserId).toBe(admin.user.id);
    });

    it("allows OWNER/ADMIN to change and remove members", async () => {
      const stamp = Date.now().toString(36);
      const owner = await createIndividualWorkspace({
        email: `owner-mgmt-${stamp}@example.com`,
        firstName: "Owner",
        lastName: "User",
      });
      await prisma.user.update({
        where: { id: owner.user.id },
        data: { emailVerifiedAt: new Date() },
      });

      const member = await createIndividualWorkspace({
        email: `member-mgmt-${stamp}@example.com`,
        firstName: "Member",
        lastName: "User",
      });
      await prisma.organizationMembership.create({
        data: {
          organizationId: owner.organization.id,
          userId: member.user.id,
          role: "MEMBER",
        },
      });

      await changeOrganizationMemberRole({
        organizationId: owner.organization.id,
        actorUserId: owner.user.id,
        targetUserId: member.user.id,
        role: "ADMIN",
      });
      const elevated = await prisma.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: owner.organization.id,
            userId: member.user.id,
          },
        },
      });
      expect(elevated.role).toBe("ADMIN");

      await removeOrganizationMember({
        organizationId: owner.organization.id,
        actorUserId: owner.user.id,
        targetUserId: member.user.id,
      });
      const gone = await prisma.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: owner.organization.id,
            userId: member.user.id,
          },
        },
      });
      expect(gone).toBeNull();
    });
  },
);
