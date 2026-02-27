// Local development proxy - mirrors Cloudflare Worker behavior
// Run with: bun proxy-server.ts

const env = {
  ALLFEAT_API_KEY:
    "aft_308b7c555141dd5893040f021d67d11d0b49f1cf5083e56d7caa636ca8cef59e",
  ALLFEAT_PASSPHRASE: "Azerty1234*",
  ALLFEAT_API_URL: "http://localhost:13002",
  ALLFEAT_NETWORK: "testnet",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ─────────────────────────────────────────────────────────────────────────────
// Logging Utilities
// ─────────────────────────────────────────────────────────────────────────────

function truncateString(str: string, maxLength: number = 200): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + "...";
}

function maskSensitiveData(obj: any): any {
  if (typeof obj !== "object" || obj === null) return obj;

  const masked = { ...obj };
  const sensitiveKeys = [
    "passphrase",
    "password",
    "secret",
    "api_key",
    "apiKey",
  ];

  for (const key of Object.keys(masked)) {
    if (
      sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))
    ) {
      masked[key] = "***";
    } else if (typeof masked[key] === "object") {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }

  return masked;
}

function maskApiKey(key: string): string {
  if (key.length <= 10) return "***";
  return key.substring(0, 8) + "..." + key.substring(key.length - 4);
}

function logIncoming(method: string, action: string, body: any): void {
  console.log(`\n[PROXY] ← Incoming: ${method} /`);
  console.log(`  Action: ${action}`);
  console.log(
    `  Body: ${truncateString(JSON.stringify(maskSensitiveData(body)))}`,
  );
}

function logOutgoing(
  url: string,
  headers: Record<string, string>,
  body: any,
): void {
  const maskedHeaders = { ...headers };
  if (maskedHeaders["x-api-key"]) {
    maskedHeaders["x-api-key"] = maskApiKey(maskedHeaders["x-api-key"]);
  }

  console.log(`[PROXY] → Forwarding to: ${url}`);
  console.log(`  Headers: ${JSON.stringify(maskedHeaders)}`);
  console.log(
    `  Body: ${truncateString(JSON.stringify(maskSensitiveData(body)))}`,
  );
}

function logResponse(
  status: number,
  statusText: string,
  durationMs: number,
  body: string,
): void {
  console.log(
    `[PROXY] ← Response from backend: ${status} ${statusText} (${durationMs}ms)`,
  );
  console.log(`  Body: ${truncateString(body)}`);
}

