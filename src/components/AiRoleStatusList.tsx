import type { AiRoleStatus } from "@/lib/ai/roles";

export function AiRoleStatusList({
  roles,
  heading,
}: {
  roles: AiRoleStatus[];
  heading?: string;
}) {
  if (roles.length === 0) return null;
  return (
    <div className="space-y-3">
      {heading ? (
        <p className="text-sm font-medium text-slate-900">{heading}</p>
      ) : null}
      <ul className="space-y-2">
        {roles.map((role) => (
          <li
            key={role.role}
            className={`rounded-md border px-3 py-2 text-sm ${
              role.configured
                ? "border-slate-200 bg-slate-50 text-slate-700"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            <p className="font-medium">
              {role.label}
              {role.configured ? " — configured" : " — not configured"}
            </p>
            <p className="mt-0.5 text-xs">
              Used for {role.operations.join(", ")}.
            </p>
            {role.configured ? null : (
              <p className="mt-1 text-xs">
                Set {role.missingEnv.join(", ")} in the environment and restart.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
