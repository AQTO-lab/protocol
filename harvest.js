// harvest.js
//
// Запуск: node harvest.js
// Зависимости: npm install @solana/web3.js@1 @anchor-lang/core @solana/spl-token

const fs = require("fs");
const path = require("path");
const os = require("os");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { AnchorProvider, Program, Wallet, BN } = require("@anchor-lang/core");
const {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");

// ---- Константы под ваш деплой (ОБНОВЛЕНО) -------------------------------

const PROGRAM_ID = new PublicKey("AM95AhrTcnLgP3eFYwQBaxczBi3CWeFRQQN9CrnQBUQb");
const MINT = new PublicKey("AdYsvyv7fFhu4Y4bXyBJpYrswh6fBuMojRsXAJi5M1eF");
const VAULT_AUTHORITY = new PublicKey("9v8oPsa9SzAwHQ6TwQtjGmeqDABAknkHYEge2MBhfYLN");

// Кошелёк, которым подписываем: caller = treasury = Aujqe...
const WALLET_PATH = path.join(os.homedir(), ".config/solana/solflare-wallet.json");

// Токен-аккаунты, с которых нужно собрать удержанную комиссию (harvest).
// Добавляйте сюда все ATA получателей, у которых есть Withheld fees > 0.
const FEE_SOURCE_ACCOUNTS = [
  new PublicKey("CSQZB1Ff6jff1njtpkEj7rAiE1XbqhSLojzskZtQgiU5"), // <- Здесь укажите ATA, на котором скопились комиссии
];

// Путь к IDL, который сгенерировал `anchor build`
const IDL_PATH = path.join(__dirname, "target", "idl", "aqto_protocol.json"); // Исправлено на aqto_protocol

// ---------------------------------------------------------------------------

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  const callerKeypair = Keypair.fromSecretKey(Uint8Array.from(secret));

  const wallet = new Wallet(callerKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const program = new Program(idl, provider);

  // caller_token_account и treasury_token_account — один и тот же ATA
  const callerTreasuryTokenAccount = getAssociatedTokenAddressSync(
    MINT,
    callerKeypair.publicKey,
    false, 
    TOKEN_2022_PROGRAM_ID
  );

  const vault = getAssociatedTokenAddressSync(
    MINT,
    VAULT_AUTHORITY,
    true, 
    TOKEN_2022_PROGRAM_ID
  );

  console.log("caller / treasury ATA:", callerTreasuryTokenAccount.toBase58());
  console.log("vault:", vault.toBase58());

  const remainingAccounts = FEE_SOURCE_ACCOUNTS.map((pubkey) => ({
    pubkey,
    isWritable: true,
    isSigner: false,
  }));

  const sig = await program.methods
    .harvestAndDistribute()
    .accounts({
      caller: callerKeypair.publicKey,
      mint: MINT,
      vault,
      vaultAuthority: VAULT_AUTHORITY,
      callerTokenAccount: callerTreasuryTokenAccount,
      treasuryTokenAccount: callerTreasuryTokenAccount, // Дублирование разрешено атрибутом dup
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .rpc();

  console.log("Транзакция отправлена:", sig);
  console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((err) => {
  console.error("Ошибка:", err);
  process.exit(1);
});