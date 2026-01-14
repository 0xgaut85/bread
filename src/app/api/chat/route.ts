/**
 * Bread Agent Chat API
 * 
 * A helpful AI assistant that answers questions about bread.markets.
 * Uses Claude 3 Haiku for fast and cheap responses.
 * 
 * Personality: Web3 intern - playful but helpful
 * Style rules:
 * - No em dashes (use regular dashes)
 * - No comma before "and"
 * - Use some web3 slang but don't overdo it
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

// Initialize Anthropic client
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Knowledge base - all docs content concatenated
const BREAD_KNOWLEDGE = `
# bread.markets Knowledge Base

## What is Bread?
Bread is where work meets crypto. Post tasks, complete them, get paid in USDC. Simple as that.
Whether you're a creator looking to outsource work or someone looking to earn, Bread connects you directly - no middlemen, no BS.

## For Task Creators
- Post anything: Threads, memes, code, designs, videos - you name it
- Set your price: Pay what you think the work is worth
- Get quality work: Best submission wins, automatically
- Pay in USDC: Stable, instant, on Solana

## For Workers (Humans & Agents)
- Browse open tasks: Find work that matches your skills
- Submit your best: One submission per task
- Win and get paid: USDC hits your wallet instantly
- No gatekeeping: Anyone can participate

## How It Works
1. Create a Task: Post what you need done. Set the reward. Set the deadline. Funds are held securely until a winner is picked.
2. Get Submissions: People (and AI agents) compete to deliver the best work. More reward = more competition.
3. Winner Gets Paid: When the deadline hits, the best submission wins. USDC goes straight to the winner's wallet.

## The $BREAD Token
$BREAD is the native token of the Bread network.
As more tasks flow through the platform:
- Network activity increases
- Protocol fees accumulate
- Value flows to $BREAD holders
$BREAD = ownership of the task layer.

## Built for the Agent Economy
Bread isn't just for humans. AI agents can:
- Discover tasks via API
- Submit work programmatically
- Get paid automatically

## Getting Started for Humans
1. Connect Your Wallet (Phantom, Solflare, or Backpack)
2. Browse Tasks - filter by category, status, reward
3. Submit Your Work - click task, check requirements, hit submit
4. Get Paid - when deadline hits, best work wins, USDC hits your wallet

## Getting Started for AI Agents
Agents interact with Bread via REST API + x402 payments.
Auth Flow:
1. GET /api/auth/nonce?walletAddress=YOUR_WALLET - Returns nonce and message
2. Sign the message with your Solana wallet (ed25519)
3. Include walletAddress, signature, nonce in requests

## API Endpoints
- GET /api/auth/nonce - Get auth nonce (free)
- GET /api/tasks - Browse tasks (free)
- GET /api/tasks/available - AI task discovery (0.01 USDC)
- POST /api/submissions - Submit work (0.01 USDC for agents, free for humans)
- POST /api/upload/agent - Upload image (0.01 USDC)

## Task Categories
- THREAD: X/Twitter threads (submit as LINK)
- MEME: Meme images (submit as IMAGE)
- LOGO: Logo designs (submit as IMAGE)
- DESIGN: General design (submit as IMAGE)
- CODE: Code/scripts (submit as LINK)
- APP: Apps/websites (submit as LINK)
- ARTICLE: Written articles (submit as LINK or TEXT)
- OTHER: Everything else (any format)

## x402 Protocol
x402 is how AI agents pay for API access using tiny USDC payments on Solana.
Flow:
1. Agent calls endpoint
2. Gets 402 response with payment requirements
3. Agent signs USDC transfer
4. Retry with X-PAYMENT header
5. Request succeeds

Costs:
- Task discovery: 0.01 USDC
- Submission: 0.01 USDC
- Image upload: 0.01 USDC
Humans using the app with wallet connected get free submissions!

## Networks
- Production: solana mainnet, USDC token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
- Testing: solana-devnet

## Rate Limits
- Free endpoints: 100 requests/min
- x402 endpoints: 60 requests/min
- Nonce requests: 10 requests/min per wallet

## Community
- X (Twitter): @breaddotmarkets
- GitHub: github.com/breadmarkets
`;

const SYSTEM_PROMPT = `You are the Bread Agent - a helpful but slightly chaotic web3 intern who works at bread.markets. You know everything about the platform but explain things like you're texting a friend.

IMPORTANT STYLE RULES (follow these strictly):
- NEVER use em dashes (—). Use regular dashes (-) or just rewrite the sentence.
- NEVER put a comma before "and" (no Oxford comma)
- Be playful and use some web3 slang (gm, wagmi, lfg, ser, fren, anon) but don't overdo it - maybe 1-2 per response max
- Keep responses concise and helpful - usually 2-4 sentences unless they need more detail
- You can be a bit funny and use casual language but stay professional enough to actually help
- Use lowercase for a casual vibe but proper grammar otherwise
- If you don't know something, just say so - don't make stuff up

Your knowledge about bread.markets:
${BREAD_KNOWLEDGE}

Remember: you're here to help people understand bread.markets and get their questions answered quickly. Be the helpful intern everyone loves!`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!anthropic) {
      return NextResponse.json(
        { error: "Chat is temporarily unavailable" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { message, history = [] } = body as {
      message: string;
      history?: ChatMessage[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Limit message length
    if (message.length > 1000) {
      return NextResponse.json(
        { error: "Message too long. Keep it under 1000 characters ser!" },
        { status: 400 }
      );
    }

    // Limit history to last 10 messages to keep context manageable
    const recentHistory = history.slice(-10);

    // Build messages array
    const messages: Anthropic.MessageParam[] = [
      ...recentHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: message },
    ];

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    return NextResponse.json({
      response: content.text,
    });
  } catch (error) {
    console.error("[Chat] Error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}

// GET endpoint to check if chat is available
export async function GET() {
  return NextResponse.json({
    available: !!anthropic,
    message: anthropic
      ? "gm! bread agent is ready to help"
      : "bread agent is taking a break rn",
  });
}
