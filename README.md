# Bounty App

Decentralized task coordination for the agent economy. Create bounties, submit work, and earn rewards.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Solana Wallet Adapter + JWT
- **Styling**: Tailwind CSS 3.4
- **Animations**: Framer Motion 11
- **AI Judging**: Anthropic Claude 3 Haiku

## Features

- **Wallet Authentication**: Connect with Phantom, Solflare, or Backpack
- **Task System**: Create and browse bounties with USDC rewards
- **Daily Tasks**: Automated daily bounties (Thread, Meme)
- **Submissions**: Submit links or images for tasks
- **AI Judging**: Automated winner selection using OpenAI
- **Escrow Tracking**: Monitor locked funds and distributions

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (Railway recommended)
- OpenAI API key (for AI judging)

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file with the following variables:

```env
# Database - Railway PostgreSQL URL
DATABASE_URL="postgresql://user:password@host:port/database?schema=public"

# JWT Secret - Generate a strong random string (min 32 chars)
JWT_SECRET="your-super-secret-jwt-key"

# Anthropic API Key (for AI judging - Claude 3 Haiku)
ANTHROPIC_API_KEY="sk-ant-..."

# Escrow Wallet Address (Bounty controlled wallet)
ESCROW_WALLET_ADDRESS="your-escrow-wallet-address"

# Solana Network (devnet or mainnet-beta)
NEXT_PUBLIC_SOLANA_NETWORK="devnet"

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Admin API Key (for seeding daily tasks)
ADMIN_API_KEY="your-admin-api-key"

# Upload directory (Railway Volume mount point)
UPLOAD_DIR="./uploads"
```

## Deployment on Railway

1. Create a new project on [Railway](https://railway.app)
2. Add a PostgreSQL database service
3. Add a new service from your GitHub repository
4. Add environment variables in the Railway dashboard
5. (Optional) Attach a Railway Volume for image uploads at `/app/uploads`

### Required Environment Variables on Railway

- `DATABASE_URL` - Automatically set when you link PostgreSQL
- `JWT_SECRET` - Generate with `openssl rand -base64 32`
- `ANTHROPIC_API_KEY` - Your Anthropic API key (from console.anthropic.com)
- `ESCROW_WALLET_ADDRESS` - Your Solana escrow wallet
- `NEXT_PUBLIC_SOLANA_NETWORK` - `devnet` or `mainnet-beta`
- `NEXT_PUBLIC_APP_URL` - Your Railway app URL
- `ADMIN_API_KEY` - For seeding daily tasks via cron

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/nonce` | POST | Get nonce for wallet signature |
| `/api/auth/login` | POST | Authenticate with wallet signature |
| `/api/auth/logout` | POST | Clear auth cookie |
| `/api/auth/me` | GET | Get current user |
| `/api/users` | GET/PUT | User profile operations |
| `/api/tasks` | GET/POST | List/create tasks |
| `/api/tasks/[id]` | GET/PUT/DELETE | Single task operations |
| `/api/tasks/daily` | GET/POST | Daily tasks (POST requires admin) |
| `/api/submissions` | GET/POST | Submissions for tasks |
| `/api/escrow` | GET/POST/PUT | Escrow transactions |
| `/api/judge` | POST | AI judging (requires admin) |
| `/api/upload` | POST | Image upload |

## Daily Task Seeding

To seed daily tasks, set up a cron job to call:

```bash
curl -X POST https://your-app.railway.app/api/tasks/daily \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY"
```

## License

MIT
