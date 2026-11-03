// harvestv2.js — AQTO Protocol: сбор комиссий и распределение (devnet / mainnet)
//
// Запуск:
//   node harvestv2.js            — найти все счета с удержанной комиссией и вызвать harvest_and_distribute
//   node harvestv2.js --dry      — только показать, сколько комиссии накоплено, ничего не отправлять
//
// Переменные окружения (необязательно):
//   RPC_URL      — свой RPC (например, Helius). По умолчанию публичный devnet.
//   WALLET_PATH  — путь к ключу кошелька. По умолчанию ~/.config/solana/solflare-wallet.json
//
// Зависимости: npm install @solana/web3.js@1 @anchor-lang/core @solana/spl-token
//
// Контракт требует хотя бы один счёт-источник (иначе NoAccountsToHarvest), поэтому скрипт сам
// находит все токен-аккаунты минта с Withheld fees > 0, включая хранилища пула Raydium.
// caller = treasury = кошелёк Aujqe..., поэтому caller_token_account и treasury_token_account —
// один и тот же ATA (разрешено атрибутом `dup` в контракте).

const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  Connection,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const { AnchorProvider, Program, Wallet } = require("@anchor-lang/core");
const {
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
  unpackAccount,
  getTransferFeeAmount,
  getTransferFeeConfig,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");

// ---- Константы под ваш деплой (Актуальные) -------------------------------

const PROGRAM_ID = new PublicKey("AM95AhrTcnLgP3eFYwQBaxczBi3CWeFRQQN9CrnQBUQb");
const MINT = new PublicKey("AdYsvyv7fFhu4Y4bXyBJpYrswh6fBuMojRsXAJi5M1eF");
const VAULT_AUTHORITY = new PublicKey("9v8oPsa9SzAwHQ6TwQtjGmeqDABAknkHYEge2MBhfYLN");

const CLUSTER_LABEL = "devnet"; // для ссылок на Explorer: "devnet" или "mainnet-beta"
const RPC_URL = process.env.RPC_URL || clusterApiUrl("devnet");
const WALLET_PATH =
  process.env.WALLET_PATH || path.join(os.homedir(), ".config/solana/solflare-wallet.json");
const IDL_PATH = path.join(__dirname, "target", "idl", "aqto_protocol.json");

// Сколько счетов-источников передавать за один вызов (ограничение размера транзакции).
const MAX_SOURCES_PER_TX = 20;

// ---- Вспомогательные функции --------------------------------------------

const DRY_RUN = process.argv.includes("--dry");

/** Форматирует raw-значение (BigInt) в токены с учётом decimals: 1500000000 -> "1.5" */
function fmt(raw, decimals) {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "-" : "") + wholeStr + (frac ? "," + frac : "");
}

function pct(part, total) {
  if (total === 0n) return "0%";
  return (Number((part * 1000000n) / total) / 10000).toFixed(2).replace(".", ",") + "%";
}

function short(pk) {
  const s = pk.toString();
  return s.slice(0, 4) + "…" + s.slice(-4);
}

function explorerTx(sig) {
  const suffix = CLUSTER_LABEL === "mainnet-beta" ? "" : `?cluster=${CLUSTER_LABEL}`;
  return `https://explorer.solana.com/tx/${sig}${suffix}`;
}

function line(title = "") {
  console.log("\n" + "─".repeat(8) + (title ? " " + title + " " : "") + "─".repeat(Math.max(4, 54 - title.length)));
}

/**
 * Дополнительные токен-аккаунты (ATA, не адреса кошельков!), которые всегда проверяются.
 * Сюда можно добавить, например, хранилища пула Raydium, если RPC не отдаёт полный список.
 * Можно также передать через переменную окружения: EXTRA_SOURCES=addr1,addr2
 */
const EXTRA_SOURCES = [
  // "ТОКЕН_АККАУНТ_ПУЛА",
  ...(process.env.EXTRA_SOURCES ? process.env.EXTRA_SOURCES.split(",").map((x) => x.trim()).filter(Boolean) : []),
];

/** Находит все токен-аккаунты минта: сначала через getProgramAccounts, при отказе RPC — запасным путём. */
async function listCandidateAccounts(connection) {
  try {
    const accounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [{ memcmp: { offset: 0, bytes: MINT.toBase58() } }],
    });
    console.log(`Режим поиска: getProgramAccounts (найдено токен-аккаунтов: ${accounts.length})`);
    return accounts;
  } catch (err) {
    console.log("Ваш RPC не поддерживает getProgramAccounts для Token-2022 — использую запасной способ:");
    console.log("  топ-20 держателей минта + счета из EXTRA_SOURCES. Чтобы видеть ВСЕ счета, используйте RPC");
    console.log("  с поддержкой этого метода (например, Helius): RPC_URL=... node harvestv2.js");
  }

  const keys = new Map();
  try {
    const largest = await connection.getTokenLargestAccounts(MINT, "confirmed");
    for (const { address } of largest.value) keys.set(address.toBase58(), address);
  } catch (e) {
    console.log("  getTokenLargestAccounts недоступен:", e.message);
  }
  for (const a of EXTRA_SOURCES) keys.set(a, new PublicKey(a));
  keys.set(callerAtaGlobal.toBase58(), callerAtaGlobal);
  keys.set(vaultGlobal.toBase58(), vaultGlobal);

  const list = [...keys.values()];
  const result = [];
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(batch, "confirmed");
    infos.forEach((info, j) => {
      if (info && info.owner.equals(TOKEN_2022_PROGRAM_ID)) result.push({ pubkey: batch[j], account: info });
    });
  }
  console.log(`Режим поиска: запасной (проверено токен-аккаунтов: ${result.length})`);
  return result;
}

