import { crankOracles, getOracleStatus, Env } from './index.js';

/**
 * AWS Lambda / Serverless Framework handler
 * Supports AWS EventBridge Cron events and API Gateway HTTP events
 */
export const handler = async (event: any, _context?: any) => {
  const env: Env = {
    PROGRAM_ID: process.env.PROGRAM_ID,
    RPC_URL: process.env.RPC_URL,
    NETWORK: process.env.NETWORK,
    ORACLE_KEYPAIR: process.env.ORACLE_KEYPAIR,
    JUPITER_API_KEY: process.env.JUPITER_API_KEY,
    CRANK_AUTH_TOKEN: process.env.CRANK_AUTH_TOKEN,
    PRIORITY_FEE_MICRO_LAMPORTS: process.env.PRIORITY_FEE_MICRO_LAMPORTS,
  };

  // Classify the invocation BEFORE branching.
  //
  // `!event?.httpMethod` used to be treated as "this is a cron event", but API
  // Gateway HTTP APIs and Lambda Function URLs deliver payload format 2.0, which
  // carries the method at `requestContext.http.method` and has NO top-level
  // `httpMethod`. An ordinary web request therefore fell into this branch and ran
  // the crank with no auth check at all — including when CRANK_AUTH_TOKEN was set.
  // Only an explicit EventBridge schedule marker may skip authentication.
  const isScheduledEvent =
    event?.source === 'aws.events' || event?.['detail-type'] === 'Scheduled Event';
  const isHttpRequest =
    !!event?.httpMethod ||
    !!event?.requestContext?.http ||
    typeof event?.rawPath === 'string' ||
    typeof event?.path === 'string';

  // EventBridge Scheduled Rule (Cron) — the only unauthenticated path, and it is
  // reachable only from a genuine scheduled event.
  if (isScheduledEvent && !isHttpRequest) {
    console.log('[Lambda Cron] Executing scheduled oracle crank...');
    try {
      const result = await crankOracles(env);
      return {
        statusCode: 200,
        body: JSON.stringify(result),
      };
    } catch (err: any) {
      console.error('[Lambda Cron Error]:', err.message || err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  // API Gateway HTTP Request
  const path = event.path || event.rawPath || '/';
  const method = (event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();

  if (method === 'GET' && (path === '/' || path === '/health' || path === '/status')) {
    try {
      const status = await getOracleStatus(env);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status, null, 2),
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  if (method === 'POST' && path === '/crank') {
    // FAIL CLOSED, matching the Cloudflare worker (index.ts). This endpoint spends
    // the oracle authority's lamports and writes global protocol prices, so an
    // unauthenticated /crank is a griefing vector. An unset token used to mean "no
    // auth required"; it now means "endpoint disabled".
    if (!env.CRANK_AUTH_TOKEN) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Crank endpoint disabled: CRANK_AUTH_TOKEN is not configured.',
          remedy: 'Set the CRANK_AUTH_TOKEN environment variable and redeploy.',
          docs: 'serverless/README.md',
        }),
      };
    }
    const auth = event.headers?.authorization || event.headers?.Authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (token !== env.CRANK_AUTH_TOKEN) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    try {
      const result = await crankOracles(env);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result, null, 2),
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ error: 'Not Found' }),
  };
};
