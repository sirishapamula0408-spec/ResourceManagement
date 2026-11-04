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

export type AppEnv = 'DEV' | 'UAT' | 'PROD';

/** DEV, UAT or PROD from VITE_APP_ENV (any case); unset or unknown: DEV in dev builds, else PROD. */
export function parseAppEnv(value: unknown, devBuild: boolean): AppEnv {
  const env = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (env === 'DEV' || env === 'UAT' || env === 'PROD') return env;
  return devBuild ? 'DEV' : 'PROD';
}

export interface AppConfig {
  /** Show "Sign in with Microsoft (SSO)" on the sign-in page. */
  ssoEnabled: boolean;
  /** Who to email for access; without it the sign-in page shows the text without a link. */
  adminEmail?: string;
  /** Shown as a badge next to Help/Support, except in PROD. */
  appEnv: AppEnv;
  /** Links for "Privacy" and "Terms" in the sign-in footer; plain text when not set. */
  privacyUrl?: string;
  termsUrl?: string;
  /** App version, from apps/web/package.json at build time. */
  version: string;
}

export function readAppConfig(env: Record<string, unknown>, version = ''): AppConfig {
  return {
    ssoEnabled: parseFlag(env.VITE_SSO_ENABLED),
    adminEmail: text(env.VITE_ADMIN_EMAIL),
    appEnv: parseAppEnv(env.VITE_APP_ENV, env.DEV === true),
    privacyUrl: text(env.VITE_PRIVACY_URL),
    termsUrl: text(env.VITE_TERMS_URL),
    version,
  };
}

export const appConfig = readAppConfig(import.meta.env, __APP_VERSION__);
