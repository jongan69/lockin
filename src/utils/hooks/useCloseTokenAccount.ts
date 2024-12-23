import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { 
  PublicKey, 
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage 
} from "@solana/web3.js";
import { createCloseAccountInstruction } from "@solana/spl-token";
import { toast } from "react-hot-toast";
import { getTipAccounts, sendTxUsingJito, waitForBundleConfirmation } from "@utils/hooks/useCreateSwapInstructions";
import { SystemProgram } from "@solana/web3.js";

const MAX_ACCOUNTS_PER_TX = 12; // Conservative limit for accounts per transaction
const BUNDLE_TIP = 1000; // Tip amount for Jito bundles
const USER_REJECTION_ERROR = 'User rejected the request';

export const useCloseTokenAccount = () => {
  const { publicKey, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const closeTokenAccount = async (tokenAccountPubkey: PublicKey): Promise<TransactionInstruction> => {
    if (!publicKey || !tokenAccountPubkey) {
      throw new Error("Wallet not connected or not able to sign transactions or Error with token account address");
    }

    const tokenAccount = new PublicKey(tokenAccountPubkey);
    console.log("Preparing to close token account: ", tokenAccount.toString());

    // Check if the token account is valid
    let tokenAccountInfo;
    try {
      tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      if (!tokenAccountInfo) {
        throw new Error("Token account not found");
      }
    } catch (error) {
      console.error("Failed to fetch token account info:", error);
      toast.error("Failed to fetch token account info. Please Refresh the page.");
      throw error;
    }

    const closeInstruction = createCloseAccountInstruction(
      tokenAccount,
      publicKey, // destination
      publicKey // owner of token account
    );
    return closeInstruction;
  };

  const closeTokenAccountsAndSendTransaction = async (
    tokenAccounts: PublicKey[],
    setMessage?: (msg: string) => void
  ) => {
    if (!publicKey || !signAllTransactions) {
      throw new Error("Wallet not connected");
    }

    try {
      setMessage?.("Preparing to close token accounts...");
      const tipAccount = await getTipAccounts();

      // Split token accounts into chunks
      const chunks: PublicKey[][] = [];
      for (let i = 0; i < tokenAccounts.length; i += MAX_ACCOUNTS_PER_TX) {
        chunks.push(tokenAccounts.slice(i, i + MAX_ACCOUNTS_PER_TX));
      }

      console.log(`Split ${tokenAccounts.length} accounts into ${chunks.length} chunks`);
      
      // Create all transactions
      const transactions: VersionedTransaction[] = [];
      const { blockhash } = await connection.getLatestBlockhash();

      for (const chunk of chunks) {
        const instructions = await Promise.all(
          chunk.map(account => closeTokenAccount(account))
        );

        const tipInstruction = SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(tipAccount),
          lamports: BUNDLE_TIP,
        });

        const messageV0 = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: blockhash,
          instructions: [...instructions, tipInstruction],
        }).compileToV0Message();

        transactions.push(new VersionedTransaction(messageV0));
      }

      setMessage?.("Please approve the transaction in your wallet...");
      
      try {
        // Sign all transactions at once
        const signedTransactions = await signAllTransactions(transactions);

        // Send transactions as Jito bundles
        for (let i = 0; i < signedTransactions.length; i++) {
          setMessage?.(`Processing chunk ${i + 1}/${signedTransactions.length}...`);
          const signedTx = signedTransactions[i];
          const serializedTx = signedTx.serialize();
          const bundleId = await sendTxUsingJito([serializedTx]);
          
          setMessage?.(`Confirming chunk ${i + 1}...`);
          const confirmed = await waitForBundleConfirmation(bundleId);
          if (!confirmed) {
            throw new Error(`Bundle ${bundleId} failed to confirm`);
          }
        }

        toast.success("Successfully closed all token accounts!");
        return true;
      } catch (error: any) {
        if (error?.message?.includes(USER_REJECTION_ERROR)) {
          toast.error("Transaction rejected by user");
          return false;
        }
        throw error;
      }
    } catch (error: any) {
      console.error("Failed to close token accounts:", error);
      toast.error(error?.message || "Failed to close token accounts. Please try again.");
      throw error;
    }
  };

  return { closeTokenAccount, closeTokenAccountsAndSendTransaction };
};
