import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("98AE9UpRVPixbKRucqqq4DK5RvdKNpsu19tH4tBLr26h");
const SEED = "vault-authority"; // Точный сид из вашего rust-кода

async function main() {
    const [pda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED)],
        PROGRAM_ID
    );

    console.log("ВАШ ПРАВИЛЬНЫЙ PDA (vault_authority):", pda.toBase58());
    console.log("Bump:", bump);
}

main();