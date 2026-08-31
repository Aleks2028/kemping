export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  telegramId?: number;
  balance: number;       // cents
  pendingBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  totalDeposited: number;
  deposited: boolean;
  referredBy?: string;
  isAdvertiser: boolean;
  isAdmin: boolean;
  banned: boolean;
  createdAt: number;
}

export type TaskType = "subscribe" | "register" | "like" | "view" | "custom";

export interface Task {
  id: string;
  advertiserId: string;
  title: string;
  description: string;
  type: TaskType;
  url: string;
  reward: number;          // cents — what advertiser pays total
  userReward: number;      // cents — what user gets
  platformFee: number;     // cents — platform commission
  totalSlots: number;      // how many users can complete
  remainingSlots: number;
  requiresProof: boolean;
  proofInstructions?: string;
  status: "active" | "paused" | "finished" | "pending_review";
  createdAt: number;
  expiresAt?: number;
}

export interface TaskCompletion {
  id: string;
  taskId: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  proofText?: string;
  proofImage?: string;
  reward: number;
  createdAt: number;
  reviewedAt?: number;
  reviewNote?: string;
}

export interface Withdrawal {
  id: string;
  userId: string;
  method: "usdt_trc20" | "yoomoney" | "card";
  amount: number;          // cents
  fee: number;             // cents
  finalAmount: number;     // cents after fee
  wallet: string;          // wallet / card number
  status: "pending" | "approved" | "rejected" | "paid";
  createdAt: number;
  processedAt?: number;
  txHash?: string;
  rejectReason?: string;
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
  ip?: string;
  userAgent?: string;
}

export interface Advertiser {
  id: string;
  userId: string;
  companyName: string;
  contact: string;
  balance: number;     // cents
  totalSpent: number;
  createdAt: number;
}

export interface VipPackage {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  referralBonusPercent: number;
  dailyTasksBonus: number;
  minWithdrawalCents?: number;
  color: string;
  icon: string;
  sortOrder: number;
  createdAt: number;
}

export interface VipPurchase {
  id: string;
  userId: string;
  packageId: string;
  priceCents: number;
  status: 'active' | 'expired' | 'cancelled';
  startedAt: number;
  expiresAt: number;
  createdAt: number;
}

export interface FaucetClaim {
  id: string;
  userId: string;
  amountCents: number;
  ipAddress?: string;
  createdAt: number;
}

export interface FaucetSettings {
  id: string;
  minAmountCents: number;
  maxAmountCents: number;
  cooldownSeconds: number;
  isActive: boolean;
  createdAt: number;
}
