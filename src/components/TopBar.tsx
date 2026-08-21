export function TopBar({
  organizationName,
  userLabel,
}: {
  organizationName: string;
  userLabel: string;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="text-sm text-slate-500">Workspace</div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">{organizationName}</p>
          <p className="text-xs text-slate-500">{userLabel}</p>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
          aria-hidden
        >
          {organizationName.slice(0, 1).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
