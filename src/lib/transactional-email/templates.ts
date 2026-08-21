import type { TransactionalEmailTemplateKey } from "@prisma/client";

export type TemplateVariableMap = Record<string, string>;

const COMMON = ["firstName", "supportEmail", "appName"] as const;

export const TEMPLATE_VARIABLE_ALLOWLIST: Record<
  TransactionalEmailTemplateKey,
  readonly string[]
> = {
  EMAIL_VERIFICATION: [...COMMON, "verificationUrl", "expirationTime"],
  WELCOME: [...COMMON, "workspaceName"],
  PASSWORD_RESET: [...COMMON, "resetUrl", "expirationTime"],
  PASSWORD_CHANGED: [...COMMON, "workspaceName"],
  ORGANIZATION_INVITATION: [
    ...COMMON,
    "workspaceName",
    "inviterName",
    "invitedEmail",
    "invitationUrl",
    "expirationTime",
  ],
  INVITATION_ACCEPTED: [
    ...COMMON,
    "workspaceName",
    "inviterName",
    "invitedEmail",
  ],
};

export const TEMPLATE_REQUIRED_VARIABLES: Record<
  TransactionalEmailTemplateKey,
  readonly string[]
> = {
  EMAIL_VERIFICATION: ["verificationUrl"],
  WELCOME: ["firstName", "workspaceName"],
  PASSWORD_RESET: ["resetUrl"],
  PASSWORD_CHANGED: ["firstName"],
  ORGANIZATION_INVITATION: ["invitationUrl", "workspaceName", "invitedEmail"],
  INVITATION_ACCEPTED: ["workspaceName", "invitedEmail"],
};

export const BASELINE_TEMPLATES: Record<
  TransactionalEmailTemplateKey,
  {
    displayName: string;
    subjectTemplate: string;
    htmlTemplate: string;
    textTemplate: string;
  }
> = {
  EMAIL_VERIFICATION: {
    displayName: "Email verification",
    subjectTemplate: "Verify your {{appName}} email",
    htmlTemplate:
      "<p>Hi {{firstName}},</p><p>Please verify your email: <a href=\"{{verificationUrl}}\">Verify email</a></p><p>This link expires {{expirationTime}}.</p><p>— {{appName}}</p>",
    textTemplate:
      "Hi {{firstName}},\n\nVerify your email: {{verificationUrl}}\nExpires {{expirationTime}}.\n\n— {{appName}}",
  },
  WELCOME: {
    displayName: "Welcome",
    subjectTemplate: "Welcome to {{appName}}",
    htmlTemplate:
      "<p>Hi {{firstName}},</p><p>Your workspace <strong>{{workspaceName}}</strong> is ready.</p><p>— {{appName}}</p>",
    textTemplate:
      "Hi {{firstName}},\n\nYour workspace {{workspaceName}} is ready.\n\n— {{appName}}",
  },
  PASSWORD_RESET: {
    displayName: "Password reset",
    subjectTemplate: "Reset your {{appName}} password",
    htmlTemplate:
      "<p>Hi {{firstName}},</p><p><a href=\"{{resetUrl}}\">Reset your password</a></p><p>This link expires {{expirationTime}}.</p><p>If you did not request this, ignore this email.</p>",
    textTemplate:
      "Hi {{firstName}},\n\nReset your password: {{resetUrl}}\nExpires {{expirationTime}}.\n\nIf you did not request this, ignore this email.",
  },
  PASSWORD_CHANGED: {
    displayName: "Password changed",
    subjectTemplate: "Your {{appName}} password was changed",
    htmlTemplate:
      "<p>Hi {{firstName}},</p><p>Your password for {{workspaceName}} was changed.</p><p>If this was not you, contact {{supportEmail}}.</p>",
    textTemplate:
      "Hi {{firstName}},\n\nYour password for {{workspaceName}} was changed.\nIf this was not you, contact {{supportEmail}}.",
  },
  ORGANIZATION_INVITATION: {
    displayName: "Organization invitation",
    subjectTemplate: "You're invited to {{workspaceName}}",
    htmlTemplate:
      "<p>Hi,</p><p>{{inviterName}} invited {{invitedEmail}} to join <strong>{{workspaceName}}</strong>.</p><p><a href=\"{{invitationUrl}}\">Accept invitation</a></p><p>Expires {{expirationTime}}.</p>",
    textTemplate:
      "{{inviterName}} invited {{invitedEmail}} to {{workspaceName}}.\nAccept: {{invitationUrl}}\nExpires {{expirationTime}}.",
  },
  INVITATION_ACCEPTED: {
    displayName: "Invitation accepted",
    subjectTemplate: "{{invitedEmail}} joined {{workspaceName}}",
    htmlTemplate:
      "<p>Hi {{firstName}},</p><p>{{invitedEmail}} accepted your invitation to {{workspaceName}}.</p>",
    textTemplate:
      "Hi {{firstName}},\n\n{{invitedEmail}} accepted your invitation to {{workspaceName}}.",
  },
};
