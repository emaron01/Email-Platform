/**
 * Global Vitest setup — runs before any test file.
 *
 * Tests never load `.env.local`. Database URL comes from TEST_DATABASE_URL
 * (`.env.test` / `.env.test.example` / docker-compose). A production host
 * hard-fails unless ALLOW_PROD_DB_TESTS=1.
 *
 * Force console mail so tests never send real SMTP.
 */
import { configureVitestDatabase } from "./src/test/database";

configureVitestDatabase();

process.env.TRANSACTIONAL_EMAIL_PROVIDER = "console";
delete process.env.TRANSACTIONAL_EMAIL_ALLOW_LIVE_SMTP_IN_TESTS;
