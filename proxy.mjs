/**
 * Claude GLM Proxy Server
 * Routes GLM model requests to OpenRouter API
 */

import 'dotenv/config';

const PORT = 8787;
const HOST = '127.0.0.1';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ANSI color codes for logging
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

function log(method, message, ...args) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const color = method === 'ERROR' ? colors.red : method === 'WARN' ? colors.yellow : colors.green;
  console.log(`${colors.gray}[${timestamp}]${colors.reset} ${color}${method}${colors.reset} ${message}`, ...args);
}

/**
 * Safe error response that doesn't leak internal details
 */
function errorResponse(status, message) {
  return {
    error: {
      message,
      type: 'proxy_error',
      code: status,
    },
  };
}

/**
 * Validate request body
 */
function validateRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  if (!body.model || typeof body.model !== 'string') {
    return { valid: false, error: 'Missing or invalid "model" field' };
  }

  if (!Array.isArray(body.messages)) {
    return { valid: false, error: 'Missing or invalid "messages" array' };
  }

  return { valid: true };
}

/**
 * Handle incoming requests
 */
async function handleRequest(req, srv) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      },
    });
  }

  // Health check endpoint
  if (req.method === 'GET' && url.pathname === '/health') {
    return Response.json({ status: 'ok', service: 'claude-glm-proxy' });
  }

  // Only accept POST to /v1/chat/completions or root
  if (req.method !== 'POST' || (url.pathname !== '/v1/chat/completions' && url.pathname !== '/')) {
    return Response.json(
      errorResponse(404, 'Not found. Use POST /v1/chat/completions'),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();

    // Validate request
    const validation = validateRequestBody(body);
    if (!validation.valid) {
      return Response.json(
        errorResponse(400, validation.error),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for API key in request
    const apiKey = req.headers.get('authorization')?.replace('Bearer ', '')
                   || req.headers.get('x-api-key');

    if (!apiKey) {
      return Response.json(
        errorResponse(401, 'Missing API key. Provide via Authorization or x-api-key header.'),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Log the request (without sensitive data)
    log('INFO', `Proxying request for model: ${body.model}`);

    // Forward to OpenRouter
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://claude-glm-proxy.local',
          'X-Title': 'Claude GLM Proxy',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Get response data
      const responseData = await response.json();

      if (!response.ok) {
        log('WARN', `Upstream error: ${response.status}`);
        // Forward error but sanitize stack traces if present
        return Response.json(
          errorResponse(response.status, responseData.error?.message || 'Upstream error'),
          { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
      }

      log('INFO', `Successfully proxied response for model: ${body.model}`);

      // Return successful response
      return Response.json(responseData, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        return Response.json(
          errorResponse(504, 'Request timeout'),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw fetchError;
    }

  } catch (err) {
    if (err instanceof SyntaxError) {
      return Response.json(
        errorResponse(400, 'Invalid JSON in request body'),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    log('ERROR', 'Request processing error:', err.message);
    return Response.json(
      errorResponse(500, 'Internal server error'),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Graceful shutdown handler
 */
function setupShutdownHandlers(server) {
  const shutdown = async (signal) => {
    log('INFO', `Received ${signal}, shutting down gracefully...`);

    // Stop accepting new connections
    server.close();

    // Give pending requests time to complete, then force exit
    setTimeout(() => {
      log('INFO', 'Forcing exit after grace period');
      process.exit(0);
    }, 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Start the server
 */
async function main() {
  const server = Bun.serve({
    port: PORT,
    hostname: HOST,
    fetch: (req, srv) => handleRequest(req, srv),
  });

  setupShutdownHandlers(server);

  log('INFO', `Claude GLM Proxy running on http://${HOST}:${PORT}`);
  log('INFO', 'Endpoints:');
  log('INFO', `  POST /v1/chat/completions - Proxy chat requests to OpenRouter`);
  log('INFO', `  GET  /health - Health check`);
}

main().catch((err) => {
  log('ERROR', 'Failed to start server:', err);
  process.exit(1);
});
