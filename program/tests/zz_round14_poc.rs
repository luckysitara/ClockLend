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
// Run: cargo test --test zz_round14_poc -- --nocapture
use clock_lend::{
    instruction::ClockLendInstruction,
    processor::process_instruction,
    state::{
        LendingPool, PoolType, ESCROW_SEED, LOAN_SEED, POOL_SEED, PROFILE_SEED,
        SKR_YIELD_TOKEN_SEED, SKR_YIELD_VAULT_SEED, TREASURY_SEED, USDC_DEVNET_MINT,
        USDC_MAINNET_MINT, VAULT_SEED,
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
    send(&mut bc, mk_borrow(1, true), &[&payer, &borrower], &payer, bh1)
        .await
        .expect("borrow with yield accounts");

    let vault_after = token_amount(&mut bc, vault).await;
    let treasury_after = token_amount(&mut bc, treasury_tok).await;
    let pool_state = LendingPool::unpack_from_slice(
        &bc.get_account(pool).await.unwrap().unwrap().data,
    )
    .unwrap();

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
    send(&mut bc, mk_borrow(2, false), &[&payer, &borrower], &payer, bh2)
        .await
        .expect("borrow without yield accounts");
    let vault_a2 = token_amount(&mut bc, vault).await;
    let treasury_a2 = token_amount(&mut bc, treasury_tok).await;
    let pool_state2 = LendingPool::unpack_from_slice(
        &bc.get_account(pool).await.unwrap().unwrap().data,
    )
    .unwrap();
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
    println!("REG-1 PASS: appending two empty PDAs no longer halves protocol revenue or strands funds.");
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
        Account { lamports: 100_000_000_000, data: mint_data(6), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    pt.add_account(
        skr,
        Account { lamports: 100_000_000_000, data: mint_data(6), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    pt.add_account(
        skr_oracle,
        Account { lamports: 100_000_000_000, data: feed, owner: pid, executable: false, rent_epoch: 0 },
    );
    let treasury_tok = Pubkey::new_unique();
    pt.add_account(
        treasury_tok,
        Account { lamports: 100_000_000_000, data: tok(usdc, treasury_pda, 0), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    let authority_usdc = Pubkey::new_unique();
    pt.add_account(
        authority_usdc,
        Account { lamports: 100_000_000_000, data: tok(usdc, authority.pubkey(), 1_000 * USDC), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    let borrower_usdc = Pubkey::new_unique();
    pt.add_account(
        borrower_usdc,
        Account { lamports: 100_000_000_000, data: tok(usdc, borrower.pubkey(), 0), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    let borrower_skr = Pubkey::new_unique();
    pt.add_account(
        borrower_skr,
        Account { lamports: 100_000_000_000, data: tok(skr, borrower.pubkey(), 10_000 * USDC), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );

    let (mut bc, payer, bh) = pt.start().await;
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &authority.pubkey(), 30_000_000_000),
        &[&payer], &payer, bh,
    ).await.unwrap();
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &borrower.pubkey(), 30_000_000_000),
        &[&payer], &payer, bh,
    ).await.unwrap();

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
            pool_id: 1, pool_type: PoolType::Individual, interest_rate_bps: 800,
            max_ltv_bps: 3000, min_duration: 86_400, max_duration: 86_400 * 30,
            name: [9u8; 32], is_oracle_free: true,
        }).unwrap(),
    };
    send(&mut bc, init_ix, &[&payer, &authority], &payer, bh).await.expect("init pool");
    let dep_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(authority_usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::DepositLiquidity { amount: 1_000 * USDC }).unwrap(),
    };
    send(&mut bc, dep_ix, &[&payer, &authority], &payer, bh).await.expect("deposit");

    let mk_borrow = |loan_id: u64, borrow_amount: u64, pass_oracle: bool| {
        let (loan, _) = Pubkey::find_program_address(
            &[LOAN_SEED, pool.as_ref(), borrower.pubkey().as_ref(), &loan_id.to_le_bytes()], &pid);
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
            }).unwrap(),
        }
    };

    // 1000 SKR at the LIVE price ($0.002) = $2 -> 30% LTV = $0.60 max.
    let bh1 = bc.get_latest_blockhash().await.unwrap();
    let honest = send(&mut bc, mk_borrow(1, 600_000, true), &[&payer, &borrower], &payer, bh1).await;
    println!("REG-3a honest LTV borrow ($0.60) with live feed  -> {honest:?}");
    assert!(honest.is_ok(), "the honest-sized borrow should succeed");

    let bh2 = bc.get_latest_blockhash().await.unwrap();
    let over = send(&mut bc, mk_borrow(2, 6_000_000, true), &[&payer, &borrower], &payer, bh2).await;
    println!("REG-3a 10x-sized borrow ($6.00) WITH live feed   -> {over:?}");
    assert!(over.is_err(), "the live feed (below baseline) must cap the 10x borrow");

    // Omitting the feed prices collateral at the hardcoded baseline — the
    // oracle-free policy the pool authority explicitly chose (30% cap).
    let bh3 = bc.get_latest_blockhash().await.unwrap();
    let baseline = send(&mut bc, mk_borrow(3, 6_000_000, false), &[&payer, &borrower], &payer, bh3).await;
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
        Account { lamports: 100_000_000_000, data: mint_data(6), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    pt.add_account(
        skr,
        Account { lamports: 100_000_000_000, data: mint_data(6), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    pt.add_account(
        skr_oracle,
        Account { lamports: 100_000_000_000, data: feed, owner: pid, executable: false, rent_epoch: 0 },
    );
    let treasury_tok = Pubkey::new_unique();
    pt.add_account(
        treasury_tok,
        Account { lamports: 100_000_000_000, data: tok(usdc, treasury_pda, 0), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    let authority_usdc = Pubkey::new_unique();
    pt.add_account(
        authority_usdc,
        Account { lamports: 100_000_000_000, data: tok(usdc, authority.pubkey(), 1_000 * USDC), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    let borrower_usdc = Pubkey::new_unique();
    pt.add_account(
        borrower_usdc,
        Account { lamports: 100_000_000_000, data: tok(usdc, borrower.pubkey(), 0), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );
    let borrower_skr = Pubkey::new_unique();
    pt.add_account(
        borrower_skr,
        Account { lamports: 100_000_000_000, data: tok(skr, borrower.pubkey(), 10_000 * USDC), owner: spl_token::id(), executable: false, rent_epoch: 0 },
    );

    let (mut bc, payer, bh) = pt.start().await;
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &authority.pubkey(), 30_000_000_000),
        &[&payer], &payer, bh,
    ).await.unwrap();
    send(
        &mut bc,
        system_instruction::transfer(&payer.pubkey(), &borrower.pubkey(), 30_000_000_000),
        &[&payer], &payer, bh,
    ).await.unwrap();

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
            pool_id: 1, pool_type: PoolType::Individual, interest_rate_bps: 800,
            max_ltv_bps: 3000, min_duration: 86_400, max_duration: 86_400 * 30,
            name: [9u8; 32], is_oracle_free: true,
        }).unwrap(),
    };
    send(&mut bc, init_ix, &[&payer, &authority], &payer, bh).await.expect("init pool");
    let dep_ix = Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true),
            AccountMeta::new(pool, false),
            AccountMeta::new(authority_usdc, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: borsh::to_vec(&ClockLendInstruction::DepositLiquidity { amount: 1_000 * USDC }).unwrap(),
    };
    send(&mut bc, dep_ix, &[&payer, &authority], &payer, bh).await.expect("deposit");

    let mk_borrow = |loan_id: u64, borrow_amount: u64, pass_oracle: bool| {
        let (loan, _) = Pubkey::find_program_address(
            &[LOAN_SEED, pool.as_ref(), borrower.pubkey().as_ref(), &loan_id.to_le_bytes()], &pid);
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
            }).unwrap(),
        }
    };

    // Baseline: 1000 SKR at $0.02 = $20 -> 30% LTV = $6 max. The live feed at
    // $0.10 would value the same collateral at $100 -> $30 borrowable before
    // the fix. min(baseline, live) must cap the borrower at $6 regardless.
    let bh1 = bc.get_latest_blockhash().await.unwrap();
    let at_cap = send(&mut bc, mk_borrow(1, 6_000_000, true), &[&payer, &borrower], &payer, bh1).await;
    println!("REG-3b $6.00 borrow (baseline cap) WITH hot feed -> {at_cap:?}");
    assert!(at_cap.is_ok(), "borrowing at the baseline cap with a live feed should succeed");

    let bh2 = bc.get_latest_blockhash().await.unwrap();
    let inflated = send(&mut bc, mk_borrow(2, 30_000_000, true), &[&payer, &borrower], &payer, bh2).await;
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
        &[clock_lend::state::P2P_SEED, creator.pubkey().as_ref(), &1u64.to_le_bytes()],
        &pid,
    );
    let (escrow, _) = Pubkey::find_program_address(&[ESCROW_SEED, offer.as_ref()], &pid);
    let (oracle, _) =
        Pubkey::find_program_address(&[clock_lend::state::ORACLE_SEED, skr_mint_acc.as_ref()], &pid);
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
            requested_amount: 15 * USDC,
            collateral_amount: 1_000 * USDC, // 1000 SKR = $20 at the feed price
            interest_offered: 1 * USDC,
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
        ],
        data: borsh::to_vec(&ClockLendInstruction::FundP2POffer).unwrap(),
    };
    let r = send(&mut bc, fund_ix, &[&payer, &funder], &payer, bh).await;
    println!("REG-2 fund with mainnet USDC -> {r:?}");
    assert!(r.is_ok(), "the mainnet-defaulted offer must be fundable with mainnet USDC");
    println!("REG-2 PASS: no-mint P2P offers bind to mainnet USDC and can be funded.");
}
