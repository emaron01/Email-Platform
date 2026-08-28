import { AsyncLocalStorage } from "node:async_hooks";

export type TenantRequestContext = {
  organizationId: string;
  userId?: string | null;
};

const storage = new AsyncLocalStorage<TenantRequestContext>();

export function runWithTenantContext<T>(
  context: TenantRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}

export function getTenantContext(): TenantRequestContext | undefined {
  return storage.getStore();
}
