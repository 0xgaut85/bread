/**
 * x402 100 Wallets Stress Test
 * 
 * 1. Generates 100 wallets
 * 2. Disperses SOL + USDC from master wallet
 * 3. Runs x402 transactions every 2 minutes
 * 
 * Usage:
 *   node scripts/x402-100-wallets.js --generate    Generate 100 wallets
 *   node scripts/x402-100-wallets.js --disperse    Disperse funds from master
 *   node scripts/x402-100-wallets.js --run         Run the stress test
 *   node scripts/x402-100-wallets.js --status      Check all balances
 */

const { Keypair, Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID, getAccount } = require('@solana/spl-token');
const bs58 = require('bs58').default || require('bs58');
const fs = require('fs');
const path = require('path');

// Configuration
const WALLETS_FILE = path.join(__dirname, 'x402-100-keypairs.json');
const WALLET_COUNT = 100;
const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

// Master wallet (funded by user)
const MASTER_PRIVATE_KEY = '477zmPN8yoXkMCnYtKQmMx5cHAzGX9dAZoQ7M9wTxKKcfpzyxLtaT4G3NosRRdbu8QkgcGEy1enDu1Xc6nLnQH2p';

// Solana config
const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// x402 config
const TARGET_URL = 'https://app.bountydot.money/api/tasks/available';

// Amounts to disperse per wallet
const SOL_PER_WALLET = 0.002; // 0.002 SOL for rent + fees
const USDC_PER_WALLET = 0.015; // 0.015 USDC (enough for 1 tx + buffer)

function getMasterKeypair() {
  return Keypair.fromSecretKey(bs58.decode(MASTER_PRIVATE_KEY));
}

function getKeypair(walletData) {
  return Keypair.fromSecretKey(Buffer.from(walletData.secretKey, 'base64'));
}

/**
 * Generate 100 wallets
 */
function generateWallets() {
  console.log(`\n🔑 Generating ${WALLET_COUNT} wallets...\n`);
  
  const wallets = [];
  for (let i = 0; i < WALLET_COUNT; i++) {
    const keypair = Keypair.generate();
    wallets.push({
      index: i,
      publicKey: keypair.publicKey.toBase58(),
      secretKey: Buffer.from(keypair.secretKey).toString('base64')
    });
    
    if ((i + 1) % 20 === 0) {
      console.log(`  Generated ${i + 1}/${WALLET_COUNT} wallets...`);
    }
  }
  
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));
  console.log(`\n✅ Saved ${WALLET_COUNT} wallets to ${WALLETS_FILE}`);
  console.log(`⚠️  This file contains private keys - NEVER commit to git!\n`);
  
  return wallets;
}

/**
 * Load wallets
 */