/** Ищет все токен-аккаунты минта (Token-2022) с удержанной комиссией. */
async function findFeeSources(connection) {
  const accounts = await listCandidateAccounts(connection);

  const sources = [];
  for (const { pubkey, account } of accounts) {
    let parsed;
    try {
      parsed = unpackAccount(pubkey, account, TOKEN_2022_PROGRAM_ID);
    } catch {
      continue; // не токен-аккаунт
    }
    if (!parsed.mint.equals(MINT)) continue;
    const ext = getTransferFeeAmount(parsed);
    const withheld = ext ? BigInt(ext.withheldAmount.toString()) : 0n;
    if (withheld > 0n) {
      sources.push({ pubkey, owner: parsed.owner, balance: parsed.amount, withheld });
    }
  }
  sources.sort((x, y) => (x.withheld < y.withheld ? 1 : -1));
  return sources;
}

/** Достаёт событие DistributionEvent из логов транзакции. */
function parseDistributionEvent(program, logs) {
  for (const l of logs || []) {
    const prefix = "Program data: ";
    if (!l.startsWith(prefix)) continue;
    try {
      const ev = program.coder.events.decode(l.slice(prefix.length));
      if (ev && ev.name.toLowerCase() === "distributionevent") return ev.data;
    } catch {
      /* не наше событие */
    }
  }
  return null;
}

let callerAtaGlobal, vaultGlobal; // заполняются в main(), нужны запасному поиску

