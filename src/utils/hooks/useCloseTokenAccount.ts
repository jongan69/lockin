import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage
} from "@solana/web3.js";
import { createCloseAccountInstruction } from "@solana/spl-token";
import { toast } from "react-hot-toast";

const MAX_ACCOUNTS_PER_TX = 12; // Conservative limit for accounts per transaction
const USER_REJECTION_ERROR = 'User rejected the request';
const MAX_RETRIES = 5; // Increased from 3
const INITIAL_BACKOFF = 2000; // Increased from 1000ms to 2000ms

// Helper function to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function for exponential backoff
const getBackoffDelay = (retryCount: number) => {
  return INITIAL_BACKOFF * Math.pow(2, retryCount) + Math.random() * 1000; // Added jitter
};

export const useCloseTokenAccount = () => {
  const { publicKey, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const fetchWithRetry = async (tokenAccount: PublicKey) => {
    let lastError;

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const info = await connection.getAccountInfo(tokenAccount);
        return info;
      } catch (error: any) {
        lastError = error;
        // Handle both 429 and CORS errors
        if (error?.message?.includes('429') || error?.message?.includes('CORS')) {
          const delay = getBackoffDelay(i);
          console.log(`Rate limited or CORS error, retrying after ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        // For other errors, log and continue with retry
        console.log(`Error fetching account ${tokenAccount.toString()}, attempt ${i + 1}/${MAX_RETRIES}`);
        await sleep(1000); // Basic delay for non-rate-limit errors
        continue;
      }
    }
    console.log(`Max retries reached for account ${tokenAccount.toString()}`);
    return null;
  };

  const closeTokenAccount = async (tokenAccountPubkey: PublicKey): Promise<TransactionInstruction | null> => {
    if (!publicKey || !tokenAccountPubkey) {
      return null;
    }

    const tokenAccount = new PublicKey(tokenAccountPubkey);
    console.log("Preparing to close token account: ", tokenAccount.toString());

    try {
      const tokenAccountInfo = await fetchWithRetry(tokenAccount);
      if (!tokenAccountInfo) {
        console.log(`Token account ${tokenAccount.toString()} not found or failed to fetch, skipping...`);
        return null;
      }

      const closeInstruction = createCloseAccountInstruction(
        tokenAccount,
        publicKey,
        publicKey,
        []
      );
      return closeInstruction;
    } catch (error) {
      console.error("Failed to fetch token account info:", error);
      console.log(`Skipping token account ${tokenAccount.toString()} due to error`);
      return null;
    }
  };

  const closeTokenAccountsAndSendTransaction = async (
    tokenAccounts: PublicKey[],
    setMessage?: (msg: string) => void
  ): Promise<boolean> => {
    if (!publicKey || !signAllTransactions) {
      toast.error("Please connect your wallet first");
      return false;
    }

    try {
      setMessage?.("Preparing to close token accounts...");

      // Split token accounts into chunks
      const chunks: PublicKey[][] = [];
      for (let i = 0; i < tokenAccounts.length; i += MAX_ACCOUNTS_PER_TX) {
        chunks.push(tokenAccounts.slice(i, i + MAX_ACCOUNTS_PER_TX));
      }

      console.log(`Split ${tokenAccounts.length} accounts into ${chunks.length} chunks`);

      // Create all transactions
      const transactions: VersionedTransaction[] = [];
      let blockhash;

      try {
        ({ blockhash } = await connection.getLatestBlockhash());
      } catch (error) {
        console.error("Failed to get blockhash:", error);
        toast.error("Network error. Please try again.");
        return false;
      }

      let successfulInstructions = 0;
      let failedAccounts = 0;

      for (const chunk of chunks) {
        try {
          const instructions = (await Promise.all(
            chunk.map(account => closeTokenAccount(account))
          )).filter((instruction): instruction is TransactionInstruction => instruction !== null);

          failedAccounts += chunk.length - instructions.length;
          successfulInstructions += instructions.length;

          // Skip if no valid instructions in this chunk
          if (instructions.length === 0) {
            console.log("No valid instructions in chunk, skipping...");
            continue;
          }

          const messageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhash,
            instructions: instructions,
          }).compileToV0Message();

          transactions.push(new VersionedTransaction(messageV0));
        } catch (error) {
          console.error("Error processing chunk:", error);
          failedAccounts += chunk.length;
          continue; // Continue with next chunk if one fails
        }
      }

      // Skip if no transactions to process
      if (transactions.length === 0) {
        toast.error(`No valid token accounts to close (${failedAccounts} accounts failed)`);
        return false;
      }

      setMessage?.("Please approve the transaction in your wallet...");

      try {
        const signedTransactions = await signAllTransactions(transactions);
        let successfulTxs = 0;

        // Send transactions sequentially
        for (let i = 0; i < signedTransactions.length; i++) {
          try {
            setMessage?.(`Processing chunk ${i + 1}/${signedTransactions.length}...`);
            const signedTx = signedTransactions[i];

            setMessage?.(`Sending chunk ${i + 1}...`);
            const signature = await connection.sendTransaction(signedTx);

            setMessage?.(`Confirming chunk ${i + 1}...`);
            const latestBlockhash = await connection.getLatestBlockhash();
            const confirmation = await connection.confirmTransaction({
              signature,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            });

            if (confirmation.value.err) {
              console.error(`Transaction ${signature} failed to confirm:`, confirmation.value.err);
              continue;
            }
            successfulTxs++;
          } catch (error) {
            console.error(`Error processing transaction ${i + 1}:`, error);
            continue;
          }
        }

        if (successfulTxs === 0) {
          toast.error("Failed to close any token accounts");
          return false;
        }

        if (successfulTxs < signedTransactions.length) {
          toast.success(`Partially successful: Closed accounts in ${successfulTxs}/${signedTransactions.length} transactions`);
        } else {
          toast.success("Successfully closed all token accounts!");
        }
        return true;
      } catch (error: any) {
        if (error?.message?.includes(USER_REJECTION_ERROR)) {
          toast.error("Transaction rejected by user");
          return false;
        }
        console.error("Transaction error:", error);
        toast.error("Failed to process transactions");
        return false;
      }
    } catch (error: any) {
      console.error("Failed to close token accounts:", error);
      toast.error(error?.message || "Failed to close token accounts. Please try again.");
      return false;
    }
  };

  return { closeTokenAccount, closeTokenAccountsAndSendTransaction };
};
