import fs from "fs";

const path = "prisma/schema.prisma";
let s = fs.readFileSync(path, "utf8");

// Remove existing OrganizationMembership block (re-added below User)
s = s.replace(
  /model OrganizationMembership \{[\s\S]*?\n\}\n\nmodel Product/,
  "model Product",
);

const enums = `
enum PlatformRole {
  NONE
  SUPER_ADMIN
  SUPPORT
}

enum AdminAuditAction {
  USER_SIGNUP
  EMAIL_VERIFIED
  PASSWORD_CHANGED
  PASSWORD_RESET_COMPLETED
  ORGANIZATION_INVITATION_CREATED
  ORGANIZATION_INVITATION_ACCEPTED
  ORGANIZATION_MEMBER_ROLE_CHANGED
  BILLING_CONTACT_CHANGED
  TRANSACTIONAL_TEMPLATE_CHANGED
  PLATFORM_ROLE_CHANGED
  WORKSPACE_RENAMED
  LOGIN_SUCCEEDED
  LOGOUT
}

enum TransactionalEmailTemplateKey {
  EMAIL_VERIFICATION
  WELCOME
  PASSWORD_RESET
  PASSWORD_CHANGED
  ORGANIZATION_INVITATION
  INVITATION_ACCEPTED
}

enum TransactionalEmailStatus {
  QUEUED
  SENT
  FAILED
  DELIVERED
  BOUNCED
  COMPLAINED
}
`;

if (!s.includes("enum PlatformRole")) {
  s = s.replace(
    `enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}
`,
    `enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}
` + enums,
  );
}

if (!s.includes("billingProfile")) {
  s = s.replace(
    `  invitations      OrganizationInvitation[]

  @@index([status])`,
    `  invitations                  OrganizationInvitation[]
  billingProfile               OrganizationBillingProfile?
  transactionalEmailEvents     TransactionalEmailEvent[]
  activeForUsers               User[]                     @relation("ActiveOrganization")

  @@index([status])`,
  );
}

const newUser = `model User {
  id                   String       @id @default(cuid())
  authUserId           String?      @unique
  email                String       @unique
  emailNormalized      String       @unique
  firstName            String?
  lastName             String?
  name                 String?
  emailVerifiedAt      DateTime?
  platformRole         PlatformRole @default(NONE)
  activeOrganizationId String?
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  activeOrganization           Organization?            @relation("ActiveOrganization", fields: [activeOrganizationId], references: [id], onDelete: SetNull)
  memberships                  OrganizationMembership[]
  usageOverrides               UserUsageOverride[]
  usageEvents                  UsageEvent[]
  usageQuotaLedgers            UsageQuotaLedger[]
  invitationsSent              OrganizationInvitation[] @relation("InvitedBy")
  companyResearchInitiated     CompanyResearch[]        @relation("ResearchInitiatedBy")
  adminAuditEvents             AdminAuditEvent[]
  transactionalEmailEvents     TransactionalEmailEvent[]

  @@index([platformRole])
  @@index([activeOrganizationId])
}

model OrganizationMembership {
  id               String         @id @default(cuid())
  organizationId   String
  userId           String
  role             MembershipRole @default(MEMBER)
  isBillingContact Boolean        @default(false)
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([organizationId])
  @@index([userId])
  @@index([organizationId, role])
}

model OrganizationBillingProfile {
  id               String   @id @default(cuid())
  organizationId   String   @unique
  billingEmail     String?
  companyLegalName String?
  taxId            String?
  addressLine1     String?
  addressLine2     String?
  city             String?
  region           String?
  postalCode       String?
  countryCode      String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}
`;

s = s.replace(
  /model User \{[\s\S]*?\n\}\n\n\/\/\/ Organization-level usage limits/,
  newUser + "\n/// Organization-level usage limits",
);

const authModels = `
model AuthUser {
  id            String        @id
  name          String
  email         String
  emailVerified Boolean       @default(false)
  image         String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  firstName     String        @default("")
  lastName      String        @default("")
  sessions      AuthSession[]
  accounts      AuthAccount[]

  @@unique([email])
  @@map("auth_user")
}

model AuthSession {
  id        String   @id
  expiresAt DateTime
  token     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  user      AuthUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([token])
  @@index([userId])
  @@map("auth_session")
}

model AuthAccount {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  AuthUser  @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
  @@map("auth_account")
}

model AuthVerification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("auth_verification")
}

model AdminAuditEvent {
  id             String           @id @default(cuid())
  action         AdminAuditAction
  actorUserId    String?
  organizationId String?
  targetUserId   String?
  metadata       Json?
  createdAt      DateTime         @default(now())

  actorUser User? @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([action])
  @@index([actorUserId])
  @@index([organizationId])
  @@index([createdAt])
}

model TransactionalEmailTemplate {
  id              String                        @id @default(cuid())
  templateKey     TransactionalEmailTemplateKey @unique
  displayName     String
  subjectTemplate String
  htmlTemplate    String
  textTemplate    String
  enabled         Boolean                       @default(true)
  version         Int                           @default(1)
  createdAt       DateTime                      @default(now())
  updatedAt       DateTime                      @updatedAt
}

model TransactionalEmailTemplateBaseline {
  id              String                        @id @default(cuid())
  templateKey     TransactionalEmailTemplateKey @unique
  displayName     String
  subjectTemplate String
  htmlTemplate    String
  textTemplate    String
  createdAt       DateTime                      @default(now())
}

model TransactionalEmailEvent {
  id                       String                        @id @default(cuid())
  userId                   String?
  organizationId           String?
  templateKey              TransactionalEmailTemplateKey
  templateVersion          Int?
  recipientEmailNormalized String
  provider                 String
  providerMessageId        String?
  status                   TransactionalEmailStatus
  failureCategory          String?
  retryCount               Int                           @default(0)
  idempotencyKey           String?
  createdAt                DateTime                      @default(now())
  sentAt                   DateTime?

  user         User?         @relation(fields: [userId], references: [id], onDelete: SetNull)
  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)

  @@unique([idempotencyKey])
  @@index([templateKey])
  @@index([recipientEmailNormalized])
  @@index([organizationId])
  @@index([userId])
  @@index([createdAt])
  @@index([status])
}

model RateLimitBucket {
  id          String   @id @default(cuid())
  bucketKey   String
  windowStart DateTime
  count       Int      @default(0)
  updatedAt   DateTime @updatedAt

  @@unique([bucketKey, windowStart])
  @@index([bucketKey])
}
`;

if (!s.includes("model AuthUser")) {
  s = s.trimEnd() + "\n" + authModels + "\n";
}

fs.writeFileSync(path, s);
console.log("ok", {
  PlatformRole: s.includes("enum PlatformRole"),
  AuthUser: s.includes("model AuthUser"),
  emailNormalized: s.includes("emailNormalized"),
  isBillingContact: s.includes("isBillingContact"),
  membershipCount: (s.match(/model OrganizationMembership/g) || []).length,
});
