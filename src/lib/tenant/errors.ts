/** Shared tenant error without pulling auth into every import cycle. */
export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}
