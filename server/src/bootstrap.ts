/**
 * Bootstrap — MUST be imported before any other module.
 * Loads environment variables from .env file before any module code runs.
 * This solves the ESM import hoisting issue where dotenv runs after modules are loaded.
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '..', '.env'), override: true });

// Re-export environment variables for convenience
export { };
