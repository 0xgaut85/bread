import { NextResponse } from "next/server";

// CORS headers for wallet adapter compatibility
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Proxy RPC requests to Helius to keep the API key server-side
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const rpcUrl = process.env.HELIUS_RPC_URL;
    if (!rpcUrl) {
      return NextResponse.json(
        { error: "RPC not configured" },
        { status: 500, headers: corsHeaders }
      );
    }

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error("RPC proxy error:", error);
    return NextResponse.json(
      { error: "RPC request failed" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}