function loadWallets() {
  if (!fs.existsSync(WALLETS_FILE)) {
    console.error('❌ Wallets file not found. Run --generate first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
}

/**
 * Check balance
 */
async function getBalances(connection, publicKey) {
  const sol = await connection.getBalance(publicKey) / LAMPORTS_PER_SOL;
  let usdc = 0;
  try {
    const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
    const account = await getAccount(connection, ata);
    usdc = Number(account.amount) / 1_000_000;
  } catch {}
  return { sol, usdc };
}

/**
 * Disperse funds from master wallet to all 100 wallets
 */
async function disperseFunds() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const master = getMasterKeypair();
  const wallets = loadWallets();
  
  console.log('\n💸 Dispersing funds from master wallet...\n');
  console.log(`Master: ${master.publicKey.toBase58()}`);
  
  // Check master balance
  const masterBal = await getBalances(connection, master.publicKey);
  console.log(`Master SOL: ${masterBal.sol.toFixed(4)}`);
  console.log(`Master USDC: ${masterBal.usdc.toFixed(4)}`);
  
  const totalSolNeeded = WALLET_COUNT * SOL_PER_WALLET + 0.05; // Extra for fees
  const totalUsdcNeeded = WALLET_COUNT * USDC_PER_WALLET;
  
  console.log(`\nNeeded: ${totalSolNeeded.toFixed(4)} SOL, ${totalUsdcNeeded.toFixed(4)} USDC`);
  
  if (masterBal.sol < totalSolNeeded) {
    console.error(`❌ Not enough SOL! Need ${totalSolNeeded.toFixed(4)}, have ${masterBal.sol.toFixed(4)}`);
    return;
  }
  if (masterBal.usdc < totalUsdcNeeded) {
    console.error(`❌ Not enough USDC! Need ${totalUsdcNeeded.toFixed(4)}, have ${masterBal.usdc.toFixed(4)}`);
    return;
  }
  
  // Get master's USDC ATA
  const masterAta = await getAssociatedTokenAddress(USDC_MINT, master.publicKey);
  
  console.log('\n📤 Sending to wallets...\n');
  
  // Process in batches of 5 to avoid rate limits
  const BATCH_SIZE = 5;
  let successCount = 0;
  
  for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
    const batch = wallets.slice(i, i + BATCH_SIZE);
    
    for (const wallet of batch) {
      try {
        const destPubkey = new PublicKey(wallet.publicKey);
        const destAta = await getAssociatedTokenAddress(USDC_MINT, destPubkey);
        
        const tx = new Transaction();
        
        // 1. Send SOL
        tx.add(SystemProgram.transfer({
          fromPubkey: master.publicKey,
          toPubkey: destPubkey,
          lamports: Math.floor(SOL_PER_WALLET * LAMPORTS_PER_SOL),
        }));
        
        // 2. Create ATA if needed
        try {
          await getAccount(connection, destAta);
        } catch {
          tx.add(createAssociatedTokenAccountInstruction(
            master.publicKey,
            destAta,
            destPubkey,
            USDC_MINT
          ));
        }
        
        // 3. Send USDC
        tx.add(createTransferInstruction(
          masterAta,
          destAta,
          master.publicKey,
          Math.floor(USDC_PER_WALLET * 1_000_000)
        ));
        
        await sendAndConfirmTransaction(connection, tx, [master]);
        successCount++;
        console.log(`  ✅ ${wallet.index + 1}/${WALLET_COUNT}: ${wallet.publicKey.slice(0, 8)}...`);
        
      } catch (error) {
        console.log(`  ❌ ${wallet.index + 1}/${WALLET_COUNT}: ${error.message.slice(0, 50)}`);
      }
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < wallets.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`\n✅ Dispersed to ${successCount}/${WALLET_COUNT} wallets`);
}

/**
 * Check status of all wallets
 */
async function checkStatus() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const master = getMasterKeypair();
  const wallets = loadWallets();
  
  console.log('\n📊 Checking balances...\n');
  
  // Master
  const masterBal = await getBalances(connection, master.publicKey);
  console.log(`Master: ${masterBal.sol.toFixed(4)} SOL, ${masterBal.usdc.toFixed(4)} USDC`);
  console.log('');
  
  let totalSol = 0;
  let totalUsdc = 0;
  let fundedCount = 0;
  
  for (const wallet of wallets) {
    const bal = await getBalances(connection, new PublicKey(wallet.publicKey));
    totalSol += bal.sol;
    totalUsdc += bal.usdc;
    if (bal.usdc >= 0.01) fundedCount++;
    
    // Rate limit
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\nTotal across ${WALLET_COUNT} wallets:`);
  console.log(`  SOL: ${totalSol.toFixed(4)}`);
  console.log(`  USDC: ${totalUsdc.toFixed(4)}`);
  console.log(`  Funded (>=0.01 USDC): ${fundedCount}/${WALLET_COUNT}`);
}

/**
 * Create wallet adapter for x402
 */
function createWalletAdapter(keypair) {
  return {
    publicKey: keypair.publicKey,
    address: keypair.publicKey.toBase58(),
    signTransaction: async (tx) => {
      tx.sign([keypair]);
      return tx;
    },
  };
}

/**
 * Make x402 request
 */
async function makeX402Request(keypair) {
  const { createX402Client } = await import('x402-solana/client');
  
  const wallet = createWalletAdapter(keypair);
  const client = createX402Client({
    wallet,
    network: 'solana',
    rpcUrl: RPC_URL,
    maxPaymentAmount: BigInt(100_000),
  });
  
  const response = await client.fetch(TARGET_URL, { method: 'GET' });
  
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Run the stress test
 */
async function runStressTest() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallets = loadWallets();
  
  console.log('\n🚀 Starting x402 Stress Test');
  console.log(`   Target: ${TARGET_URL}`);
  console.log(`   Wallets: ${WALLET_COUNT}`);
  console.log(`   Interval: ${INTERVAL_MS / 1000}s (${INTERVAL_MS / 60000} min)`);
  console.log('');
  
  // Filter to funded wallets
  console.log('📊 Checking funded wallets...');
  const fundedWallets = [];
  
  for (const wallet of wallets) {
    const bal = await getBalances(connection, new PublicKey(wallet.publicKey));
    if (bal.usdc >= 0.01) {
      fundedWallets.push({ ...wallet, balance: bal.usdc });
    }
    await new Promise(r => setTimeout(r, 50));
  }
  
  console.log(`   Found ${fundedWallets.length} funded wallets\n`);
  
  if (fundedWallets.length === 0) {
    console.error('❌ No funded wallets! Run --disperse first.');
    return;
  }
  
  let currentIndex = 0;
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();
  
  const runTransaction = async () => {
    const wallet = fundedWallets[currentIndex];
    const keypair = getKeypair(wallet);
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TX #${successCount + failCount + 1} | Wallet ${currentIndex + 1}/${fundedWallets.length} | ${elapsed}s elapsed`);
    console.log(`Wallet: ${wallet.publicKey.slice(0, 12)}...${wallet.publicKey.slice(-8)}`);
    console.log(`${'='.repeat(60)}`);
    
    try {
      console.log('📤 Making x402 payment...');
      const result = await makeX402Request(keypair);
      successCount++;
      console.log(`✅ Success! Tasks: ${result.tasks?.length || 0}`);
    } catch (error) {
      failCount++;
      console.log(`❌ Failed: ${error.message}`);
    }
    
    console.log(`📈 Stats: ${successCount} success, ${failCount} failed`);
    
    // Next wallet
    currentIndex = (currentIndex + 1) % fundedWallets.length;
  };
  
  // Run first immediately
  await runTransaction();
  
  // Then every 2 minutes
  console.log(`\n⏰ Next transaction in ${INTERVAL_MS / 1000}s...`);
  
  setInterval(async () => {
    await runTransaction();
    console.log(`\n⏰ Next transaction in ${INTERVAL_MS / 1000}s...`);
  }, INTERVAL_MS);
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--generate')) {
    generateWallets();
  } else if (args.includes('--disperse')) {
    await disperseFunds();
  } else if (args.includes('--status')) {
    await checkStatus();
  } else if (args.includes('--run')) {
    await runStressTest();
  } else {
    console.log(`
x402 100 Wallets Stress Test
============================

Master Wallet: 9HKwpWZAVLvqnx2iGgCBwxUi5qNNa1zi5cavSdQmTB84

Commands:
  --generate   Generate 100 wallets
  --disperse   Disperse SOL + USDC from master to all wallets
  --status     Check balances of all wallets
  --run        Start the stress test (1 tx every 2 min)

Steps:
  1. Send SOL (~0.25) + USDC (~2) to master wallet
  2. Run: node scripts/x402-100-wallets.js --generate
  3. Run: node scripts/x402-100-wallets.js --disperse
  4. Run: node scripts/x402-100-wallets.js --status
  5. Run: node scripts/x402-100-wallets.js --run
`);
  }
}

main().catch(console.error);
