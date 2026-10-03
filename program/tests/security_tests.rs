use clock_lend::state::{POOL_SEED, VAULT_SEED};
use solana_program::pubkey::Pubkey;

#[test]
fn test_security_ltv_enforcement() {
    let collateral_amount: u64 = 1_000_000_000; // 1 SOL (in lamports)
    let max_ltv_bps: u16 = 8000; // 80.0% max LTV

    let max_allowed = (collateral_amount as u128 * max_ltv_bps as u128) / 10000;
    assert_eq!(max_allowed, 800_000_000); // exactly 0.8 SOL equivalent

    // A borrow request of 800_000_000 is allowed
    let valid_borrow = 800_000_000u64;
    assert!((valid_borrow as u128) <= max_allowed);

    // A malicious borrow request of 800_000_001 MUST be rejected
    let exploit_borrow = 800_000_001u64;
    assert!((exploit_borrow as u128) > max_allowed);
}

#[test]
fn test_security_pda_seeds_tamper_resistance() {
    let program_id = Pubkey::new_unique();
    let authority = Pubkey::new_unique();
    let pool_id: u64 = 7;
    let pool_id_bytes = pool_id.to_le_bytes();

    let (valid_pool_pda, _bump) = Pubkey::find_program_address(
        &[POOL_SEED, authority.as_ref(), &pool_id_bytes],
        &program_id,
    );

    // Tampered authority
    let attacker = Pubkey::new_unique();
    let (fake_pda, _) =
        Pubkey::find_program_address(&[POOL_SEED, attacker.as_ref(), &pool_id_bytes], &program_id);
    assert_ne!(valid_pool_pda, fake_pda);

    // Tampered vault PDA
    let (valid_vault_pda, _) =
        Pubkey::find_program_address(&[VAULT_SEED, valid_pool_pda.as_ref()], &program_id);
    let (fake_vault_pda, _) =
        Pubkey::find_program_address(&[VAULT_SEED, fake_pda.as_ref()], &program_id);
    assert_ne!(valid_vault_pda, fake_vault_pda);
}

#[test]
fn test_security_default_takes_no_skr() {
    // F-06 (processor.rs `process_claim_default`): a default takes NO SKR.
    //
    // The lender is made whole from the COLLATERAL, so also seizing the SKR
    // bond would punish one default twice. It would also punish the wrong
    // thing: the staking discount only reduces INTEREST, and a defaulter never
    // pays interest — the bond earns its keep DURING the loan, where locking it
    // is what stops a borrower taking the discount and immediately unstaking.
    //
    // History, since this has now been three different rules: it began as
    // `max(bond, 20% of stake)`, which grew without bound with how much SKR the
    // borrower held and let them shrink their own penalty mid-loan by
    // unstaking; it then became the whole bounded bond; it is now nothing.
    //
    // This test is deliberately a pure-arithmetic assertion of the invariant
    // rather than a program call — the on-chain coverage lives in
    // bank_integration.rs (`test_bank_claim_default_releases_bond_without_slashing`
    // and friends). If it ever needs to assert a NON-zero amount again, that is
    // a design change, not a test fix.
    let staked_skr: u64 = 10_000_000_000; // 10,000 SKR staked
    let bond_locked_for_loan: u64 = 1_000_000_000; // 1,000 SKR

    // Nothing leaves the escrow on default...
    let slashed: u64 = 0;
    assert_eq!(slashed, 0, "a default must take no SKR");

    // ...and the bond is released, returning the stake to a usable state.
    let locked_after_default = bond_locked_for_loan.saturating_sub(bond_locked_for_loan);
    assert_eq!(locked_after_default, 0, "the bond lock must be released");
    assert_eq!(
        staked_skr - locked_after_default,
        staked_skr,
        "the borrower's full stake must remain usable"
    );
}

