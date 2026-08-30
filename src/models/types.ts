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
