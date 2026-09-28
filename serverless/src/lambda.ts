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

  // EventBridge Scheduled Rule (Cron)
  if (event?.source === 'aws.events' || event?.['detail-type'] === 'Scheduled Event' || !event?.httpMethod) {
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
    if (env.CRANK_AUTH_TOKEN) {
      const auth = event.headers?.authorization || event.headers?.Authorization || '';
      const token = auth.replace(/^Bearer\s+/i, '').trim();
      if (token !== env.CRANK_AUTH_TOKEN) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }
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
