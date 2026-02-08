/**
 * Claude GLM Proxy Server
 * Routes GLM model requests to Z.ai (GLM AI Studio) API
 */

import 'dotenv/config';

const PORT = 8787;
const HOST = '127.0.0.1';
const ZAI_API_BASE = 'https://api.z.ai/api/anthropic';

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
 * Handle incoming requests
 */
async function handleRequest(req, srv) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const zaiApiKey = process.env.ZAI_API_KEY;
  const defaultHaikuModel = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;

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

  try {
    const rawBodyBuffer = await req.arrayBuffer();
    const rawBodyText = new TextDecoder().decode(rawBodyBuffer);
    const sanitizedBody = rawBodyText.replace(/\u0000/g, '').trim();

    if (!sanitizedBody && req.method !== 'GET' && req.method !== 'HEAD') {
      return Response.json(
        errorResponse(400, 'Empty request body'),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let body = null;
    if (sanitizedBody) {
      try {
        body = JSON.parse(sanitizedBody);
      } catch {
        log('WARN', `Invalid JSON body for ${req.method} ${url.pathname}, forwarding as-is`);
      }
    }

    if (defaultHaikuModel && typeof body?.model === 'string') {
      const isHaikuRequest = /^claude-3-haiku/i.test(body.model) || /^haiku/i.test(body.model);
      if (isHaikuRequest) {
        body.model = defaultHaikuModel;
      }
    }

    const forwardBody = body ? JSON.stringify(body) : sanitizedBody;

    // Log the request (without sensitive data)
    log('INFO', `Proxying ${req.method} ${url.pathname} for model: ${body?.model || 'unknown'}`);

    // Forward to Z.ai API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    try {
      // Build upstream URL
      const upstreamUrl = new URL(url.pathname.replace(/^\//, ''), `${ZAI_API_BASE}/`);
      if (url.search) {
        upstreamUrl.search = url.search;
      }

      // Prepare headers - forward all except host/connection
      const forwardHeaders = new Headers();
      for (const [key, value] of req.headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'host' || lowerKey === 'connection' || lowerKey === 'content-length') {
          continue;
        }
        forwardHeaders.set(key, value);
      }
      if (zaiApiKey) {
        forwardHeaders.set('authorization', `Bearer ${zaiApiKey}`);
        forwardHeaders.set('x-api-key', zaiApiKey);
      }
      forwardHeaders.set('content-type', 'application/json');

      const response = await fetch(upstreamUrl.toString(), {
        method: req.method,
        headers: forwardHeaders,
        body: forwardBody,
        signal: controller.signal,
        duplex: 'half',
      });

      clearTimeout(timeoutId);

      // Get response data
      let responseData;
      const responseContentType = response.headers.get('content-type') || 'application/json';
      const responseText = await response.text();

      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = undefined;
      }

      if (responseData === undefined) {
        const preview = responseText.replace(/\s+/g, ' ').slice(0, 200) || '[empty response]';
        log('WARN', `Upstream returned non-JSON response (${response.status}): ${preview}`);
        if (!response.ok) {
          return Response.json(
            errorResponse(response.status, 'Upstream returned non-JSON response'),
            { status: response.status, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(responseText ?? '', {
          status: response.status,
          headers: {
            'Content-Type': responseContentType,
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      if (!response.ok) {
        log('WARN', `Upstream error: ${response.status}`);
        // Forward error but sanitize stack traces if present
        return Response.json(
          errorResponse(response.status, responseData.error?.message || 'Upstream error'),
          { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
      }

      log('INFO', `Successfully proxied response for model: ${body.model || 'unknown'}`);

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
  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log('INFO', `Received ${signal}, shutting down gracefully...`);

    // Stop accepting new connections
    if (typeof server.stop === 'function') {
      server.stop();
      log('INFO', 'Server stopped');
      process.exit(0);
    }

    if (typeof server.close === 'function') {
      server.close(() => {
        log('INFO', 'Server closed');
        process.exit(0);
      });
    }

    // Give pending requests time to complete, then force exit
    setTimeout(() => {
      log('INFO', 'Forcing exit after grace period');
      process.exit(1);
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
  log('INFO', 'Proxying to Z.ai (GLM AI Studio) API');
  log('INFO', 'Endpoints:');
  log('INFO', `  POST /v1/messages - Anthropic Messages API`);
  log('INFO', `  POST /v1/chat/completions - Chat Completions API`);
  log('INFO', `  GET  /health - Health check`);
}

main().catch((err) => {
  log('ERROR', 'Failed to start server:', err);
  process.exit(1);
});
