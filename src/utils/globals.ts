import { PublicKey } from "@solana/web3.js";

export const DEFAULT_THEME = "night";

export const DEFAULT_WALLET = "AMSi7nsBbYVVETPu5rXuC9KgabyXWc1thtfX3L7pSVqd"; // Dustfolio
export const LOCKIN_MINT = "8Ki8DpuWNxu9VsS3kQbarsCWMcFGWkzzA8pUPto9zBd5"; // Lockin
export const REFERAL_WALLET = "2J8jsZmyTRwCYfX4aAKqdh763Y2UHMudnRh7b9Z9hBXE"; // Jupiter Swap Referral Public Key
export const FEE_ADDRESS = "HtwJmJn17DUrQ1cdgPHjqPnXJxNjJPdfwM13wTdbA4Ep"; // Jupiter Swap Referral Token Address

// Just in case we need to change these
export const COMPUTE_UNIT_LIMIT = 200000;
export const COMPUTE_UNIT_PRICE = 1;
export const MAX_RETRIES = 3;
export const JUPITER_API_RETRY_DELAY = 1000;

// Default IDs (Shouldnt need change)
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const REFER_PROGRAM_ID = new PublicKey("REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3");
export const TOKEN_PROGRAM_ID_ADDRESS = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const JUPITER_PROJECT = new PublicKey("45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp",);