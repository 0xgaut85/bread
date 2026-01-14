import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";

// USDC Mint Address on Solana Mainnet
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

// USDC has 6 decimals
export const USDC_DECIMALS = 6;

// Get connection to Solana
export function getConnection(): Connection {
  const rpcUrl =
    process.env.HELIUS_RPC_URL ||
    "https://api.mainnet-beta.solana.com";
  return new Connection(rpcUrl, "confirmed");
}

// Get escrow keypair from private key
export function getEscrowKeypair(): Keypair | null {
  const privateKey = process.env.ESCROW_PRIVATE_KEY;
  if (!privateKey) return null;

  try {
    const decoded = bs58.decode(privateKey);
    return Keypair.fromSecretKey(decoded);
  } catch {
    console.error("Failed to decode escrow private key");
    return null;
  }
}

// Get escrow public key
export function getEscrowPublicKey(): string {
  const keypair = getEscrowKeypair();
  if (!keypair) {
    return process.env.ESCROW_WALLET_ADDRESS || "";
  }
  return keypair.publicKey.toBase58();
}

// Convert USDC amount to raw units (with 6 decimals)
export function usdcToRaw(amount: number): bigint {
  return BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));
}

// Convert raw units to USDC amount
export function rawToUsdc(raw: bigint): number {
  return Number(raw) / Math.pow(10, USDC_DECIMALS);
}

// Get USDC balance for a wallet
export async function getUsdcBalance(walletAddress: string): Promise<number> {
  try {
    const connection = getConnection();
    const wallet = new PublicKey(walletAddress);
    const tokenAccount = await getAssociatedTokenAddress(USDC_MINT, wallet);

    const account = await getAccount(connection, tokenAccount);
    return rawToUsdc(account.amount);
  } catch {
    return 0;
  }
}

// Get escrow USDC balance
export async function getEscrowBalance(): Promise<number> {
  const escrowPubkey = getEscrowPublicKey();
  if (!escrowPubkey) return 0;
  return getUsdcBalance(escrowPubkey);
}

// Transfer USDC from escrow to winner
export async function transferUsdcFromEscrow(
  toWallet: string,
  amount: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const escrowKeypair = getEscrowKeypair();
    if (!escrowKeypair) {
      return { success: false, error: "Escrow keypair not configured. Set ESCROW_PRIVATE_KEY env var." };
    }

    // Check escrow balance first
    const escrowBalance = await getEscrowBalance();
    if (escrowBalance < amount) {
      console.error(`[Escrow] Insufficient balance: ${escrowBalance} USDC, need ${amount} USDC`);
      return { 
        success: false, 
        error: `Insufficient escrow balance: ${escrowBalance.toFixed(2)} USDC available, need ${amount.toFixed(2)} USDC` 
      };
    }

    console.log(`[Escrow] Transferring ${amount} USDC to ${toWallet.slice(0, 8)}... (balance: ${escrowBalance} USDC)`);

    const connection = getConnection();
    const toPublicKey = new PublicKey(toWallet);

    // Get token accounts
    const escrowTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      escrowKeypair.publicKey
    );
    const toTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      toPublicKey
    );

    const transaction = new Transaction();

    // Check if recipient has a token account, create if not
    try {
      await getAccount(connection, toTokenAccount);
    } catch {
      // Account doesn't exist, create it
      transaction.add(
        createAssociatedTokenAccountInstruction(
          escrowKeypair.publicKey, // payer
          toTokenAccount, // associated token account
          toPublicKey, // owner
          USDC_MINT // mint
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        escrowTokenAccount, // from
        toTokenAccount, // to
        escrowKeypair.publicKey, // owner
        usdcToRaw(amount) // amount in raw units
      )
    );

    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [escrowKeypair],
      { commitment: "confirmed" }
    );

    console.log(`[Escrow] Transfer successful: ${signature}`);
    return { success: true, signature };
  } catch (error) {
    console.error("[Escrow] Transfer error:", error);
    
    // Provide more specific error messages
    const errorMessage = error instanceof Error ? error.message : "Transfer failed";
    
    if (errorMessage.includes("insufficient")) {
      return { success: false, error: "Insufficient SOL for transaction fees or insufficient USDC balance" };
    }
    if (errorMessage.includes("blockhash")) {
      return { success: false, error: "Transaction expired. Please try again." };
    }
    
    return { success: false, error: errorMessage };
  }
}

// Verify a USDC deposit to escrow
export async function verifyUsdcDeposit(
  txSignature: string,
  expectedAmount: number
): Promise<{ verified: boolean; error?: string }> {
  try {
    const connection = getConnection();
    const escrowPubkey = getEscrowPublicKey();

    if (!escrowPubkey) {
      return { verified: false, error: "Escrow not configured" };
    }

    // Get transaction details
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: "Transaction not found" };
    }

    if (tx.meta?.err) {
      return { verified: false, error: "Transaction failed" };
    }

    // Look through post token balances for the escrow account
    const postBalances = tx.meta?.postTokenBalances || [];
    const preBalances = tx.meta?.preTokenBalances || [];

    for (const postBalance of postBalances) {
      if (
        postBalance.mint === USDC_MINT.toBase58() &&
        postBalance.owner === escrowPubkey
      ) {
        // Find matching pre-balance
        const preBalance = preBalances.find(
          (pre) =>
            pre.accountIndex === postBalance.accountIndex &&
            pre.mint === USDC_MINT.toBase58()
        );

        const preAmount = preBalance?.uiTokenAmount?.uiAmount || 0;
        const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
        const received = postAmount - preAmount;

        if (received >= expectedAmount * 0.99) {
          // Allow 1% tolerance
          return { verified: true };
        }
      }
    }

    return { verified: false, error: "USDC transfer to escrow not found" };
  } catch (error) {
    console.error("Verification error:", error);
    return {
      verified: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}
