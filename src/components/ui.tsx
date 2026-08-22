export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        {description}
      </p>
      {actions ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

import { AutosizeTextarea } from "@/components/AutosizeTextarea";

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
  hint,
  as = "input",
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  as?: "input" | "textarea";
  rows?: number;
}) {
  const shared =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-400 placeholder:text-slate-400 focus:ring-2";

  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-xs font-normal text-slate-500">
          {hint}
        </span>
      ) : null}
      {as === "textarea" ? (
        <AutosizeTextarea
          name={name}
          defaultValue={defaultValue ?? ""}
          required={required}
          placeholder={placeholder}
          minRows={rows}
          className={`${shared} resize-none overflow-hidden`}
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue ?? ""}
          required={required}
          placeholder={placeholder}
          className={shared}
        />
      )}
    </label>
  );
}

export function SubmitButton({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  type = "button",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  type = "button",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/**
 * Fallback when a page needs a workspace but none is resolvable.
 *
 * DEV_ORGANIZATION_ID instructions are only shown when the explicit
 * non-production tenant bypass is enabled — never in production.
 */
export function TenantMissing() {
  const allowDevInstructions =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEV_TENANT_BYPASS === "true";

  if (allowDevInstructions) {
    return (
      <EmptyState
        title="Organization not configured"
        description="Set DEV_ORGANIZATION_ID in .env.local to a valid Organization id. Run the database migration, then npm run db:seed, and copy the printed organization id."
      />
    );
  }

  return (
    <EmptyState
      title="No workspace is associated with this account."
      description="You are signed in, but this account is not a member of a customer workspace. Open Account Settings, or contact support if you need access."
      actions={
        <>
          <a
            href="/settings/account"
            className="font-medium text-slate-900 underline"
          >
            Account Settings
          </a>
          <a href="/login" className="text-slate-600 underline">
            Switch account
          </a>
        </>
      }
    />
  );
}
