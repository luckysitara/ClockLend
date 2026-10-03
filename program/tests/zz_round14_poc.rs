// Round-14 regression tests: the fresh-eyes audit PoCs were inverted into
// assertions of the SAFE behavior after the round-14 program fixes.
//
// REG-1: when the yield-vault leg cannot pay (accounts present but unusable),
//        the FULL origination fee routes to the treasury and the vault /
//        total_liquidity accounting identity holds (no stranded half).
//
// REG-2: CreateP2POffer defaults the loan asset to the MAINNET USDC mint when
//        no mint account is appended, so a mainnet funder can always fund it.
//
// REG-3: on oracle-free pools the borrower can never price collateral ABOVE
//        the hardcoded baseline: a live feed is taken at min(baseline, live).
//
// REG-4: CreateP2POffer is capped by the same MAX_LTV_BPS (7000) as the pool
//        path — 70% is accepted, 75% reverts InvalidCollateralRatio.
//
// REG-5: the permissionless borrow path PARKS its half-fee yield (credits
//        unallocated/pending without moving acc_reward_per_share); only the
//        authority-gated DepositSkrYield folds the backlog into share value.
//
// Run: cargo test --test zz_round14_poc -- --nocapture
use clock_lend::{
    instruction::ClockLendInstruction,
    processor::process_instruction,
    state::{
        LendingPool, PoolType, ESCROW_SEED, LOAN_SEED, POOL_SEED, PROFILE_SEED,
        SKR_YIELD_TOKEN_SEED, SKR_YIELD_VAULT_SEED, TREASURY_SEED, USDC_DEVNET_MINT,
        USDC_MAINNET_MINT, USER_YIELD_SEED, VAULT_SEED,
    },
};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    program_pack::Pack,
    pubkey::Pubkey,
};
use solana_program_test::*;
use solana_sdk::{
    account::Account,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};

const USDC: u64 = 1_000_000;
const SYS: Pubkey = solana_program::system_program::ID;

/// Scale of SkrYieldVault::acc_reward_per_share (mirrors YIELD_SCALE in
/// processor.rs, which is private to the program crate).
const YIELD_SCALE: u128 = 1_000_000_000_000;

fn tok(mint: Pubkey, owner: Pubkey, amount: u64) -> Vec<u8> {
    let mut a = spl_token::state::Account::unpack_unchecked(&[0u8; 165]).unwrap();
    a.mint = mint;
    a.owner = owner;
    a.amount = amount;
    a.state = spl_token::state::AccountState::Initialized;
    let mut b = vec![0u8; 165];
    spl_token::state::Account::pack(a, &mut b).unwrap();
    b
}
fn mint_data(d: u8) -> Vec<u8> {
    let mut m = spl_token::state::Mint::unpack_unchecked(&[0u8; 82]).unwrap();
    m.mint_authority = spl_token::solana_program::program_option::COption::None;
    m.supply = u64::MAX;
    m.decimals = d;
    m.is_initialized = true;
    let mut b = vec![0u8; 82];
    spl_token::state::Mint::pack(m, &mut b).unwrap();
    b
}
async fn send(
    bc: &mut BanksClient,
    ix: Instruction,
    sg: &[&Keypair],
    pay: &Keypair,
    bh: solana_program::hash::Hash,
) -> Result<(), BanksClientError> {
    let mut tx = Transaction::new_with_payer(&[ix], Some(&pay.pubkey()));
    let n = tx.message.header.num_required_signatures as usize;
    let need: Vec<&Keypair> = sg
        .iter()
        .copied()
        .filter(|k| tx.message.account_keys[..n].contains(&k.pubkey()))
        .collect();
    tx.partial_sign(&need, bh);
    bc.process_transaction(tx).await
}
async fn token_amount(bc: &mut BanksClient, pk: Pubkey) -> u64 {
    match bc.get_account(pk).await.unwrap() {
        Some(a) if a.owner == spl_token::id() && a.data.len() >= 165 => {
            spl_token::state::Account::unpack(&a.data).unwrap().amount
        }
        _ => 0,
    }
}

/// Mirror of bank_integration.rs's helper: asserts the transaction failed with
/// the given ClockLendError code.
fn expect_custom_error(res: &Result<(), BanksClientError>, code: u32, ctx: &str) {
    let err = match res.as_ref().err() {
        Some(e) => format!("{e:?}"),
        None => panic!("{ctx}: expected failure, but the transaction SUCCEEDED"),
    };
    if !err.contains(&format!("Custom({code})")) {
        panic!("{ctx}: expected Custom({code}), got {err}");
    }
}

/// Genesis-pack a pre-initialized SKR yield vault (the skr_yield_and_lst_tests
/// convention: the vault and its stakers already exist when the money path
/// under test runs).
fn yield_vault_data(
    authority: Pubkey,
    reward_mint: Pubkey,
    total_staked_skr: u64,
    acc_reward_per_share: u128,
    total_rewards_distributed: u64,
    pending_rewards: u64,
    unallocated_rewards: u64,
) -> Vec<u8> {
    use clock_lend::state::{SkrYieldVault, DISCRIMINATOR_SKR_YIELD};
    let vault = SkrYieldVault {
        discriminator: DISCRIMINATOR_SKR_YIELD,
        is_initialized: true,
        authority,
        reward_mint,
        total_staked_skr,
        acc_reward_per_share,
        total_rewards_distributed,
        pending_rewards,
        unallocated_rewards,
    };
    let mut b = vec![0u8; SkrYieldVault::LEN];
    vault.pack_into_slice(&mut b).unwrap();
    b
}

/// Genesis-pack a pre-synced user yield position (stake already counted in
/// vault.total_staked_skr).
fn yield_position_data(user: Pubkey, reward_mint: Pubkey, staked_skr: u64) -> Vec<u8> {
    use clock_lend::state::{UserYieldPosition, DISCRIMINATOR_USER_YIELD};
    let pos = UserYieldPosition {
        discriminator: DISCRIMINATOR_USER_YIELD,
        is_initialized: true,
        user,
        reward_mint,
        staked_skr,
        reward_debt: 0,
        accrued_rewards: 0,
        total_claimed: 0,
        last_interaction_time: 0,
    };
    let mut b = vec![0u8; UserYieldPosition::LEN];
    pos.pack_into_slice(&mut b).unwrap();
    b
}

