import { describe, expect, it } from 'vitest';
import { parseAppEnv, parseFlag, readAppConfig } from './appConfig';

describe('app config', () => {
  it('reads feature flags', () => {
    for (const on of ['true', 'TRUE', '1', 'yes', ' on ']) expect(parseFlag(on)).toBe(true);
    for (const off of ['false', '0', 'no', 'off', 'maybe']) expect(parseFlag(off)).toBe(false);
    expect(parseFlag(undefined)).toBe(false);
    expect(parseFlag('', true)).toBe(true);
  });

  it('keeps Microsoft sign-in off unless VITE_SSO_ENABLED turns it on', () => {
    expect(readAppConfig({}).ssoEnabled).toBe(false);
    expect(readAppConfig({ VITE_SSO_ENABLED: 'false' }).ssoEnabled).toBe(false);
    expect(readAppConfig({ VITE_SSO_ENABLED: 'true' }).ssoEnabled).toBe(true);
  });

  it('treats a blank admin email as not set', () => {
    expect(readAppConfig({ VITE_ADMIN_EMAIL: '  ' }).adminEmail).toBeUndefined();
    expect(readAppConfig({ VITE_ADMIN_EMAIL: 'it@example.com' }).adminEmail).toBe('it@example.com');
  });

  it('names the environment, defaulting by build type', () => {
    expect(parseAppEnv('uat', false)).toBe('UAT');
    expect(parseAppEnv(' PROD ', true)).toBe('PROD');
    expect(parseAppEnv(undefined, true)).toBe('DEV');
    expect(parseAppEnv('staging', false)).toBe('PROD');
    expect(readAppConfig({ DEV: true }).appEnv).toBe('DEV');
    expect(readAppConfig({ DEV: false }).appEnv).toBe('PROD');
  });

  it('reads footer links and the version', () => {
    const config = readAppConfig({ VITE_PRIVACY_URL: 'https://x.test/privacy' }, '1.2.3');
    expect(config.privacyUrl).toBe('https://x.test/privacy');
    expect(config.termsUrl).toBeUndefined();
    expect(config.version).toBe('1.2.3');
  });
});
