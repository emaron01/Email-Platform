/**
 * Redact secrets from auth/provisioning error messages before logging.
 * Never emit password, hash, token, or API credential values.
 */
const SENSITIVE_KEY =
  /password|passwordHash|token|secret|api[_-]?key|authorization|accessToken|refreshToken|idToken|hash/i;

const BCRYPT_HASH = /\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{22,}/g;

/**
 * Strip credential-bearing fragments from a free-form error string
 * (including Prisma "Unknown argument" / argument dump messages).
 */
export function redactAuthErrorMessage(message: string): string {
  let out = message;

  // key: value or "key": "value" / key=value dumps from Prisma / adapters
  out = out.replace(
    /(["']?)([A-Za-z_][A-Za-z0-9_]*)\1\s*[:=]\s*(["'`])(?:\\.|(?!\3).)*\3/g,
    (full, _q, key: string) => {
      if (SENSITIVE_KEY.test(key)) {
        return `${key}: [REDACTED]`;
      }
      return full;
    },
  );

  // Unquoted sensitive assignments (password: abc..., password=abc)
  out = out.replace(
    /\b(password|passwordHash|token|secret|apiKey|api_key|authorization|accessToken|refreshToken|idToken)\b\s*[:=]\s*[^\s,}\]]+/gi,
    "$1: [REDACTED]",
  );

  out = out.replace(BCRYPT_HASH, "[REDACTED_HASH]");

  return out;
}

/** Safe one-line summary for CLI / server logs. */
export function formatSafeErrorForLog(error: unknown, maxLen = 800): string {
  if (error instanceof Error) {
    const name = error.name && error.name !== "Error" ? `${error.name}: ` : "";
    return `${name}${redactAuthErrorMessage(error.message)}`.slice(0, maxLen);
  }
  return redactAuthErrorMessage(String(error)).slice(0, maxLen);
}
