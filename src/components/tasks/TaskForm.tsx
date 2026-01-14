"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionSignature,
  Connection,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { USDC_MINT_ADDRESS, USDC_DECIMALS, ESCROW_WALLET_ADDRESS } from "@/lib/constants";

// Poll-based transaction confirmation (avoids WebSocket issues with RPC proxy)
async function confirmTransactionPolling(
  connection: Connection,
  signature: TransactionSignature,
  maxRetries = 30,
  intervalMs = 2000
): Promise<{ confirmed: boolean; error?: string }> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (status?.value?.err) {
        return { confirmed: false, error: `Transaction failed: ${JSON.stringify(status.value.err)}` };
      }
      
      if (status?.value?.confirmationStatus === "confirmed" || 
          status?.value?.confirmationStatus === "finalized") {
        return { confirmed: true };
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (err) {
      console.warn(`Confirmation poll ${i + 1} failed:`, err);
      // Continue polling on network errors
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  return { confirmed: false, error: "Transaction confirmation timed out. Please check your wallet for the transaction status." };
}

const categoryOptions = [
  { value: "THREAD", label: "Thread / Tweet" },
  { value: "MEME", label: "Meme" },
  { value: "LOGO", label: "Logo Design" },
  { value: "DESIGN", label: "Design / Artwork" },
  { value: "UI_UX", label: "UI/UX Design" },
  { value: "ARTICLE", label: "Article / Blog" },
  { value: "DOCUMENTATION", label: "Documentation" },
  { value: "CODE", label: "Code / Script" },
  { value: "APP", label: "App / Website" },
  { value: "SMART_CONTRACT", label: "Smart Contract" },
  { value: "MARKETING", label: "Marketing" },
  { value: "VIDEO", label: "Video" },
  { value: "OTHER", label: "Other" },
];

const submissionTypeOptions = [
  { value: "LINK", label: "Link / URL (GitHub, App, Tweet, etc.)" },
  { value: "IMAGE", label: "Image Upload" },
  { value: "TEXT", label: "Text / Description" },
];

export function TaskForm() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"form" | "deposit" | "confirming">("form");
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "THREAD",
    submissionType: "LINK",
    reward: "",
    deadline: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isAuthenticated || !publicKey || !sendTransaction) {
      setError("Please connect your wallet first");
      return;
    }

    if (!formData.title || !formData.description || !formData.reward || !formData.deadline) {
      setError("Please fill in all required fields");
      return;
    }

    const rewardAmount = parseFloat(formData.reward);
    if (rewardAmount < 0.01) {
      setError("Minimum reward is 0.01 USDC");
      return;
    }

    if (!ESCROW_WALLET_ADDRESS) {
      setError("Escrow wallet not configured");
      return;
    }

    setIsLoading(true);
    setStep("deposit");

    try {
      // Step 1: Create USDC transfer transaction to escrow
      const usdcMint = new PublicKey(USDC_MINT_ADDRESS);
      const escrowPubkey = new PublicKey(ESCROW_WALLET_ADDRESS);
      
      // Get token accounts
      const senderTokenAccount = await getAssociatedTokenAddress(usdcMint, publicKey);
      const escrowTokenAccount = await getAssociatedTokenAddress(usdcMint, escrowPubkey);

      // Check sender has enough USDC
      try {
        const senderAccount = await getAccount(connection, senderTokenAccount);
        const balance = Number(senderAccount.amount) / Math.pow(10, USDC_DECIMALS);
        if (balance < rewardAmount) {
          throw new Error(`Insufficient USDC balance. You have ${balance.toFixed(2)} USDC but need ${rewardAmount} USDC`);
        }
      } catch (err) {
        if (err instanceof Error) {
          // Re-throw our own error messages
          if (err.message.includes("Insufficient")) {
            throw err;
          }
          // Check for specific SPL token errors indicating no account
          if (err.name === "TokenAccountNotFoundError" || 
              err.message.includes("could not find account") ||
              err.message.includes("Account does not exist")) {
            throw new Error("You don't have a USDC token account. Please get some USDC first.");
          }
          // For other errors (network, RPC, etc.), show the actual error
          console.error("Error checking USDC balance:", err);
          throw new Error(`Failed to check USDC balance: ${err.message}`);
        }
        throw new Error("Failed to check USDC balance. Please try again.");
      }

      const transaction = new Transaction();

      // Check if escrow has a token account, create if not
      try {
        await getAccount(connection, escrowTokenAccount);
      } catch {
        // Account doesn't exist, create it (sender pays)
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey, // payer
            escrowTokenAccount, // associated token account
            escrowPubkey, // owner
            usdcMint // mint
          )
        );
      }

      // Add transfer instruction
      const amountInRaw = BigInt(Math.round(rewardAmount * Math.pow(10, USDC_DECIMALS)));
      transaction.add(
        createTransferInstruction(
          senderTokenAccount, // from
          escrowTokenAccount, // to
          publicKey, // owner
          amountInRaw // amount
        )
      );

      // Get recent blockhash with "confirmed" commitment for better reliability
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Step 2: Send transaction using wallet adapter (handles signing + sending)
      // This is the recommended approach as it properly handles wallet signing and submission
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      });
      
      setStep("confirming");
      
      // Step 3: Confirm transaction using polling (avoids WebSocket issues with RPC proxy)
      // The RPC proxy only supports HTTP, not WebSocket subscriptions
      const confirmationResult = await confirmTransactionPolling(connection, signature);

      if (!confirmationResult.confirmed) {
        throw new Error(confirmationResult.error || "Transaction confirmation failed");
      }

      // Step 4: Create task with escrow transaction signature
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          reward: rewardAmount,
          deadline: new Date(formData.deadline).toISOString(),
          escrowTxSignature: signature,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create task");
      }

      const { task } = await response.json();
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      console.error("Task creation error:", err);
      
      // Provide user-friendly error messages
      let errorMessage = "Failed to create task";
      if (err instanceof Error) {
        if (err.message.includes("block height exceeded") || err.message.includes("expired")) {
          errorMessage = "Transaction expired. This can happen due to network congestion. Please try again.";
        } else if (err.message.includes("insufficient")) {
          errorMessage = err.message;
        } else if (err.message.includes("User rejected")) {
          errorMessage = "Transaction was cancelled.";
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      setStep("form");
    } finally {
      setIsLoading(false);
    }
  };

  // Set minimum deadline to 1 hour from now
  const minDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  const minDeadline = minDate.toISOString().slice(0, 16);

  const getButtonText = () => {
    if (step === "deposit") return "Approve USDC Transfer...";
    if (step === "confirming") return "Confirming Transaction...";
    if (formData.reward) return `Create Task & Deposit ${formData.reward} USDC`;
    return "Create Task";
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* How it works */}
      <div className="p-4 bg-white/[0.02] border border-white/5 rounded-lg">
        <p className="text-sm font-medium text-white mb-2">How it works</p>
        <ol className="space-y-1 text-sm text-muted-light">
          <li className="flex items-center gap-2">
            <span className="step-number text-[10px] w-5 h-5">1</span>
            You deposit the reward amount (held securely)
          </li>
          <li className="flex items-center gap-2">
            <span className="step-number text-[10px] w-5 h-5">2</span>
            At the deadline, the best submission wins
          </li>
          <li className="flex items-center gap-2">
            <span className="step-number text-[10px] w-5 h-5">3</span>
            Winner gets paid automatically
          </li>
        </ol>
      </div>

      <Input
        label="Title"
        name="title"
        value={formData.title}
        onChange={handleChange}
        placeholder="e.g., Create a viral thread about $BREAD"
        required
        disabled={isLoading}
      />

      <Textarea
        label="Description"
        name="description"
        value={formData.description}
        onChange={handleChange}
        placeholder="Describe what you want participants to create..."
        rows={4}
        required
        disabled={isLoading}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Category"
          name="category"
          value={formData.category}
          onChange={handleChange}
          options={categoryOptions}
          disabled={isLoading}
        />

        <Select
          label="Submission Type"
          name="submissionType"
          value={formData.submissionType}
          onChange={handleChange}
          options={submissionTypeOptions}
          disabled={isLoading}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Reward (USDC)"
          name="reward"
          type="number"
          step="0.01"
          min="0.01"
          value={formData.reward}
          onChange={handleChange}
          placeholder="10"
          required
          disabled={isLoading}
        />

        <Input
          label="Deadline"
          name="deadline"
          type="datetime-local"
          min={minDeadline}
          value={formData.deadline}
          onChange={handleChange}
          required
          disabled={isLoading}
        />
      </div>

      {formData.reward && parseFloat(formData.reward) > 0 && (
        <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg">
          <p className="text-sm font-medium text-primary">
            Deposit Required: {formData.reward} USDC
          </p>
          <p className="text-xs text-muted mt-1">
            To escrow: {ESCROW_WALLET_ADDRESS ? `${ESCROW_WALLET_ADDRESS.slice(0, 8)}...${ESCROW_WALLET_ADDRESS.slice(-6)}` : "Not configured"}
          </p>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {getButtonText()}
        </Button>
      </div>
    </form>
  );
}
