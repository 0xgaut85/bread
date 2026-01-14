/**
 * Proxy Route for x402 CORS Bypass
 *
 * Enables browser-based x402 requests that need to bypass CORS restrictions.
 * Returns HTTP 200 with actual status in response body for proper 402 handling.
 *
 * Reference: https://github.com/PayAINetwork/x402-solana#proxy-server-implementation
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Allowed target domains for security
const ALLOWED_DOMAINS = [
  "facilitator.payai.network",
  "api.mainnet-beta.solana.com",
  "api.devnet.solana.com",
  // Add Helius RPC domains
  "mainnet.helius-rpc.com",
  "devnet.helius-rpc.com",
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, method, headers, body: requestBody } = body;

    // Validate inputs
    if (!url || !method) {
      return NextResponse.json(
        { error: "url and method are required" },
        { status: 400 }
      );
    }

    // Security: Only allow requests to approved domains
    if (!isAllowedUrl(url)) {
      return NextResponse.json(
        { error: "Target URL not allowed" },
        { status: 403 }
      );
    }

    // Prepare headers (preserve x402 payment headers)
    const requestHeaders: Record<string, string> = {
      "Content-Type": headers?.["Content-Type"] || "application/json",
      "User-Agent": "bread-x402-proxy/1.0",
      ...(headers || {}),
    };

    // Remove problematic headers
    delete requestHeaders["host"];
    delete requestHeaders["content-length"];
    delete requestHeaders["origin"];
    delete requestHeaders["referer"];

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: requestHeaders,
    };

    // Add body for non-GET requests
    if (method.toUpperCase() !== "GET" && requestBody) {
      fetchOptions.body =
        typeof requestBody === "string"
          ? requestBody
          : JSON.stringify(requestBody);
    }

    // Make request to target endpoint
    const response = await fetch(url, fetchOptions);

    // Parse response
    const contentType = response.headers.get("content-type") || "";
    let responseData: unknown;

    if (contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    // Prepare response headers (filter out problematic ones)
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        ![
          "content-encoding",
          "transfer-encoding",
          "content-length",
          "connection",
        ].includes(lowerKey)
      ) {
        responseHeaders[key] = value;
      }
    });

    // CRITICAL: Return 200 with real status in body
    // This allows proper x402 402 Payment Required handling in the browser
    return NextResponse.json(
      {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data: responseData,
        contentType,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Proxy] Error:", message);
    return NextResponse.json(
      {
        error: "Proxy request failed",
        details: message,
      },
      { status: 500 }
    );
  }
}

// Also support GET for simple proxy requests
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json(
        { error: "url parameter is required" },
        { status: 400 }
      );
    }

    // Security check
    if (!isAllowedUrl(targetUrl)) {
      return NextResponse.json(
        { error: "Target URL not allowed" },
        { status: 403 }
      );
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "bread-x402-proxy/1.0",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    let responseData: unknown;

    if (contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      data: responseData,
      contentType,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Proxy GET] Error:", message);
    return NextResponse.json(
      {
        error: "Proxy request failed",
        details: message,
      },
      { status: 500 }
    );
  }
}
