/**
 * Build-time settings for the web app, read from Vite env vars (see apps/web/.env.example).
 * All reads live here so pages stay simple and tests can check the parsing.
 */

/** A feature flag from an env var: "true", "1", "yes" and "on" (any case) turn it on. */
export function parseFlag(value: unknown, fallback = false): boolean {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/** An optional text setting: blank means not set. */
const text = (value: unknown) => (typeof value === 'string' && value.trim()) || undefined;

export interface AppConfig {
  /** Show "Sign in with Microsoft (SSO)" on the sign-in page. */
  ssoEnabled: boolean;
  /** Who to email for access; without it the sign-in page shows the text without a link. */
  adminEmail?: string;
}

export function readAppConfig(env: Record<string, unknown>): AppConfig {
  return {
    ssoEnabled: parseFlag(env.VITE_SSO_ENABLED),
    adminEmail: text(env.VITE_ADMIN_EMAIL),
  };
}

export const appConfig = readAppConfig(import.meta.env);
