import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  InvalidGrantError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { config } from '../../config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';

/** Audience of connector access tokens; the app's own API rejects them (see requireAuth). */
export const MCP_AUDIENCE = 'mcp';
/** Audience of the signed sign-in request handed to the consent page. */
const CONSENT_AUDIENCE = 'mcp-consent';

const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_DAYS = 30;
const CODE_SECONDS = 5 * 60;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');

/** A sign-in request waiting on the consent page; signed, so the browser can't alter it. */
interface ConsentRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: string[];
  resource?: string;
}

export function readConsentRequest(ticket: string): ConsentRequest {
  try {
    return jwt.verify(ticket, config.JWT_SECRET, { audience: CONSENT_AUDIENCE }) as ConsentRequest;
  } catch {
    throw new HttpError(400, 'This connection request has expired. Start again from Claude.');
  }
}

/** The redirect back to the client (e.g. Claude) once the person approves or declines. */
export function clientRedirect(request: ConsentRequest, params: Record<string, string>) {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (request.state) url.searchParams.set('state', request.state);
  return url.href;
}

/** Called by the consent page when a signed-in person approves the connection. */
export async function approveConsent(request: ConsentRequest, personId: string) {
  const code = secret();
  await prisma.oAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: request.clientId,
      personId,
      codeChallenge: request.codeChallenge,
      redirectUri: request.redirectUri,
      scopes: request.scopes,
      resource: request.resource,
      expiresAt: new Date(Date.now() + CODE_SECONDS * 1000),
    },
  });
  return clientRedirect(request, { code });
}

export async function clientName(clientId: string) {
  const client = await clientsStore.getClient(clientId);
  return client?.client_name ?? 'An application';
}

const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId) {
    const row = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
    return row ? (row.metadata as unknown as OAuthClientInformationFull) : undefined;
  },
  // Dynamic client registration: Claude registers itself the first time someone adds the connector.
  async registerClient(client) {
    const full = client as OAuthClientInformationFull;
    await prisma.oAuthClient.create({
      data: { id: full.client_id, metadata: full as unknown as Prisma.InputJsonValue },
    });
    return full;
  },
};

async function activeUser(personId: string): Promise<AuthUser | null> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, email: true, role: true, active: true },
  });
  return person?.active ? { id: person.id, email: person.email, role: person.role } : null;
}

async function issueTokens(
  clientId: string,
  personId: string,
  scopes: string[],
  resource: string | null | undefined,
): Promise<OAuthTokens> {
  const accessToken = jwt.sign(
    { cid: clientId, scope: scopes.join(' '), rs: resource ?? undefined },
    config.JWT_SECRET,
    {
      audience: MCP_AUDIENCE,
      subject: personId,
      expiresIn: ACCESS_TOKEN_SECONDS,
    },
  );
  const refreshToken = secret();
  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: sha256(refreshToken),
      clientId,
      personId,
      scopes,
      resource,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: refreshToken,
    ...(scopes.length ? { scope: scopes.join(' ') } : {}),
  };
}

/**
 * OAuth 2.1 authorization server for the Claude connector. People sign in with their normal
 * Resource Board account on the consent page (/connect), so the connector acts as them, with their role.
 */
export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    // The SDK has already checked the client and its redirect URI.
    const request: ConsentRequest = {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes ?? [],
      resource: params.resource?.href,
    };
    const ticket = jwt.sign(request, config.JWT_SECRET, {
      audience: CONSENT_AUDIENCE,
      expiresIn: '15m',
    });
    res.redirect(new URL(`/connect?request=${ticket}`, config.PUBLIC_URL).href);
  },

  async challengeForAuthorizationCode(_client, authorizationCode) {
    const code = await prisma.oAuthCode.findUnique({
      where: { codeHash: sha256(authorizationCode) },
    });
    if (!code) throw new InvalidGrantError('Invalid authorization code');
    return code.codeChallenge;
  },

  async exchangeAuthorizationCode(client, authorizationCode, _verifier, redirectUri) {
    // Deleting first makes every code single-use, even under concurrent requests.
    const code = await prisma.oAuthCode
      .delete({ where: { codeHash: sha256(authorizationCode) } })
      .catch(() => null);
    if (!code || code.clientId !== client.client_id || code.expiresAt < new Date()) {
      throw new InvalidGrantError('Invalid or expired authorization code');
    }
    if (redirectUri && redirectUri !== code.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match the authorization request');
    }
    if (!(await activeUser(code.personId))) throw new InvalidGrantError('Account is not active');
    return issueTokens(client.client_id, code.personId, code.scopes, code.resource);
  },

  async exchangeRefreshToken(client, refreshToken, scopes) {
    const tokenHash = sha256(refreshToken);
    const stored = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.clientId !== client.client_id || stored.expiresAt < new Date()) {
      throw new InvalidGrantError('Invalid or expired refresh token');
    }
    // Rotate: the old token stops working; only one concurrent request can win.
    const { count } = await prisma.oAuthRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count !== 1) throw new InvalidGrantError('Refresh token has been revoked');
    if (!(await activeUser(stored.personId))) throw new InvalidGrantError('Account is not active');
    const granted = scopes?.length
      ? scopes.filter((s) => stored.scopes.includes(s))
      : stored.scopes;
    return issueTokens(client.client_id, stored.personId, granted, stored.resource);
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config.JWT_SECRET, { audience: MCP_AUDIENCE }) as jwt.JwtPayload;
    } catch {
      throw new InvalidTokenError('Invalid or expired token');
    }
    // Checked on every request, so removing someone cuts off their connector immediately.
    const user = await activeUser(payload.sub as string);
    if (!user) throw new InvalidTokenError('Account is not active');
    return {
      token,
      clientId: payload.cid as string,
      scopes: payload.scope ? String(payload.scope).split(' ') : [],
      expiresAt: payload.exp,
      resource: payload.rs ? new URL(payload.rs as string) : undefined,
      extra: { user },
    };
  },

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    await prisma.oAuthRefreshToken.updateMany({
      where: { tokenHash: sha256(request.token), clientId: client.client_id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
