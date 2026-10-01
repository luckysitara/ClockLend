export type PoolType = 'Individual' | 'Circle' | 'Institutional';

export type LoanStatus = 'Active' | 'InGracePeriod' | 'Repaid' | 'Defaulted';

export type OfferStatus = 'Open' | 'Funded' | 'InGracePeriod' | 'Repaid' | 'Defaulted';

export interface LendingPool {
  id: number;
  poolType: PoolType;
  authority: string;
  name: string;
  liquidityMint: string;
  totalLiquidity: number; // in USDC
  totalBorrowed: number;
  stakedSkrAmount: number;
  interestRateBps: number; // e.g. 800 = 8.0%
  maxLtvBps: number; // e.g. 8500 = 85%
  minDurationDays: number;
  maxDurationDays: number;
  loansOriginated: number;
  loansRepaid: number;
  successRate: number | null; // null = no loan history yet
  isVerifiedMerchant: boolean;
  // Last byte of the 200-byte pool account: the desk pinned its own oracle
  // PDAs, so the borrow tx must carry the pool-scoped feeds (processor.rs
  // round-11 H-3 gate). Always false for legacy 182-byte pools.
  hasCustomOracle: boolean;
}

export interface LoanOrder {
  id: number;
  poolId: number;
  poolName: string;
  borrower: string;
  principalAmount: number; // in USDC
  collateralName: string;
  collateralMint: string;
  collateralAmount: number;
  interestDue: number;
  originationTime: number; // unix timestamp seconds
  dueTime: number; // unix timestamp seconds
  gracePeriodExpires: number;
  status: LoanStatus;
  txSignature?: string;
  escrowAddress?: string;
  solscanUrl?: string;
  poolPubkey?: string;
  /**
   * True when this record came from the local SecureStore cache instead of a
   * confirmed chain read (RPC unavailable). It must be rendered as
   * "last known — not confirmed", never as live on-chain state.
   */
  isStale?: boolean;
  isLender?: boolean;
  lender?: string;
  repaidAt?: number;
}

export interface P2POffer {
  id: number;
  creator: string;
  creatorAvatar?: string;
  funder?: string;
  collateralName: string;
  collateralType: 'NFT' | 'Token';
  collateralAmount: number;
  collateralMint?: string;
  liquidityMint?: string;
  collateralImage?: string;
  requestedAmount: number; // USDC
  interestOffered: number; // USDC
  // Raw base-unit (micro-USD) strings straight from the account bytes — the
  // program's repay check requires EXACT equality, so rounding through Number
  // loses the micro-precision that would reject the transaction.
  requestedAmountRaw?: string;
  interestOfferedRaw?: string;
  durationDays: number;
  createdAt: number;
  dueTime?: number;
  gracePeriodExpires?: number;
  status: OfferStatus;
  txSignature?: string;
  escrowAddress?: string;
  solscanUrl?: string;
}

/**
 * The program's SKR discount bands (processor.rs:1990-2006). There is no
 * reputation-based tiering on-chain — only available SKR is read:
 *   available_skr = staked_skr - locked_skr
 * The discount slides continuously, so `Tier` here is only a coarse label for
 * the band a user currently falls in (see `tierFromAprDiscount`):
 *   >= 10,000 SKR (10_000_000_000 base units) -> 25% discount (Tier 2)
 *   >=    100 SKR (   100_000_000 base units) -> 1%-25% sliding (Tier 1)
 *   otherwise                                 ->  0% discount (Standard)
 */
export type CreditTier = 'Tier 2' | 'Tier 1' | 'Standard';

export interface UserProfile {
  pubkey: string;
  /** staked_skr as human SKR (base units / 1e6). */
  stakedSkr: number;
  /** locked_skr (loan bonds) as human SKR — bytes 59..67 of the profile PDA. */
  lockedSkr: number;
  /** staked_skr - locked_skr: the only balance the program thresholds read. */
  availableSkr: number;
  totalLoansCompleted: number;
  totalLoansDefaulted: number;
  reputationScore: number; // 0 - 10000 bps
  tier: CreditTier;
  /** Exact APR discount the program will grant at borrow time: 0, 25 or 50. */
  aprDiscount: number;
}

export type SolanaNetwork = 'devnet' | 'mainnet-beta';

export interface TokenAssetItem {
  mint: string;
  name: string;
  symbol: string;
  amount: number;
  decimals: number;
  usdValue: number;
  isToken2022?: boolean;
}

export interface WalletAssets {
  network: SolanaNetwork;
  solBalance: number;
  usdcBalance: number;
  skrBalance: number;
  bonkBalance: number;
  hasSeekerGenesisToken: boolean;
  totalUsdValue: number;
  tokenList?: TokenAssetItem[];
}
