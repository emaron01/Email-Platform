/**
 * Global Vitest setup — runs before any test file.
 *
 * `npm test` loads `.env.local` via dotenv-cli, which may set
 * TRANSACTIONAL_EMAIL_PROVIDER=smtp for local dev. Tests must never send
 * real mail; force console unless a test explicitly opts into mocked SMTP.
 */
process.env.NODE_ENV ??= "test";
process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
delete process.env.TRANSACTIONAL_EMAIL_ALLOW_LIVE_SMTP_IN_TESTS;