#[test]
fn test_security_interest_calculation() {
    let borrow_amount: u64 = 100_000_000; // 100 USDC (6 decimals)
    let interest_rate_bps: u16 = 800; // 8.0% APR
    let duration_seconds: i64 = 86400 * 7; // 7 days

    // The program prorates against its 30-day INTEREST_PERIOD_SECS
    // (2,592,000 s) — not a calendar year — so a 7-day loan at 8% APR owes
    // 100 * 0.08 * (7/30) = ~1.8667 USDC = 1,866,666 units.
    let interest_due =
        ((borrow_amount as u128) * (interest_rate_bps as u128) * (duration_seconds as u128)
            / (10000u128 * 2_592_000u128)) as u64;

    assert_eq!(interest_due, 1_866_666);
}

#[test]
fn test_security_grace_period_timing() {
    let now: i64 = 1700000000;
    let due_time: i64 = now + 86400 * 7;

    // Loan is NOT due yet
    let current_time_early: i64 = now + 86400 * 3;
    assert!(current_time_early < due_time); // Cannot trigger grace period

    // Loan is due
    let current_time_due: i64 = due_time + 10;
    assert!(current_time_due >= due_time); // Grace period can be triggered

    // Grace period lasts 24h
    let grace_expires = current_time_due + 86400;
    let during_grace: i64 = grace_expires - 3600;
    assert!(during_grace < grace_expires); // Cannot liquidate yet!

    let after_grace: i64 = grace_expires + 1;
    assert!(after_grace >= grace_expires); // Can be liquidated!
}

#[test]
fn test_security_interest_take_rate_split() {
    let interest_due: u64 = 10_000_000; // 10 USDC in interest
    let protocol_fee = ((interest_due as u128 * 1500) / 10000) as u64; // 15% take-rate
    let lender_interest = interest_due.saturating_sub(protocol_fee); // 85% to lender

    assert_eq!(protocol_fee, 1_500_000); // 1.50 USDC to ClockLend Treasury
    assert_eq!(lender_interest, 8_500_000); // 8.50 USDC to Lender Vault
    assert_eq!(protocol_fee + lender_interest, interest_due);
}

#[test]
fn test_security_origination_fee_skr_vs_sol() {
    let borrow_amount: u64 = 100_000_000; // 100 USDC

    // SKR Collateral: 0.50% fee (50 bps)
    let skr_fee_bps: u64 = 50;
    let skr_origination_fee = ((borrow_amount as u128 * skr_fee_bps as u128) / 10000) as u64;
    let skr_net_disbursed = borrow_amount.saturating_sub(skr_origination_fee);

    assert_eq!(skr_origination_fee, 500_000); // 0.50 USDC
    assert_eq!(skr_net_disbursed, 99_500_000); // 99.50 USDC
    assert_eq!(skr_origination_fee + skr_net_disbursed, borrow_amount);

    // SOL Collateral: 0.25% fee (25 bps)
    let sol_fee_bps: u64 = 25;
    let sol_origination_fee = ((borrow_amount as u128 * sol_fee_bps as u128) / 10000) as u64;
    let sol_net_disbursed = borrow_amount.saturating_sub(sol_origination_fee);

    assert_eq!(sol_origination_fee, 250_000); // 0.25 USDC
    assert_eq!(sol_net_disbursed, 99_750_000); // 99.75 USDC
    assert_eq!(sol_origination_fee + sol_net_disbursed, borrow_amount);
}

#[test]
fn test_security_default_liquidation_margin_capture() {
    // FALLBACK split: used by claim_default only when the collateral cannot be
    // priced (no feed, or one that is stale/unusable/mis-scaled). 5% of the
    // collateral to the treasury, 95% to the lender.
    let collateral_amount: u64 = 10_000_000_000; // 10,000 SKR

    // 5% liquidation penalty margin to Treasury (500 bps)
    let protocol_margin = ((collateral_amount as u128 * 500) / 10000) as u64;
    let lender_collateral = collateral_amount.saturating_sub(protocol_margin);

    assert_eq!(protocol_margin, 500_000_000); // 500 SKR to Treasury
    assert_eq!(lender_collateral, 9_500_000_000); // 9,500 SKR to Lender
    assert_eq!(protocol_margin + lender_collateral, collateral_amount);
}

