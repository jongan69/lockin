import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createCloseAccountInstruction } from "@solana/spl-token";
import { toast } from "react-hot-toast";

export const useCloseTokenAccount = () => {
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const closeTokenAccount = async (tokenAccountPubkey: PublicKey | undefined) => {
    if (!publicKey || !signTransaction || !tokenAccountPubkey) {
      throw new Error("Wallet not connected or not able to sign transactions or Error with token account address");
    }

    const tokenAccount = new PublicKey(tokenAccountPubkey);

    // Check if the token account is valid
    let tokenAccountInfo;
    try {
      tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      if (!tokenAccountInfo) {
        throw new Error("Token account not found");
      }
    } catch (error) {
      console.error("Failed to fetch token account info:", error);
      toast.error("Failed to fetch token account info. Please try again.");
      throw error;
    }

    const transaction = new Transaction().add(
      createCloseAccountInstruction(
        tokenAccount,
        publicKey, // destination
        publicKey // owner of token account
      )
    );

    try {
      const { blockhash } = await connection.getLatestBlockhash();
      const latestBlockHash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTransaction = await signTransaction(transaction);
      const signature = await sendTransaction(signedTransaction, connection);
      
      await connection.confirmTransaction({ 
        blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature
      });

      console.log("Token account closed:", signature);
      toast.success("Token account closed successfully!");
      return signature;
    } catch (error) {
      console.error("Failed to close token account:", error);
      toast.error("Failed to close token account. Please try again.");
      throw error;
    }
  };

  return { closeTokenAccount };
};
