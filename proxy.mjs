/**
 * Claude GLM Proxy / Router
 *
 * Routes based on request body `model`:
 * - model=glm-*        -> Z.ai (x-api-key)
 * - otherwise          -> Anthropic (authorization passthrough OR x-api-key if provided)
 *
 * Key behaviors:
 * - Z.ai: drop `authorization` and set `x-api-key`
 * - Anthropic: if ANTHROPIC_API_KEY is set, drop `authorization` and set `x-api-key`
 * - Force `accept-encoding: identity` to avoid compressed upstream responses
 */

import "dotenv/config";
import { createServer } from "node:http";
import { Readable } from "node:stream";

const PORT = parseInt(process.env.PORT || "8787", 10);
const HOST = process.env.HOST || "127.0.0.1";

const ROUTES = {
  anthropic: {
    url: process.env.ANTHROPIC_UPSTREAM_URL || "https://api.anthropic.com",
    key: process.env.ANTHROPIC_API_KEY || "",
  },
  zai: {
    url: process.env.ZAI_UPSTREAM_URL || "https://api.z.ai/api/anthropic",
    key: process.env.ZAI_API_KEY || "",
  },
};

const DEFAULT_HAIKU_MODEL = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || "";

function selectRoute(model) {
  if (typeof model === "string" && model.startsWith("glm")) {
    return { ...ROUTES.zai, name: "zai" };
  }
  return { ...ROUTES.anthropic, name: "anthropic" };
}

function lowerKey(k) {
  return String(k || "").toLowerCase();
}

function jsonProxyError(status, message) {
  return Buffer.from(
    JSON.stringify({ error: { message, type: "proxy_error", code: status } })
  );
}

const server = createServer(async (req, res) => {
  const reqId = Date.now().toString(36);
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization, x-api-key",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "claude-glm-proxy" }));
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);

    let parsed = null;
    let model = "unknown";
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
      model = parsed?.model || "no-model";
    } catch {
      // If not JSON, we still proxy as-is.
    }

    // Optional rewrite: if user selected a haiku model name, map it to DEFAULT_HAIKU_MODEL.
    if (
      parsed &&
      typeof parsed.model === "string" &&
      /haiku/i.test(parsed.model) &&
      DEFAULT_HAIKU_MODEL
    ) {
      parsed.model = DEFAULT_HAIKU_MODEL;
      model = parsed.model;
    }

    const target = selectRoute(model);
    const base = new URL(target.url);
    const basePath = base.pathname.replace(/\/$/, "");
    const upstreamUrl = new URL(basePath + url.pathname + url.search, base.origin);

    console.log(
      `[${reqId}] ${req.method} ${url.pathname}${url.search} model=${model} -> ${target.name}`
    );

    const forwardHeaders = Object.fromEntries(
      Object.entries(req.headers).filter(([k]) => {
        const lk = lowerKey(k);
        return lk !== "host" && lk !== "connection" && lk !== "content-length";
      })
    );

    forwardHeaders["accept-encoding"] = "identity";

    const forwardBody = parsed ? Buffer.from(JSON.stringify(parsed)) : rawBody;
    forwardHeaders["content-length"] = Buffer.byteLength(forwardBody).toString();

    if (target.name === "zai") {
      delete forwardHeaders["authorization"];
      delete forwardHeaders["x-api-key"];
      if (target.key) forwardHeaders["x-api-key"] = target.key;
    } else {
      delete forwardHeaders["x-api-key"];
      if (ROUTES.anthropic.key) {
        delete forwardHeaders["authorization"];
        forwardHeaders["x-api-key"] = ROUTES.anthropic.key;
      }
    }

    const proxyRes = await fetch(upstreamUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: forwardBody,
      duplex: "half",
    });

    console.log(`[${reqId}] <- ${proxyRes.status}`);

    const resHeaders = Object.fromEntries(
      [...proxyRes.headers].filter(([k]) => {
        const lk = lowerKey(k);
        return lk !== "connection" && lk !== "content-encoding";
      })
    );
    res.writeHead(proxyRes.status, resHeaders);

    if (proxyRes.body) {
      Readable.fromWeb(proxyRes.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error(`[${reqId}] ERROR: ${err?.message || String(err)}`);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(jsonProxyError(502, "proxy_error"));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Claude GLM Proxy listening on http://${HOST}:${PORT}`);
  console.log(`  anthropic -> ${ROUTES.anthropic.url}`);
  console.log(`  zai      -> ${ROUTES.zai.url}`);
});

