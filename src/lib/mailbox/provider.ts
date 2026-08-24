import "server-only";

export type ConnectedEmailProviderId = "MICROSOFT_365";

export type ConnectedEmailSendInput = {
  organizationId: string;
  userId: string;
  to: string;
  subject: string;
  body: string;
};

export type ConnectedEmailSendResult = {
  provider: ConnectedEmailProviderId;
  acceptedAt: Date;
  providerMessageId: string | null;
  providerRequestId: string | null;
};

export interface ConnectedEmailProvider {
  readonly id: ConnectedEmailProviderId;
  send(input: ConnectedEmailSendInput): Promise<ConnectedEmailSendResult>;
}

export async function getConnectedEmailProvider(
  id: ConnectedEmailProviderId,
): Promise<ConnectedEmailProvider> {
  if (id === "MICROSOFT_365") {
    const { microsoftGraphEmailProvider } = await import(
      "@/lib/mailbox/microsoft-graph"
    );
    return microsoftGraphEmailProvider;
  }
  const exhaustive: never = id;
  throw new Error(`Unsupported connected email provider: ${exhaustive}`);
}