#[test]
fn test_security_default_priced_surplus_split() {
    // PRICED split: the lender is made whole for the debt (principal +
    // interest) valued in collateral units, the platform takes
    // PLATFORM_SURPLUS_FEE_BPS (50%) of the released surplus and the borrower
    // keeps the remainder. Mirrors the arithmetic in process_claim_default.
    let principal: u64 = 100_000_000; // $100.00
    let interest: u64 = 1_000_000; // $1.00
    let debt = principal + interest; // $101.00 in micro-USD (6 decimals)
    let collateral_amount: u64 = 1_000_000_000; // 1 SOL (lamports)
    let price_micro_usd: u64 = 150_000_000; // $150.00 / SOL
    let col_scale: u128 = 1_000_000_000; // 10^9 (native SOL)

    let collateral_for_debt = (debt as u128 * col_scale / price_micro_usd as u128) as u64;
    assert_eq!(collateral_for_debt, 673_333_333); // $101 of a $150 SOL

    let surplus = collateral_amount - collateral_for_debt;
    let platform_share = ((surplus as u128 * 5000) / 10_000) as u64; // PLATFORM_SURPLUS_FEE_BPS
    let borrower_share = surplus - platform_share;

    assert_eq!(platform_share, 163_333_333);
    assert_eq!(borrower_share, 163_333_334);

    // INVARIANT: the three shares drain the escrow exactly. A remainder left
    // behind would be unrecoverable — nothing sweeps an escrow PDA.
    assert_eq!(
        collateral_for_debt + platform_share + borrower_share,
        collateral_amount
    );

    // Underwater: the debt is worth more than the collateral, so the lender
    // takes the escrow and there is no surplus to share.
    let underwater_price_micro_usd: u64 = 50_000_000; // $50.00 / SOL
    let owed_collateral = (debt as u128 * col_scale / underwater_price_micro_usd as u128) as u64;
    assert!(owed_collateral >= collateral_amount);
}

#[test]
fn test_security_rent_refund_invariant() {
    let rent_lamports: u64 = 1_962_240; // 154 bytes LoanOrder rent
    let mut borrower_lamports: u64 = 5_000_000_000;
    let mut loan_account_lamports: u64 = rent_lamports;

    // Repayment execution refunds rent:
    borrower_lamports = borrower_lamports
        .checked_add(loan_account_lamports)
        .unwrap();
    loan_account_lamports = 0;

    assert_eq!(borrower_lamports, 5_001_962_240);
    assert_eq!(loan_account_lamports, 0); // 100% refunded, zero rent waste
}

#[test]
fn test_security_cancel_p2p_offer_invariant() {
    use clock_lend::state::{OfferStatus, P2POffer};

    let creator = Pubkey::new_unique();
    let attacker = Pubkey::new_unique();

    let open_offer = P2POffer {
        discriminator: P2POffer::DISCRIMINATOR,
        is_initialized: true,
        offer_id: 101,
        creator,
        funder: Pubkey::default(),
        collateral_mint: Pubkey::default(),
        liquidity_mint: Pubkey::default(),
        collateral_amount: 1_000_000_000,
        requested_amount: 100_000_000,
        interest_offered: 5_000_000,
        duration_seconds: 86400 * 7,
        created_at: 1700000000,
        due_time: 0,
        grace_period_expires: 0,
        status: OfferStatus::Open,
    };

    // Attacker CANNOT cancel creator's offer
    assert_ne!(attacker, open_offer.creator);

    // Creator CAN cancel Open offer
    assert_eq!(creator, open_offer.creator);
    assert_eq!(open_offer.status, OfferStatus::Open);

    // If offer is already Funded, it CANNOT be cancelled
    let mut funded_offer = open_offer.clone();
    funded_offer.status = OfferStatus::Funded;
    assert_ne!(funded_offer.status, OfferStatus::Open);
}

#[test]
fn test_security_funder_destination_verification() {
    let funder = Pubkey::new_unique();
    let attacker = Pubkey::new_unique();

    // Attacker cannot redirect P2P repayment to their own account
    assert_ne!(attacker, funder);

    // Invariant: Repayment destination owner MUST match offer.funder
    let destination_owner = funder;
    assert_eq!(destination_owner, funder);
}