async fn read_yield_vault(bc: &mut BanksClient, pda: Pubkey) -> clock_lend::state::SkrYieldVault {
    clock_lend::state::SkrYieldVault::unpack_from_slice(
        &bc.get_account(pda).await.unwrap().unwrap().data,
    )
    .unwrap()
}

// ---------------------------------------------------------------------------
// REG-1: the full origination fee routes to the treasury when the yield leg
//        cannot pay out (round-14 fix for the fee-stranding PoC)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn regression_fee_split_routes_full_fee_when_yield_leg_cannot_pay() {
    let pid = clock_lend::id();
    let usdc = USDC_DEVNET_MINT;
    let authority = Keypair::new();
    let borrower = Keypair::new();

    let (pool, _) = Pubkey::find_program_address(
        &[POOL_SEED, authority.pubkey().as_ref(), &1u64.to_le_bytes()],
        &pid,
    );
    let (vault, _) = Pubkey::find_program_address(&[VAULT_SEED, pool.as_ref()], &pid);
    let (treasury_pda, _) = Pubkey::find_program_address(&[TREASURY_SEED], &pid);
    // NOTE: the protocol's yield vault for this mint is deliberately NOT
    // initialized — exactly the state of a freshly deployed mint (e.g. a new
    // mainnet USDC pool before the admin runs InitializeSkrYieldVault).
    let (yield_vault, _) =
        Pubkey::find_program_address(&[SKR_YIELD_VAULT_SEED, usdc.as_ref()], &pid);
    let (yield_token, _) =
        Pubkey::find_program_address(&[SKR_YIELD_TOKEN_SEED, usdc.as_ref()], &pid);

    let mut pt = ProgramTest::new("clock_lend", pid, processor!(process_instruction));
    pt.add_account(
        usdc,
        Account {
            lamports: 100_000_000_000,
            data: mint_data(6),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let treasury_tok = Pubkey::new_unique();
    pt.add_account(
        treasury_tok,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, treasury_pda, 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let authority_usdc = Pubkey::new_unique();
    pt.add_account(
        authority_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, authority.pubkey(), 1_000 * USDC),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let borrower_usdc = Pubkey::new_unique();
    pt.add_account(
        borrower_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, borrower.pubkey(), 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let (mut bc, payer, bh) = pt.start().await;
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &authority.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();
    // Native-SOL collateral needs real lamports on the borrower.
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &borrower.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();

    // Oracle-free pool: no feed needed, 30% LTV cap applies.
    let init_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new_readonly(usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::InitializePool {
            pool_id: 1,
            pool_type: PoolType::Individual,
            interest_rate_bps: 800,
            max_ltv_bps: 3000,
            min_duration: 86_400,
            max_duration: 86_400 * 30,
            name: [7u8; 32],
            is_oracle_free: true,
        })
        .unwrap(),
    };
    send(&mut bc, init_ix, &[&payer, &authority], &payer, bh)
        .await
        .expect("init pool");

    let dep_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(authority_usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::DepositLiquidity {
            amount: 1_000 * USDC,
        })
        .unwrap(),
    };
    send(&mut bc, dep_ix, &[&payer, &authority], &payer, bh)
        .await
        .expect("deposit");

    let borrow_amount: u64 = 40 * USDC; // 1 SOL collateral = $150 at baseline -> 30% = $45
    let collateral: u64 = 1_000_000_000; // 1 SOL

    let mk_borrow = |loan_id: u64, with_yield_accounts: bool| {
        let loan_id_bytes = loan_id.to_le_bytes();
        let (loan, _) = Pubkey::find_program_address(
            &[
                LOAN_SEED,
                pool.as_ref(),
                borrower.pubkey().as_ref(),
                &loan_id_bytes,
            ],
            &pid,
        );
        let (escrow, _) = Pubkey::find_program_address(&[ESCROW_SEED, loan.as_ref()], &pid);
        let (profile, _) =
            Pubkey::find_program_address(&[PROFILE_SEED, borrower.pubkey().as_ref()], &pid);
        let mut accounts = vec![
            AccountMeta::new(borrower.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(loan, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(borrower_usdc, false),
            AccountMeta::new(borrower.pubkey(), false),
            AccountMeta::new(escrow, false),
            AccountMeta::new_readonly(SYS, false), // native-SOL collateral mint
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new(profile, false),
            AccountMeta::new(treasury_tok, false),
        ];
        if with_yield_accounts {
            // Pure opt-in by the caller: these two PDAs need not exist.
            accounts.push(AccountMeta::new(yield_vault, false));
            accounts.push(AccountMeta::new(yield_token, false));
        }
        Instruction {
            program_id: pid,
            accounts,
            data: borsh::to_vec(&ClockLendInstruction::BorrowFromPool {
                loan_id,
                borrow_amount,
                collateral_amount: collateral,
                duration_seconds: 86_400 * 7,
            })
            .unwrap(),
        }
    };

    let vault_before = token_amount(&mut bc, vault).await;
    let treasury_before = token_amount(&mut bc, treasury_tok).await;

    // --- Borrow #1: caller appends the (uninitialized) yield-vault PDAs ------
    let bh1 = bc.get_latest_blockhash().await.unwrap();
    send(
        &mut bc,
        mk_borrow(1, true),
        &[&payer, &borrower],
        &payer,
        bh1,
    )
    .await
    .expect("borrow with yield accounts");

    let vault_after = token_amount(&mut bc, vault).await;
    let treasury_after = token_amount(&mut bc, treasury_tok).await;
    let pool_state =
        LendingPool::unpack_from_slice(&bc.get_account(pool).await.unwrap().unwrap().data).unwrap();

    let fee = borrow_amount * 25 / 10_000; // 0.25% for SOL collateral
    println!(
        "REG-1 borrow#1 (yield PDAs appended): fee={fee} treasury_received={} vault_delta={}",
        treasury_after - treasury_before,
        vault_before - vault_after
    );
    println!(
        "        vault_balance={vault_after} pool.total_liquidity={} surplus={}",
        pool_state.total_liquidity,
        vault_after - pool_state.total_liquidity
    );
    assert_eq!(
        treasury_after - treasury_before,
        fee,
        "the FULL fee must reach the treasury when the yield leg cannot pay"
    );
    assert_eq!(
        vault_after - pool_state.total_liquidity,
        0,
        "no fee may be stranded: vault balance must stay exactly total_liquidity"
    );

    // --- Control: same borrow without the yield PDAs -------------------------
    let vault_b2 = token_amount(&mut bc, vault).await;
    let treasury_b2 = token_amount(&mut bc, treasury_tok).await;
    let bh2 = bc.get_latest_blockhash().await.unwrap();
    send(
        &mut bc,
        mk_borrow(2, false),
        &[&payer, &borrower],
        &payer,
        bh2,
    )
    .await
    .expect("borrow without yield accounts");
    let vault_a2 = token_amount(&mut bc, vault).await;
    let treasury_a2 = token_amount(&mut bc, treasury_tok).await;
    let pool_state2 =
        LendingPool::unpack_from_slice(&bc.get_account(pool).await.unwrap().unwrap().data).unwrap();
    println!(
        "REG-1 borrow#2 (no yield PDAs):         fee={fee} treasury_received={} vault_delta={} surplus={}",
        treasury_a2 - treasury_b2,
        vault_b2 - vault_a2,
        vault_a2 - pool_state2.total_liquidity
    );
    assert_eq!(
        treasury_a2 - treasury_b2,
        fee,
        "control: the full fee reaches the treasury when the yield leg is absent"
    );
    assert_eq!(vault_a2 - pool_state2.total_liquidity, 0);
    println!(
        "REG-1 PASS: appending two empty PDAs no longer halves protocol revenue or strands funds."
    );
}

// ---------------------------------------------------------------------------
// REG-3a: on an `is_oracle_free` pool a live feed BELOW the baseline prices
//         collateral at the live value (min(baseline, live)) — the borrower
//         can no longer inflate the valuation by passing the feed.
// ---------------------------------------------------------------------------
#[tokio::test]
async fn regression_oracle_free_never_prices_above_baseline() {
    let pid = clock_lend::id();
    let usdc = USDC_DEVNET_MINT;
    let skr = clock_lend::state::SKR_MINT;
    let authority = Keypair::new();
    let borrower = Keypair::new();

    let (pool, _) = Pubkey::find_program_address(
        &[POOL_SEED, authority.pubkey().as_ref(), &1u64.to_le_bytes()],
        &pid,
    );
    let (vault, _) = Pubkey::find_program_address(&[VAULT_SEED, pool.as_ref()], &pid);
    let (treasury_pda, _) = Pubkey::find_program_address(&[TREASURY_SEED], &pid);
    let (skr_oracle, _) =
        Pubkey::find_program_address(&[clock_lend::state::ORACLE_SEED, skr.as_ref()], &pid);

    // Live feed: SKR is really worth $0.002 (10x below the $0.02 baseline).
    let mut feed = vec![0u8; clock_lend::state::PriceFeed::LEN];
    feed[0..8].copy_from_slice(b"CLK_FEED");
    feed[8] = 1;
    feed[9..41].copy_from_slice(skr.as_ref());
    feed[41..49].copy_from_slice(&2_000u64.to_le_bytes()); // $0.002
    feed[49] = 6;
    feed[50..58].copy_from_slice(&2_000_000_000i64.to_le_bytes());
    feed[58..90].copy_from_slice(authority.pubkey().as_ref());
    feed[90..98].copy_from_slice(&3600i64.to_le_bytes());

    let mut pt = ProgramTest::new("clock_lend", pid, processor!(process_instruction));
    pt.add_account(
        usdc,
        Account {
            lamports: 100_000_000_000,
            data: mint_data(6),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    pt.add_account(
        skr,
        Account {
            lamports: 100_000_000_000,
            data: mint_data(6),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    pt.add_account(
        skr_oracle,
        Account {
            lamports: 100_000_000_000,
            data: feed,
            owner: pid,
            executable: false,
            rent_epoch: 0,
        },
    );
    let treasury_tok = Pubkey::new_unique();
    pt.add_account(
        treasury_tok,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, treasury_pda, 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let authority_usdc = Pubkey::new_unique();
    pt.add_account(
        authority_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, authority.pubkey(), 1_000 * USDC),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let borrower_usdc = Pubkey::new_unique();
    pt.add_account(
        borrower_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, borrower.pubkey(), 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let borrower_skr = Pubkey::new_unique();
    pt.add_account(
        borrower_skr,
        Account {
            lamports: 100_000_000_000,
            data: tok(skr, borrower.pubkey(), 10_000 * USDC),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let (mut bc, payer, bh) = pt.start().await;
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &authority.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &borrower.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();

    let init_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new_readonly(usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::InitializePool {
            pool_id: 1,
            pool_type: PoolType::Individual,
            interest_rate_bps: 800,
            max_ltv_bps: 3000,
            min_duration: 86_400,
            max_duration: 86_400 * 30,
            name: [9u8; 32],
            is_oracle_free: true,
        })
        .unwrap(),
    };
    send(&mut bc, init_ix, &[&payer, &authority], &payer, bh)
        .await
        .expect("init pool");
    let dep_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(authority_usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::DepositLiquidity {
            amount: 1_000 * USDC,
        })
        .unwrap(),
    };
    send(&mut bc, dep_ix, &[&payer, &authority], &payer, bh)
        .await
        .expect("deposit");

    let mk_borrow = |loan_id: u64, borrow_amount: u64, pass_oracle: bool| {
        let (loan, _) = Pubkey::find_program_address(
            &[
                LOAN_SEED,
                pool.as_ref(),
                borrower.pubkey().as_ref(),
                &loan_id.to_le_bytes(),
            ],
            &pid,
        );
        let (escrow, _) = Pubkey::find_program_address(&[ESCROW_SEED, loan.as_ref()], &pid);
        let (profile, _) =
            Pubkey::find_program_address(&[PROFILE_SEED, borrower.pubkey().as_ref()], &pid);
        let mut accounts = vec![
            AccountMeta::new(borrower.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(loan, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(borrower_usdc, false),
            AccountMeta::new(borrower_skr, false),
            AccountMeta::new(escrow, false),
            AccountMeta::new_readonly(skr, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new(profile, false),
            AccountMeta::new(treasury_tok, false),
        ];
        if pass_oracle {
            accounts.push(AccountMeta::new_readonly(skr_oracle, false));
        }
        Instruction {
            program_id: pid,
            accounts,
            data: borsh::to_vec(&ClockLendInstruction::BorrowFromPool {
                loan_id,
                borrow_amount,
                collateral_amount: 1_000 * USDC, // 1000 SKR
                duration_seconds: 86_400 * 7,
            })
            .unwrap(),
        }
    };

    // 1000 SKR at the LIVE price ($0.002) = $2 -> 30% LTV = $0.60 max.
    let bh1 = bc.get_latest_blockhash().await.unwrap();
    let honest = send(
        &mut bc,
        mk_borrow(1, 600_000, true),
        &[&payer, &borrower],
        &payer,
        bh1,
    )
    .await;
    println!("REG-3a honest LTV borrow ($0.60) with live feed  -> {honest:?}");
    assert!(honest.is_ok(), "the honest-sized borrow should succeed");

    let bh2 = bc.get_latest_blockhash().await.unwrap();
    let over = send(
        &mut bc,
        mk_borrow(2, 6_000_000, true),
        &[&payer, &borrower],
        &payer,
        bh2,
    )
    .await;
    println!("REG-3a 10x-sized borrow ($6.00) WITH live feed   -> {over:?}");
    assert!(
        over.is_err(),
        "the live feed (below baseline) must cap the 10x borrow"
    );

    // Omitting the feed prices collateral at the hardcoded baseline — the
    // oracle-free policy the pool authority explicitly chose (30% cap).
    let bh3 = bc.get_latest_blockhash().await.unwrap();
    let baseline = send(
        &mut bc,
        mk_borrow(3, 6_000_000, false),
        &[&payer, &borrower],
        &payer,
        bh3,
    )
    .await;
    println!("REG-3a 10x-sized borrow ($6.00) WITHOUT feed     -> {baseline:?}");
    assert!(
        baseline.is_ok(),
        "without a feed, the authority-chosen $0.02 baseline applies (30% cap)"
    );
    println!(
        "REG-3a PASS: passing the live feed can no longer inflate the valuation above baseline."
    );
}

// ---------------------------------------------------------------------------
// REG-3b: the inverse direction — a live feed ABOVE the baseline must be
//         capped at the baseline as well (previously the borrower could pass
//         a hot feed and borrow at the inflated valuation).
// ---------------------------------------------------------------------------
#[tokio::test]
async fn regression_oracle_free_live_above_baseline_is_capped() {
    let pid = clock_lend::id();
    let usdc = USDC_DEVNET_MINT;
    let skr = clock_lend::state::SKR_MINT;
    let authority = Keypair::new();
    let borrower = Keypair::new();

    let (pool, _) = Pubkey::find_program_address(
        &[POOL_SEED, authority.pubkey().as_ref(), &1u64.to_le_bytes()],
        &pid,
    );
    let (vault, _) = Pubkey::find_program_address(&[VAULT_SEED, pool.as_ref()], &pid);
    let (treasury_pda, _) = Pubkey::find_program_address(&[TREASURY_SEED], &pid);
    let (skr_oracle, _) =
        Pubkey::find_program_address(&[clock_lend::state::ORACLE_SEED, skr.as_ref()], &pid);

    // Live feed: SKR is at $0.10 (5x ABOVE the $0.02 baseline).
    let mut feed = vec![0u8; clock_lend::state::PriceFeed::LEN];
    feed[0..8].copy_from_slice(b"CLK_FEED");
    feed[8] = 1;
    feed[9..41].copy_from_slice(skr.as_ref());
    feed[41..49].copy_from_slice(&100_000u64.to_le_bytes()); // $0.10
    feed[49] = 6;
    feed[50..58].copy_from_slice(&2_000_000_000i64.to_le_bytes());
    feed[58..90].copy_from_slice(authority.pubkey().as_ref());
    feed[90..98].copy_from_slice(&3600i64.to_le_bytes());

    let mut pt = ProgramTest::new("clock_lend", pid, processor!(process_instruction));
    pt.add_account(
        usdc,
        Account {
            lamports: 100_000_000_000,
            data: mint_data(6),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    pt.add_account(
        skr,
        Account {
            lamports: 100_000_000_000,
            data: mint_data(6),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    pt.add_account(
        skr_oracle,
        Account {
            lamports: 100_000_000_000,
            data: feed,
            owner: pid,
            executable: false,
            rent_epoch: 0,
        },
    );
    let treasury_tok = Pubkey::new_unique();
    pt.add_account(
        treasury_tok,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, treasury_pda, 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let authority_usdc = Pubkey::new_unique();
    pt.add_account(
        authority_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, authority.pubkey(), 1_000 * USDC),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let borrower_usdc = Pubkey::new_unique();
    pt.add_account(
        borrower_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, borrower.pubkey(), 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let borrower_skr = Pubkey::new_unique();
    pt.add_account(
        borrower_skr,
        Account {
            lamports: 100_000_000_000,
            data: tok(skr, borrower.pubkey(), 10_000 * USDC),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let (mut bc, payer, bh) = pt.start().await;
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &authority.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &borrower.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();

    let init_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new_readonly(usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::InitializePool {
            pool_id: 1,
            pool_type: PoolType::Individual,
            interest_rate_bps: 800,
            max_ltv_bps: 3000,
            min_duration: 86_400,
            max_duration: 86_400 * 30,
            name: [9u8; 32],
            is_oracle_free: true,
        })
        .unwrap(),
    };
    send(&mut bc, init_ix, &[&payer, &authority], &payer, bh)
        .await
        .expect("init pool");
    let dep_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(authority_usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::DepositLiquidity {
            amount: 1_000 * USDC,
        })
        .unwrap(),
    };
    send(&mut bc, dep_ix, &[&payer, &authority], &payer, bh)
        .await
        .expect("deposit");

    let mk_borrow = |loan_id: u64, borrow_amount: u64, pass_oracle: bool| {
        let (loan, _) = Pubkey::find_program_address(
            &[
                LOAN_SEED,
                pool.as_ref(),
                borrower.pubkey().as_ref(),
                &loan_id.to_le_bytes(),
            ],
            &pid,
        );
        let (escrow, _) = Pubkey::find_program_address(&[ESCROW_SEED, loan.as_ref()], &pid);
        let (profile, _) =
            Pubkey::find_program_address(&[PROFILE_SEED, borrower.pubkey().as_ref()], &pid);
        let mut accounts = vec![
            AccountMeta::new(borrower.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(loan, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(borrower_usdc, false),
            AccountMeta::new(borrower_skr, false),
            AccountMeta::new(escrow, false),
            AccountMeta::new_readonly(skr, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new(profile, false),
            AccountMeta::new(treasury_tok, false),
        ];
        if pass_oracle {
            accounts.push(AccountMeta::new_readonly(skr_oracle, false));
        }
        Instruction {
            program_id: pid,
            accounts,
            data: borsh::to_vec(&ClockLendInstruction::BorrowFromPool {
                loan_id,
                borrow_amount,
                collateral_amount: 1_000 * USDC, // 1000 SKR
                duration_seconds: 86_400 * 7,
            })
            .unwrap(),
        }
    };

    // Baseline: 1000 SKR at $0.02 = $20 -> 30% LTV = $6 max. The live feed at
    // $0.10 would value the same collateral at $100 -> $30 borrowable before
    // the fix. min(baseline, live) must cap the borrower at $6 regardless.
    let bh1 = bc.get_latest_blockhash().await.unwrap();
    let at_cap = send(
        &mut bc,
        mk_borrow(1, 6_000_000, true),
        &[&payer, &borrower],
        &payer,
        bh1,
    )
    .await;
    println!("REG-3b $6.00 borrow (baseline cap) WITH hot feed -> {at_cap:?}");
    assert!(
        at_cap.is_ok(),
        "borrowing at the baseline cap with a live feed should succeed"
    );

    let bh2 = bc.get_latest_blockhash().await.unwrap();
    let inflated = send(
        &mut bc,
        mk_borrow(2, 30_000_000, true),
        &[&payer, &borrower],
        &payer,
        bh2,
    )
    .await;
    println!("REG-3b $30.00 borrow (5x) WITH hot feed       -> {inflated:?}");
    assert!(
        inflated.is_err(),
        "a live feed above the baseline must NOT inflate the valuation (min(baseline, live))"
    );
    println!("REG-3b PASS: hot feeds above baseline are capped at the baseline.");
}

// ---------------------------------------------------------------------------
// REG-2: P2P offers default to the MAINNET USDC mint when no mint account is
//        appended (round-14 fix: the devnet default made mainnet offers
//        permanently unfundable)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn regression_p2p_offer_defaults_to_mainnet_usdc() {
    let pid = clock_lend::id();
    let creator = Keypair::new();
    let skr_mint_acc = clock_lend::state::SKR_MINT;
    let (offer, _) = Pubkey::find_program_address(
        &[
            clock_lend::state::P2P_SEED,
            creator.pubkey().as_ref(),
            &1u64.to_le_bytes(),
        ],
        &pid,
    );
    let (escrow, _) = Pubkey::find_program_address(&[ESCROW_SEED, offer.as_ref()], &pid);
    let (oracle, _) = Pubkey::find_program_address(
        &[clock_lend::state::ORACLE_SEED, skr_mint_acc.as_ref()],
        &pid,
    );
    let (treasury_pda, _) = Pubkey::find_program_address(&[TREASURY_SEED], &pid);

    // Oracle feed authored by the deployer/admin (value irrelevant for POC-2).
    let mut feed = vec![0u8; clock_lend::state::PriceFeed::LEN];
    feed[0..8].copy_from_slice(b"CLK_FEED");
    feed[8] = 1;
    feed[9..41].copy_from_slice(skr_mint_acc.as_ref());
    feed[41..49].copy_from_slice(&20_000u64.to_le_bytes()); // $0.02
    feed[49] = 6;
    feed[50..58].copy_from_slice(&2_000_000_000i64.to_le_bytes()); // far-future => never stale
    feed[58..90].copy_from_slice(creator.pubkey().as_ref());
    feed[90..98].copy_from_slice(&3600i64.to_le_bytes());

    let mut pt = ProgramTest::new("clock_lend", pid, processor!(process_instruction));
    pt.add_account(
        skr_mint_acc,
        Account {
            lamports: 100_000_000_000,
            data: mint_data(6),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    // mainnet USDC exists here too (the funder's asset).
    pt.add_account(
        USDC_MAINNET_MINT,
        Account {
            lamports: 100_000_000_000,
            data: mint_data(6),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    pt.add_account(
        oracle,
        Account {
            lamports: 100_000_000_000,
            data: feed,
            owner: pid,
            executable: false,
            rent_epoch: 0,
        },
    );
    let creator_skr = Pubkey::new_unique();
    pt.add_account(
        creator_skr,
        Account {
            lamports: 100_000_000_000,
            data: tok(skr_mint_acc, creator.pubkey(), 1_000 * USDC),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let funder = Keypair::new();
    let funder_usdc = Pubkey::new_unique();
    pt.add_account(
        funder_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(USDC_MAINNET_MINT, funder.pubkey(), 1_000 * USDC),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    // Treasury's mainnet-USDC account, which receives the origination fee.
    let treasury_usdc = Pubkey::new_unique();
    pt.add_account(
        treasury_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(USDC_MAINNET_MINT, treasury_pda, 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    // The creator's properly-wired mainnet USDC account (what a mainnet client
    // would pass as the principal destination).
    let creator_usdc = Pubkey::new_unique();
    pt.add_account(
        creator_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(USDC_MAINNET_MINT, creator.pubkey(), 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let _ = treasury_pda;

    let (mut bc, payer, bh) = pt.start().await;
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &creator.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &funder.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();

    // Creator appends ONLY the oracle (no liquidity-mint account).
    let create_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(creator.pubkey(), true),
            AccountMeta::new(offer, false),
            AccountMeta::new(creator_skr, false),
            AccountMeta::new(escrow, false),
            AccountMeta::new_readonly(skr_mint_acc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new_readonly(oracle, false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::CreateP2POffer {
            offer_id: 1,
            // $14 against $20 of collateral = 70% LTV. This was $15 (75%) before
            // P2P was brought under the shared MAX_LTV_BPS cap; the assertions in
            // this test concern the liquidity_mint default, not the LTV, so
            // lowering the amount preserves its intent.
            requested_amount: 14 * USDC,
            collateral_amount: 1_000 * USDC, // 1000 SKR = $20 at the feed price
            // 0.1 USDC over 3 days: under the term cap of 14 USDC / 100.
            interest_offered: 100_000,
            duration_seconds: 86_400 * 3,
        })
        .unwrap(),
    };
    send(&mut bc, create_ix, &[&payer, &creator], &payer, bh)
        .await
        .expect("create offer");

    let offer_state = clock_lend::state::P2POffer::unpack_from_slice(
        &bc.get_account(offer).await.unwrap().unwrap().data,
    )
    .unwrap();
    println!(
        "REG-2 offer.liquidity_mint = {} (mainnet USDC = {})",
        offer_state.liquidity_mint, USDC_MAINNET_MINT
    );
    assert_eq!(
        offer_state.liquidity_mint, USDC_MAINNET_MINT,
        "no-mint offers must default to the MAINNET USDC mint"
    );

    // A funder holding real (mainnet) USDC must now be able to fund it.
    let fund_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(funder.pubkey(), true),
            AccountMeta::new(offer, false),
            AccountMeta::new(funder_usdc, false),
            AccountMeta::new(creator_usdc, false), // correct mainnet wiring: creator's USDC account
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new(treasury_usdc, false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::FundP2POffer).unwrap(),
    };
    let r = send(&mut bc, fund_ix, &[&payer, &funder], &payer, bh).await;
    println!("REG-2 fund with mainnet USDC -> {r:?}");
    assert!(
        r.is_ok(),
        "the mainnet-defaulted offer must be fundable with mainnet USDC"
    );
    println!("REG-2 PASS: no-mint P2P offers bind to mainnet USDC and can be funded.");
}

// ---------------------------------------------------------------------------
// REG-4: CreateP2POffer is capped by the SAME MAX_LTV_BPS (7000) as the pool
//        path. At the $0.02 SKR feed a 1000-SKR ($20) collateral offer may
//        request at most 14 USDC; 15 USDC (75%) must revert.
// ---------------------------------------------------------------------------
#[tokio::test]
async fn regression_p2p_offer_is_capped_at_shared_max_ltv() {
    let pid = clock_lend::id();
    let creator = Keypair::new();
    let skr_mint_acc = clock_lend::state::SKR_MINT;
    let (offer_75, _) = Pubkey::find_program_address(
        &[
            clock_lend::state::P2P_SEED,
            creator.pubkey().as_ref(),
            &1u64.to_le_bytes(),
        ],
        &pid,
    );
    let (escrow_75, _) = Pubkey::find_program_address(&[ESCROW_SEED, offer_75.as_ref()], &pid);
    let (offer_70, _) = Pubkey::find_program_address(
        &[
            clock_lend::state::P2P_SEED,
            creator.pubkey().as_ref(),
            &2u64.to_le_bytes(),
        ],
        &pid,
    );
    let (escrow_70, _) = Pubkey::find_program_address(&[ESCROW_SEED, offer_70.as_ref()], &pid);
    let (oracle, _) = Pubkey::find_program_address(
        &[clock_lend::state::ORACLE_SEED, skr_mint_acc.as_ref()],
        &pid,
    );

    // Admin feed: 1000 SKR = 1_000 * USDC base units at $0.02 => $20 of
    // collateral value, so 14 USDC is exactly 70% and 15 USDC is 75%.
    let mut feed = vec![0u8; clock_lend::state::PriceFeed::LEN];
    feed[0..8].copy_from_slice(b"CLK_FEED");
    feed[8] = 1;
    feed[9..41].copy_from_slice(skr_mint_acc.as_ref());
    feed[41..49].copy_from_slice(&20_000u64.to_le_bytes()); // $0.02
    feed[49] = 6;
    feed[50..58].copy_from_slice(&2_000_000_000i64.to_le_bytes()); // far-future => never stale
    feed[58..90].copy_from_slice(creator.pubkey().as_ref());
    feed[90..98].copy_from_slice(&3600i64.to_le_bytes());

    let mut pt = ProgramTest::new("clock_lend", pid, processor!(process_instruction));
    pt.add_account(
        skr_mint_acc,
        Account {
            lamports: 100_000_000_000,
            data: mint_data(6),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    pt.add_account(
        oracle,
        Account {
            lamports: 100_000_000_000,
            data: feed,
            owner: pid,
            executable: false,
            rent_epoch: 0,
        },
    );
    let creator_skr = Pubkey::new_unique();
    pt.add_account(
        creator_skr,
        Account {
            lamports: 100_000_000_000,
            data: tok(skr_mint_acc, creator.pubkey(), 3_000 * USDC),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let (mut bc, payer, bh) = pt.start().await;
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &creator.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();

    let mk_create = |offer_id: u64, offer: Pubkey, escrow: Pubkey, requested: u64| Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(creator.pubkey(), true),
            AccountMeta::new(offer, false),
            AccountMeta::new(creator_skr, false),
            AccountMeta::new(escrow, false),
            AccountMeta::new_readonly(skr_mint_acc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new_readonly(oracle, false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::CreateP2POffer {
            offer_id,
            requested_amount: requested,
            collateral_amount: 1_000 * USDC, // 1000 SKR = $20 at the feed price
            // 0.1 USDC over 3 days: under the term cap (requested / 100) for
            // both the 14 USDC (must pass) and 15 USDC (must revert on LTV)
            // offers this closure builds.
            interest_offered: 100_000,
            duration_seconds: 86_400 * 3,
        })
        .unwrap(),
    };

    // 75% LTV: over the shared 7000-bps cap (this was allowed at the old
    // P2P-only 9000-bps cap).
    let bh_fail = bc.get_latest_blockhash().await.unwrap();
    let r = send(
        &mut bc,
        mk_create(1, offer_75, escrow_75, 15 * USDC),
        &[&payer, &creator],
        &payer,
        bh_fail,
    )
    .await;
    println!("REG-4 15 USDC vs $20 collateral (75% LTV) -> {r:?}");
    expect_custom_error(
        &r,
        10,
        "15 USDC against 1000 SKR at $0.02 = 75% LTV MUST fail InvalidCollateralRatio",
    );
    assert!(
        bc.get_account(offer_75).await.unwrap().is_none(),
        "the rejected offer must not be created"
    );

    // 70% LTV: exactly at the cap, must still be accepted.
    let bh_ok = bc.get_latest_blockhash().await.unwrap();
    send(
        &mut bc,
        mk_create(2, offer_70, escrow_70, 14 * USDC),
        &[&payer, &creator],
        &payer,
        bh_ok,
    )
    .await
    .expect("14 USDC against 1000 SKR at $0.02 = exactly 70% LTV MUST be accepted");

    let offer_state = clock_lend::state::P2POffer::unpack_from_slice(
        &bc.get_account(offer_70).await.unwrap().unwrap().data,
    )
    .unwrap();
    assert_eq!(
        offer_state.requested_amount,
        14 * USDC,
        "the 70% offer must be recorded"
    );
    assert_eq!(offer_state.collateral_amount, 1_000 * USDC);
    assert_eq!(
        token_amount(&mut bc, escrow_70).await,
        1_000 * USDC,
        "the 70% offer's collateral must be locked in escrow"
    );
    println!("REG-4 PASS: P2P offers are capped at the shared 7000-bps LTV.");
}

// ---------------------------------------------------------------------------
// REG-5: the permissionless borrow path PARKS its half of the origination fee
//        in the yield vault instead of folding it into acc_reward_per_share.
//        A borrower — who can create their own pool and borrow against it —
//        must not be able to decide when the parked backlog is released to
//        stakers; only the authority-gated DepositSkrYield may fold.
// ---------------------------------------------------------------------------
#[tokio::test]
async fn regression_borrow_parks_yield_and_only_authority_deposit_folds() {
    let pid = clock_lend::id();
    let usdc = USDC_DEVNET_MINT;
    let authority = Keypair::new(); // pool authority, yield-vault authority, depositor
    let borrower = Keypair::new();
    let staker = Keypair::new();

    let (pool, _) = Pubkey::find_program_address(
        &[POOL_SEED, authority.pubkey().as_ref(), &1u64.to_le_bytes()],
        &pid,
    );
    let (vault, _) = Pubkey::find_program_address(&[VAULT_SEED, pool.as_ref()], &pid);
    let (treasury_pda, _) = Pubkey::find_program_address(&[TREASURY_SEED], &pid);
    // The borrow derives these from the POOL's liquidity mint, so the yield
    // vault that the fee-split leg can reach is the USDC-denominated one.
    let (yield_vault, _) =
        Pubkey::find_program_address(&[SKR_YIELD_VAULT_SEED, usdc.as_ref()], &pid);
    let (yield_token, _) =
        Pubkey::find_program_address(&[SKR_YIELD_TOKEN_SEED, usdc.as_ref()], &pid);
    let (staker_pos, _) = Pubkey::find_program_address(
        &[USER_YIELD_SEED, staker.pubkey().as_ref(), usdc.as_ref()],
        &pid,
    );

    // Pre-existing staker state: a synced 1000-unit stake with an 8 USDC parked
    // backlog behind it. acc_reward_per_share is deliberately non-zero so
    // "unchanged" is a meaningful assertion.
    const TOTAL_STAKED: u64 = 1_000 * USDC;
    const ACC_BEFORE: u128 = 5_000_000_000_000;
    const PENDING_BEFORE: u64 = 100 * USDC;
    const UNALLOCATED_BEFORE: u64 = 8 * USDC;
    const DISTRIBUTED_BEFORE: u64 = 100 * USDC;

    let mut pt = ProgramTest::new("clock_lend", pid, processor!(process_instruction));
    pt.add_account(
        usdc,
        Account {
            lamports: 100_000_000_000,
            data: mint_data(6),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let treasury_tok = Pubkey::new_unique();
    pt.add_account(
        treasury_tok,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, treasury_pda, 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let authority_usdc = Pubkey::new_unique();
    pt.add_account(
        authority_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, authority.pubkey(), 2_000 * USDC),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    let borrower_usdc = Pubkey::new_unique();
    pt.add_account(
        borrower_usdc,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, borrower.pubkey(), 0),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    // The vault's own token account, holding exactly pending_rewards (the
    // program-internal invariant WithdrawUnusedYield relies on).
    pt.add_account(
        yield_token,
        Account {
            lamports: 100_000_000_000,
            data: tok(usdc, yield_vault, PENDING_BEFORE),
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    pt.add_account(
        yield_vault,
        Account {
            lamports: 100_000_000_000,
            data: yield_vault_data(
                authority.pubkey(),
                usdc,
                TOTAL_STAKED,
                ACC_BEFORE,
                DISTRIBUTED_BEFORE,
                PENDING_BEFORE,
                UNALLOCATED_BEFORE,
            ),
            owner: pid,
            executable: false,
            rent_epoch: 0,
        },
    );
    // The staker behind that stake.
    pt.add_account(
        staker_pos,
        Account {
            lamports: 100_000_000_000,
            data: yield_position_data(staker.pubkey(), usdc, TOTAL_STAKED),
            owner: pid,
            executable: false,
            rent_epoch: 0,
        },
    );

    let (mut bc, payer, bh) = pt.start().await;
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &authority.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &borrower.pubkey(), 30_000_000_000),
        &[&payer],
        &payer,
        bh,
    )
    .await
    .unwrap();

    // Oracle-free pool: no feed, SOL collateral priced from the $150 baseline.
    let init_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new_readonly(usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::InitializePool {
            pool_id: 1,
            pool_type: PoolType::Individual,
            interest_rate_bps: 800,
            max_ltv_bps: 3000,
            min_duration: 86_400,
            max_duration: 86_400 * 30,
            name: [8u8; 32],
            is_oracle_free: true,
        })
        .unwrap(),
    };
    send(&mut bc, init_ix, &[&payer, &authority], &payer, bh)
        .await
        .expect("init pool");

    let dep_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(authority_usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::DepositLiquidity {
            amount: 1_000 * USDC,
        })
        .unwrap(),
    };
    send(&mut bc, dep_ix, &[&payer, &authority], &payer, bh)
        .await
        .expect("deposit");

    let loan_id: u64 = 1;
    let (loan, _) = Pubkey::find_program_address(
        &[
            LOAN_SEED,
            pool.as_ref(),
            borrower.pubkey().as_ref(),
            &loan_id.to_le_bytes(),
        ],
        &pid,
    );
    let (escrow, _) = Pubkey::find_program_address(&[ESCROW_SEED, loan.as_ref()], &pid);
    let (profile, _) =
        Pubkey::find_program_address(&[PROFILE_SEED, borrower.pubkey().as_ref()], &pid);

    let borrow_amount: u64 = 40 * USDC; // 1 SOL collateral = $150 -> 27% < the 30% cap
    let collateral: u64 = 1_000_000_000; // 1 SOL
    let borrow_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(borrower.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(loan, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(borrower_usdc, false),
            AccountMeta::new(borrower.pubkey(), false),
            AccountMeta::new(escrow, false),
            AccountMeta::new_readonly(SYS, false), // native-SOL collateral mint
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(SYS, false),
            AccountMeta::new(profile, false),
            AccountMeta::new(treasury_tok, false),
            AccountMeta::new(yield_vault, false),
            AccountMeta::new(yield_token, false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::BorrowFromPool {
            loan_id,
            borrow_amount,
            collateral_amount: collateral,
            duration_seconds: 86_400 * 7,
        })
        .unwrap(),
    };

    let vault_before = read_yield_vault(&mut bc, yield_vault).await;
    let yield_tok_before = token_amount(&mut bc, yield_token).await;
    let bh_borrow = bc.get_latest_blockhash().await.unwrap();
    send(&mut bc, borrow_ix, &[&payer, &borrower], &payer, bh_borrow)
        .await
        .expect("borrow with yield accounts");

    let fee = borrow_amount * 25 / 10_000; // 0.25% for SOL collateral
    let y_div = fee / 2;
    let vault_after = read_yield_vault(&mut bc, yield_vault).await;
    let yield_tok_after = token_amount(&mut bc, yield_token).await;

    println!(
        "REG-5 borrow fee={fee} yield_leg={y_div}: acc_per_share {} -> {} | unallocated {} -> {} | pending {} -> {}",
        vault_before.acc_reward_per_share,
        vault_after.acc_reward_per_share,
        vault_before.unallocated_rewards,
        vault_after.unallocated_rewards,
        vault_before.pending_rewards,
        vault_after.pending_rewards,
    );

    // The tokens really moved into the vault's token account...
    assert_eq!(
        yield_tok_after - yield_tok_before,
        y_div,
        "the half-fee must be transferred into the yield vault's token account"
    );
    // ...and were credited exactly, without releasing the backlog.
    assert_eq!(
        vault_after.unallocated_rewards,
        UNALLOCATED_BEFORE + y_div,
        "the half-fee must be PARKED in unallocated_rewards (backlog untouched)"
    );
    assert_eq!(
        vault_after.pending_rewards,
        PENDING_BEFORE + y_div,
        "pending_rewards must grow by the half-fee so the WithdrawUnusedYield bound stays correct"
    );
    assert_eq!(
        vault_after.total_rewards_distributed,
        DISTRIBUTED_BEFORE + y_div,
        "total_rewards_distributed must grow by the half-fee"
    );
    assert_eq!(
        vault_after.acc_reward_per_share, ACC_BEFORE,
        "the permissionless borrow must NOT move acc_reward_per_share"
    );
    assert_eq!(
        vault_after.total_staked_skr, TOTAL_STAKED,
        "the borrow must not touch the stake total"
    );

    // Guard against a silent revert to the ACCRUING behaviour: accrue_yield
    // would have folded (amount + backlog/4) into acc_reward_per_share and
    // drained unallocated_rewards by that quarter. Pin that the two behaviours
    // are distinguishable, so this test cannot pass for both.
    let fold_if_accrued = (UNALLOCATED_BEFORE + 3) / 4;
    let accr_if_folded = ACC_BEFORE
        + ((y_div as u128 + fold_if_accrued as u128) * YIELD_SCALE) / (TOTAL_STAKED as u128);
    assert_ne!(
        vault_after.acc_reward_per_share, accr_if_folded,
        "a fold here would have produced exactly this value — the borrow must park instead"
    );
    assert_ne!(
        vault_after.unallocated_rewards,
        UNALLOCATED_BEFORE - fold_if_accrued,
        "a fold here would have drained the backlog by a quarter"
    );

    // The fold still works — from the authority-gated path only.
    let deposit_amount: u64 = 10 * USDC;
    let deposit_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(yield_vault, false),
            AccountMeta::new(authority_usdc, false),
            AccountMeta::new(yield_token, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::DepositSkrYield {
            amount: deposit_amount,
        })
        .unwrap(),
    };
    let bh_dep = bc.get_latest_blockhash().await.unwrap();
    send(&mut bc, deposit_ix, &[&payer, &authority], &payer, bh_dep)
        .await
        .expect("authority DepositSkrYield");

    let vault_folded = read_yield_vault(&mut bc, yield_vault).await;
    // Mirror accrue_yield: quarter of the parked backlog is released, plus the
    // new amount, split across the staked total.
    let fold = (vault_after.unallocated_rewards + 3) / 4;
    let expected_acc = vault_after.acc_reward_per_share
        + ((deposit_amount as u128 + fold as u128) * YIELD_SCALE) / (TOTAL_STAKED as u128);
    println!(
        "REG-5 authority deposit {deposit_amount}: acc_per_share {} -> {} (expected {expected_acc})",
        vault_after.acc_reward_per_share, vault_folded.acc_reward_per_share
    );
    assert!(
        vault_folded.acc_reward_per_share > vault_after.acc_reward_per_share,
        "the authority-gated deposit MUST still fold rewards into acc_reward_per_share"
    );
    assert_eq!(
        vault_folded.acc_reward_per_share, expected_acc,
        "the fold must release exactly a quarter of the parked backlog plus the deposit"
    );
    assert_eq!(
        vault_folded.unallocated_rewards,
        vault_after.unallocated_rewards - fold,
        "the fold must draw down the parked backlog"
    );
    println!("REG-5 PASS: borrow parks its fee half; only the authority deposit folds.");
}