function logError(context: string, error: any): void {
  console.error(`[PROXY] ✗ Error (${context}): ${error.message || error}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleRegisterWork(body: any) {
  const { hash_commitment } = body;

  const cleanHash = hash_commitment?.startsWith("0x")
    ? hash_commitment.slice(2)
    : hash_commitment;

  if (!cleanHash || !/^[0-9a-fA-F]{64}$/.test(cleanHash)) {
    console.log(`[PROXY] ✗ Invalid hash_commitment format`);
    return Response.json(
      { error: "Invalid hash_commitment format" },
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  const url = `${env.ALLFEAT_API_URL}/v1/works`;
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": env.ALLFEAT_API_KEY,
  };
  const requestBody = {
    hash_commitment,
    passphrase: env.ALLFEAT_PASSPHRASE,
    network: env.ALLFEAT_NETWORK,
  };

  logOutgoing(url, headers, requestBody);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    const data = await response.text();
    const durationMs = Date.now() - startTime;

    logResponse(response.status, response.statusText || "OK", durationMs, data);

    return new Response(data, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (fetchError: any) {
    const durationMs = Date.now() - startTime;
    logError(`register-work after ${durationMs}ms`, fetchError);
    return Response.json(
      {
        error: "Failed to connect to ATS API",
        details: fetchError.message,
      },
      {
        status: 502,
        headers: corsHeaders,
      },
    );
  }
}

async function handleParseCert(body: any) {
  const { certificate } = body;

  if (!certificate || typeof certificate !== "string") {
    console.log(`[PROXY] ✗ Missing or invalid certificate field`);
    return Response.json(
      { error: "Missing or invalid certificate field" },
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  const url = `${env.ALLFEAT_API_URL}/v1/certificates/parse?network=${env.ALLFEAT_NETWORK}`;
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": env.ALLFEAT_API_KEY,
  };
  const requestBody = { certificate };

  logOutgoing(url, headers, requestBody);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    const data = await response.text();
    const durationMs = Date.now() - startTime;

    logResponse(response.status, response.statusText || "OK", durationMs, data);

    return new Response(data, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (fetchError: any) {
    const durationMs = Date.now() - startTime;
    logError(`parse-cert after ${durationMs}ms`, fetchError);
    return Response.json(
      {
        error: "Failed to connect to certificate parse API",
        details: fetchError.message,
      },
      {
        status: 502,
        headers: corsHeaders,
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Status Handler (Polling Fallback)
// ─────────────────────────────────────────────────────────────────────────────

async function handleGetTransactionStatus(transactionId: string) {
  const url = `${env.ALLFEAT_API_URL}/v1/transactions/${transactionId}`;
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": env.ALLFEAT_API_KEY,
  };

  console.log(`[PROXY] → GET transaction status: ${url}`);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    const data = await response.text();
    const durationMs = Date.now() - startTime;

    logResponse(response.status, response.statusText || "OK", durationMs, data);

    return new Response(data, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (fetchError: any) {
    const durationMs = Date.now() - startTime;
    logError(`get-status after ${durationMs}ms`, fetchError);
    return Response.json(
      {
        error: "Failed to get transaction status",
        details: fetchError.message,
      },
      {
        status: 502,
        headers: corsHeaders,
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

Bun.serve({
  port: 3333,
  async fetch(request, server) {
    const url = new URL(request.url);

    // Handle WebSocket upgrade for transaction tracking
    if (url.pathname.startsWith("/v1/ws/transactions/")) {
      const transactionId = url.pathname.split("/").pop();
      console.log(`[PROXY] ← WebSocket upgrade request for transaction: ${transactionId}`);

      // Upgrade to WebSocket
      const success = server.upgrade(request, {
        data: { transactionId },
      });

      if (success) {
        return undefined; // Bun handles the upgrade
      }

      return Response.json(
        { error: "WebSocket upgrade failed" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Handle GET requests for transaction status (polling fallback)
    if (request.method === "GET" && url.pathname.startsWith("/v1/transactions/")) {
      const transactionId = url.pathname.split("/").pop();
      if (transactionId) {
        return await handleGetTransactionStatus(transactionId);
      }
    }

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      console.log(`[PROXY] ← OPTIONS (CORS preflight)`);
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST requests for action-based endpoints
    if (request.method !== "POST") {
      console.log(`[PROXY] ✗ Method not allowed: ${request.method}`);
      return Response.json(
        { error: "Method not allowed" },
        {
          status: 405,
          headers: corsHeaders,
        },
      );
    }

    try {
      let body;
      try {
        body = await request.json();
      } catch {
        console.log(`[PROXY] ✗ Invalid JSON in request body`);
        return Response.json(
          { error: "Invalid JSON in request body" },
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }

      const action = body.action;
      logIncoming(request.method, action || "(none)", body);

      switch (action) {
        case "register-work":
          return await handleRegisterWork(body);
        case "parse-cert":
          return await handleParseCert(body);
        default:
          console.log(`[PROXY] ✗ Unknown action: ${action}`);
          return Response.json(
            { error: `Unknown action: ${action}` },
            {
              status: 400,
              headers: corsHeaders,
            },
          );
      }
    } catch (err: any) {
      logError("unhandled", err);
      return Response.json(
        {
          error: err.message,
          type: err.name,
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }
  },

  // WebSocket handlers for transaction tracking
  websocket: {
    open(ws) {
      const { transactionId } = ws.data as { transactionId: string };
      console.log(`[WS] Client connected for transaction: ${transactionId}`);

      // Connect to backend WebSocket
      const backendWsUrl = env.ALLFEAT_API_URL.replace(/^http/, "ws") + `/v1/ws/transactions/${transactionId}`;
      console.log(`[WS] Connecting to backend: ${backendWsUrl}`);

      const backendWs = new WebSocket(backendWsUrl);

      // Store backend connection on the client ws
      (ws as any).backendWs = backendWs;

      backendWs.onopen = () => {
        console.log(`[WS] Backend connection opened for: ${transactionId}`);
      };

      backendWs.onmessage = (event) => {
        console.log(`[WS] Backend → Client: ${truncateString(String(event.data))}`);
        // Forward message to client
        ws.send(event.data);
      };

      backendWs.onerror = (error) => {
        console.error(`[WS] Backend error:`, error);
        ws.send(JSON.stringify({
          type: "error",
          message: "Backend WebSocket connection error",
        }));
      };

      backendWs.onclose = (event) => {
        console.log(`[WS] Backend closed: ${event.code} ${event.reason}`);
        ws.close(event.code, event.reason);
      };
    },

    message(ws, message) {
      console.log(`[WS] Client → Backend: ${truncateString(String(message))}`);
      // Forward message to backend
      const backendWs = (ws as any).backendWs as WebSocket;
      if (backendWs && backendWs.readyState === WebSocket.OPEN) {
        backendWs.send(message);
      }
    },

    close(ws, code, reason) {
      const { transactionId } = ws.data as { transactionId: string };
      console.log(`[WS] Client disconnected for: ${transactionId} (${code} ${reason})`);

      // Close backend connection
      const backendWs = (ws as any).backendWs as WebSocket;
      if (backendWs) {
        backendWs.close();
      }
    },
  },
});

console.log(
  "═══════════════════════════════════════════════════════════════════",
);
console.log("  Local proxy server running on http://localhost:3333");
console.log("  Forwarding to ATS API at:", env.ALLFEAT_API_URL);
console.log(
  "═══════════════════════════════════════════════════════════════════",
);
console.log("\nMake sure to update the env object with your credentials!");
console.log("Waiting for requests...\n");