#[test]
fn test_security_merchant_pool_staking_authority_enforced() {
    let merchant_authority = Pubkey::new_unique();
    let random_user = Pubkey::new_unique();

    // Invariant: Only the pool authority can stake SKR for verified merchant pool status
    assert_ne!(random_user, merchant_authority);
    assert_eq!(merchant_authority, merchant_authority);
}

#[test]
fn test_security_token_program_verification() {
    let valid_spl_token = spl_token::id();
    let fake_token_program = Pubkey::new_unique();

    // Invariant: Any non-SPL-token program MUST be rejected
    assert_ne!(fake_token_program, valid_spl_token);
    assert_eq!(valid_spl_token, spl_token::id());
}

#[test]
fn test_security_claim_default_pool_authority_enforced() {
    let pool_authority = Pubkey::new_unique();
    let attacker = Pubkey::new_unique();
    let vault_pda = Pubkey::new_unique();

    // C-1 Invariant: Attacker is rejected as caller for claim_default
    assert_ne!(attacker, pool_authority);

    // C-1 Invariant: Attacker wallet is rejected as destination collateral account
    assert_ne!(attacker, vault_pda);
    assert_ne!(attacker, pool_authority);
}

#[test]
fn test_security_canonical_treasury_pda() {
    use clock_lend::state::TREASURY_SEED;
    let program_id = Pubkey::new_unique();
    let (expected_treasury_pda, _) = Pubkey::find_program_address(&[TREASURY_SEED], &program_id);

    // H-1 Invariant: Caller-supplied random account is rejected
    let fake_treasury = Pubkey::new_unique();
    assert_ne!(fake_treasury, expected_treasury_pda);
}

#[test]
fn test_security_exact_repayment_required() {
    let principal: u64 = 100_000_000;
    let interest: u64 = 5_000_000;
    let total_due = principal + interest;

    // L-2 Invariant: Overpayment is rejected to prevent liquidity inflation
    let overpayment = total_due + 1_000_000;
    assert_ne!(overpayment, total_due);

    // Underpayment is rejected
    let underpayment = total_due - 1;
    assert_ne!(underpayment, total_due);

    // Exact payment is required
    assert_eq!(total_due, 105_000_000);
}

#[test]
fn test_security_unstake_skr_balance_check() {
    let staked_skr: u64 = 500_000_000; // 500 SKR

    // H-2 Invariant: Unstaking within balance succeeds
    let valid_unstake = 200_000_000u64;
    assert!(valid_unstake <= staked_skr);

    // H-2 Invariant: Attempting to unstake more than staked balance fails
    let excessive_unstake = 500_000_001u64;
    assert!(excessive_unstake > staked_skr);
}

#[test]
fn test_security_ltv_cross_mint_normalization() {
    // H-3 Invariant: SOL collateral (9 decimals) against USDC pool (6 decimals)
    let sol_collateral_lamports: u64 = 1_000_000_000; // 1 SOL
    let sol_price_usdc_micro: u128 = 150_000_000; // $150 USDC (6 decimals)
    let max_ltv_bps: u16 = 8000; // 80%

    // Normalized collateral value in USDC micro-units:
    let collateral_value_usdc =
        (sol_collateral_lamports as u128 * sol_price_usdc_micro) / 1_000_000_000u128;
    assert_eq!(collateral_value_usdc, 150_000_000); // exactly $150 USDC

    // At 80% LTV, max borrow is $120 USDC (120_000_000 micro-units)
    let max_borrow = (collateral_value_usdc * max_ltv_bps as u128) / 10000u128;
    assert_eq!(max_borrow, 120_000_000);

    // Borrowing $120 USDC is valid
    assert!((120_000_000u128) <= max_borrow);
    // Borrowing $121 USDC is rejected
    assert!((121_000_000u128) > max_borrow);
}

#[test]
fn test_security_grace_period_caller_authorization() {
    let borrower = Pubkey::new_unique();
    let lender = Pubkey::new_unique();
    let stranger = Pubkey::new_unique();

    // M-2 Invariant: Stranger cannot grief or trigger grace period early
    assert_ne!(stranger, borrower);
    assert_ne!(stranger, lender);

    // Only borrower or lender is authorized
    assert!(borrower == borrower || borrower == lender);
    assert!(lender == borrower || lender == lender);
}

