const web3 = require("@solana/web3.js");

const PROGRAM_ID = new web3.PublicKey("GuXxGU2xwGHo9Bw3Xfk1EqLvyVdgLomfJm5vXQPu1h9e"); 

const [pda, bump] = web3.PublicKey.findProgramAddressSync(
  [Buffer.from("vault-authority")],
  PROGRAM_ID
);

console.log("Vault Authority PDA:", pda.toBase58());