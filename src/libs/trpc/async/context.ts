import { type LobeChatDatabase } from '@lobechat/database';
import { type ClientSecretPayload } from '@lobechat/types';
import debug from 'debug';
import { type NextRequest } from 'next/server';

import { LOBE_CHAT_AUTH_HEADER } from '@/const/auth';
import { validateInternalJWT } from '@/libs/trpc/utils/internalJwt';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

const log = debug('lobe-async:context');

export interface AsyncAuthContext {
  jwtPayload: ClientSecretPayload;
  serverDB?: LobeChatDatabase;
  userId?: string | null;
}

/**
 * Inner function for `createContext` where we create the context.
 * This is useful for testing when we don't want to mock Next.js' request/response
 */
export const createAsyncContextInner = async (params?: {
  jwtPayload?: ClientSecretPayload;
  userId?: string | null;
}): Promise<AsyncAuthContext> => ({
  jwtPayload: params?.jwtPayload || {},
  userId: params?.userId,
});

export type AsyncContext = Awaited<ReturnType<typeof createAsyncContextInner>>;

export const createAsyncRouteContext = async (request: NextRequest): Promise<AsyncContext> => {
  // for API-response caching see https://trpc.io/docs/v11/caching

  log('Creating async route context');

  const authorization = request.headers.get('Authorization');
  const lobeChatAuthorization = request.headers.get(LOBE_CHAT_AUTH_HEADER);

  log('Authorization header present: %s', !!authorization);
  log('LobeChat auth header present: %s', !!lobeChatAuthorization);

  if (!authorization) {
    log('No authorization header found');
    throw new Error('No authorization header found');
  }

  if (!lobeChatAuthorization) {
    log('No LobeChat authorization header found');
    throw new Error('No LobeChat authorization header found');
  }

  // Validate JWT token to verify request is from lambda
  log('Validating internal JWT token');
  const isValid = await validateInternalJWT(authorization);
  if (!isValid) {
    log('JWT validation failed');
    throw new Error('Invalid JWT token');
  }
  log('JWT validation successful');

  try {
    log('Initializing KeyVaultsGateKeeper');
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();

    log('Decrypting LobeChat authorization');
    const { plaintext } = await gateKeeper.decrypt(lobeChatAuthorization);

    log('Parsing decrypted authorization data');
    const { userId, payload } = JSON.parse(plaintext);

    log(
      'Successfully parsed authorization data - userId: %s, payload keys: %O',
      userId,
      Object.keys(payload || {}),
    );

    return createAsyncContextInner({ jwtPayload: payload, userId });
  } catch (error) {
    log('Error creating async route context: %O', error);
    throw error;
  }
};