// ---- Основная логика ----------------------------------------------------

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  const callerKeypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const provider = new AnchorProvider(connection, new Wallet(callerKeypair), {
    commitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const program = new Program(idl, provider);

  const mintInfo = await getMint(connection, MINT, "confirmed", TOKEN_2022_PROGRAM_ID);
  const D = mintInfo.decimals;

  const callerAta = getAssociatedTokenAddressSync(MINT, callerKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const vault = getAssociatedTokenAddressSync(MINT, VAULT_AUTHORITY, true, TOKEN_2022_PROGRAM_ID);

  callerAtaGlobal = callerAta;
  vaultGlobal = vault;

  line("AQTO harvest");
  console.log("Сеть / RPC:        ", CLUSTER_LABEL, "/", RPC_URL.replace(/api-key=[^&]+/, "api-key=***"));
  console.log("Программа:         ", PROGRAM_ID.toBase58());
  console.log("Минт:              ", MINT.toBase58());
  console.log("Кошелёк (caller):  ", callerKeypair.publicKey.toBase58());
  console.log("ATA caller/казна:  ", callerAta.toBase58());
  console.log("Хранилище (vault): ", vault.toBase58());
  const solBalance = await connection.getBalance(callerKeypair.publicKey);
  console.log("Баланс SOL:        ", (solBalance / LAMPORTS_PER_SOL).toFixed(4));

  // 1. Поиск счетов с удержанной комиссией
  line("Поиск накопленной комиссии");
  const sources = await findFeeSources(connection);
  const totalWithheld = sources.reduce((s, x) => s + x.withheld, 0n);

  if (sources.length === 0) {
    console.log("Счетов с удержанной комиссией (Withheld fees > 0) не найдено.");
  } else {
    sources.forEach((s, i) => {
      console.log(
        `${String(i + 1).padStart(2)}. ${s.pubkey.toBase58()}  (владелец ${short(s.owner)})` +
          `\n    баланс: ${fmt(s.balance, D)}   удержано: ${fmt(s.withheld, D)} AQTO`
      );
    });
    console.log(`\nВсего удержано на ${sources.length} счетах: ${fmt(totalWithheld, D)} AQTO`);
  }

  const vaultBefore = await getAccount(connection, vault, "confirmed", TOKEN_2022_PROGRAM_ID);
  const mintBefore = mintInfo.supply;
  const callerBefore = (await getAccount(connection, callerAta, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
  // удержанное, уже собранное на самом минте (если предыдущий harvest был прерван)
  const feeCfg = getTransferFeeConfig(mintInfo);
  const withheldOnMint = feeCfg ? BigInt(feeCfg.withheldAmount.toString()) : 0n;

  console.log("Уже лежит на самом минте (withheld):", fmt(withheldOnMint, D), "AQTO");
  console.log("Сейчас в хранилище (vault):         ", fmt(vaultBefore.amount, D), "AQTO");
  console.log("Общий supply до вызова:             ", fmt(mintBefore, D), "AQTO");

  if (DRY_RUN) {
    console.log("\n--dry: ничего не отправлено.");
    return;
  }
  if (sources.length === 0 && withheldOnMint === 0n && vaultBefore.amount === 0n) {
    console.log("\nСобирать нечего. Сделайте несколько свапов или переводов и запустите снова.");
    return;
  }

  // 2. Вызовы harvest_and_distribute (порциями)
  const chunks = [];
  const list = sources.length ? sources.map((s) => s.pubkey) : [callerAta]; // минимум один счёт
  for (let i = 0; i < list.length; i += MAX_SOURCES_PER_TX) chunks.push(list.slice(i, i + MAX_SOURCES_PER_TX));

  const totals = { collected: 0n, burned: 0n, caller: 0n, treasury: 0n };

  for (let i = 0; i < chunks.length; i++) {
    line(`Вызов ${i + 1} из ${chunks.length} (${chunks[i].length} счетов)`);
    let sig;
    try {
      sig = await program.methods
        .harvestAndDistribute()
        .accounts({
          caller: callerKeypair.publicKey,
          mint: MINT,
          vault,
          vaultAuthority: VAULT_AUTHORITY,
          callerTokenAccount: callerAta,
          treasuryTokenAccount: callerAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts(chunks[i].map((pubkey) => ({ pubkey, isWritable: true, isSigner: false })))
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
        .rpc();
    } catch (err) {
      console.error("Ошибка вызова:", err.message || err);
      if (err.logs) console.error(err.logs.join("\n"));
      process.exitCode = 1;
      return;
    }
    console.log("Транзакция:", sig);
    console.log("Explorer:  ", explorerTx(sig));

    const tx = await connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const ev = parseDistributionEvent(program, tx?.meta?.logMessages);
    if (!ev) {
      console.log("Событие DistributionEvent в логах не найдено (смотрите Explorer).");
      continue;
    }
    const total = BigInt(ev.totalCollected?.toString() ?? ev.total_collected.toString());
    const burned = BigInt(ev.burned.toString());
    const callerR = BigInt((ev.callerReward ?? ev.caller_reward).toString());
    const treasuryR = BigInt((ev.treasuryReward ?? ev.treasury_reward).toString());

    console.log(`Собрано всего:        ${fmt(total, D)} AQTO`);
    console.log(`Сожжено:              ${fmt(burned, D)} AQTO  (${pct(burned, total)})`);
    console.log(`Награда харвестеру:   ${fmt(callerR, D)} AQTO  (${pct(callerR, total)})`);
    console.log(`В казну (фонд):       ${fmt(treasuryR, D)} AQTO  (${pct(treasuryR, total)})`);

    totals.collected += total;
    totals.burned += burned;
    totals.caller += callerR;
    totals.treasury += treasuryR;
  }

  // 3. Итоги
  const mintAfter = (await getMint(connection, MINT, "confirmed", TOKEN_2022_PROGRAM_ID)).supply;
  const vaultAfter = (await getAccount(connection, vault, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
  const callerAfter = (await getAccount(connection, callerAta, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;

  line("Итоги");
  console.log(`Собрано комиссий:         ${fmt(totals.collected, D)} AQTO`);
  console.log(`Сожжено:                  ${fmt(totals.burned, D)} AQTO  (${pct(totals.burned, totals.collected)})`);
  console.log(`Награда харвестеру (15%): ${fmt(totals.caller, D)} AQTO  (${pct(totals.caller, totals.collected)})`);
  console.log(`В казну (5%):             ${fmt(totals.treasury, D)} AQTO  (${pct(totals.treasury, totals.collected)})`);
  console.log(`Supply:                   ${fmt(mintBefore, D)} -> ${fmt(mintAfter, D)} AQTO  (изменение ${fmt(mintAfter - mintBefore, D)})`);
  console.log(`Хранилище (vault):        ${fmt(vaultBefore.amount, D)} -> ${fmt(vaultAfter, D)} AQTO`);
  console.log(`Баланс ${short(callerAta)} (caller = казна): ${fmt(callerBefore, D)} -> ${fmt(callerAfter, D)} AQTO`);
  console.log(
    "Примечание: переводы награды и казны сами облагаются комиссией 0,05% — она останется удержанной " +
      "на счёте получателя и будет собрана следующим harvest."
  );

  // Проверка согласованности: сожжённое должно совпасть с уменьшением supply
  const supplyDrop = mintBefore - mintAfter;
  if (supplyDrop !== totals.burned) {
    console.log(
      `\nВнимание: уменьшение supply (${fmt(supplyDrop, D)}) не равно сожжённому по событию (${fmt(totals.burned, D)}).`
    );
  }
}

main().catch((err) => {
  console.error("Ошибка:", err);
  process.exit(1);
});
