import { type ClassValue, clsx } from "clsx";

// Combine class names
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

// Truncate wallet address
export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Format USDC amount
export function formatUsdc(amount: number): string {
  return amount.toFixed(2);
}

// Format date relative to now
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const target = new Date(date);
  const diff = target.getTime() - now.getTime();

  const absDiff = Math.abs(diff);
  const isPast = diff < 0;

  const minutes = Math.floor(absDiff / (1000 * 60));
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

  if (isPast) {
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) {
      const remainingMins = minutes % 60;
      return remainingMins > 0 ? `${hours}h ${remainingMins}m ago` : `${hours}h ago`;
    }
    return `${days}d ago`;
  } else {
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m left`;
    if (hours < 24) {
      const remainingMins = minutes % 60;
      return remainingMins > 0 ? `${hours}h ${remainingMins}m left` : `${hours}h left`;
    }
    return `${days}d ${hours % 24}h left`;
  }
}

// Format date for display
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Generate random ID
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Validate URL
export function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

// Check if deadline has passed
export function isDeadlinePassed(deadline: Date | string): boolean {
  return new Date(deadline).getTime() < Date.now();
}