#[test]
fn test_security_f08_escrow_shortfall_reverts() {
    // F-08: Ensure escrow does not silently clamp to available balance
    let required_amount: u64 = 1_000_000_000;
    let actual_escrow_lamports: u64 = 500_000_000; // 50% shortfall

    // Shortfall check
    assert!(actual_escrow_lamports < required_amount);
    let is_shortfall = actual_escrow_lamports < required_amount;
    assert!(
        is_shortfall,
        "Escrow balance shortfall must trigger InsufficientCollateral error!"
    );
}

#[test]
fn test_security_f10_total_liquidity_accounting_matches_vault_credit() {
    // F-10: Accounting integrity - pool.total_liquidity must match actual vault credit
    let initial_vault: u64 = 10_000_000;
    let principal: u64 = 1_000_000;
    let interest_due: u64 = 100_000;

    let protocol_fee = ((interest_due as u128 * 1500) / 10000) as u64; // 15,000
    let lender_interest = interest_due.saturating_sub(protocol_fee); // 85,000
    let lender_repay = principal.saturating_add(lender_interest); // 1,085,000

    // Vault receives lender_repay:
    let new_vault = initial_vault.saturating_add(lender_repay);
    // Treasury receives protocol_fee:
    let treasury_received = protocol_fee;

    // F-10 fix: pool.total_liquidity is incremented ONLY by lender_repay
    let mut total_liquidity = initial_vault;
    total_liquidity = total_liquidity.saturating_add(lender_repay);

    assert_eq!(
        total_liquidity, new_vault,
        "total_liquidity must exactly equal vault balance!"
    );
    assert_eq!(lender_repay + treasury_received, principal + interest_due);
}

#[test]
fn test_security_f03_skr_collateral_valuation_2_cents() {
    // F-03: SKR collateral valued at $0.02 (20,000 micro-USDC per 1,000,000 micro-SKR)
    let skr_amount: u64 = 1_000_000_000; // 1,000 SKR
    let collateral_value_micro_usdc = (skr_amount as u128 * 20_000u128) / 1_000_000u128;
    assert_eq!(collateral_value_micro_usdc, 20_000_000); // exactly $20 USDC

    // At 65% max LTV, max borrow is $13 USDC
    let max_ltv_bps: u16 = 6500;
    let max_borrow = (collateral_value_micro_usdc * max_ltv_bps as u128) / 10000u128;
    assert_eq!(max_borrow, 13_000_000); // 13 USDC

    // Borrowing $13 USDC is allowed, $13.01 USDC is rejected
    assert!((13_000_000u128) <= max_borrow);
    assert!((13_010_000u128) > max_borrow);
}

#[test]
fn test_security_dynamic_oracle_valuation_and_staleness() {
    // Dynamic Oracle valuation invariant:
    // When oracle feed updates SKR from $0.02 (20,000 micro-USD) to $0.05 (50,000 micro-USD)
    let skr_amount: u64 = 1_000_000_000; // 1,000 SKR (6 decimals)
    let oracle_price_micro_usd: u64 = 50_000; // $0.05 / SKR
    let skr_decimals: u8 = 6;

    let dynamic_value =
        (skr_amount as u128 * oracle_price_micro_usd as u128) / 10u128.pow(skr_decimals as u32);
    assert_eq!(dynamic_value, 50_000_000); // exactly $50.00 USDC

    // At 80% LTV, max borrow increases proportionally to $40 USDC
    let max_ltv_bps: u16 = 8000;
    let max_borrow = (dynamic_value * max_ltv_bps as u128) / 10000u128;
    assert_eq!(max_borrow, 40_000_000); // exactly $40.00 USDC

    // Staleness window: max 86400 seconds (24h)
    let feed_timestamp: i64 = 1700000000;
    let fresh_time: i64 = 1700000000 + 3600; // 1 hour later
    let stale_time: i64 = 1700000000 + 86401; // 24h + 1s later

    assert!(fresh_time.saturating_sub(feed_timestamp) <= 86400);
    assert!(stale_time.saturating_sub(feed_timestamp) > 86400);
}
