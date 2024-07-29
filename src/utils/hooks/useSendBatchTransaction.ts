import { useState, useCallback } from "react";
import { Connection, PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage } from "@solana/web3.js";
import { toast } from "react-hot-toast";

export const useSendBatchTransaction = () => {
  const [sending, setSending] = useState(false);

  const sendTransactionBatch = useCallback(async (
    instructions: TransactionInstruction[],
    publicKey: PublicKey,
    signAllTransactions: any,
    connection: Connection,
    setMessage: (msg: string) => void,
    sendTransaction: (arg0: any, arg1: any, arg2: { minContextSlot: any; }) => any,
    description: string
  ) => {
    try {
      setSending(true);
      console.log(`Entering sendTransactionBatch: ${description}`);

      const { blockhash } = await connection.getLatestBlockhash({ commitment: 'processed' });
      const message = new TransactionMessage({
        payerKey: new PublicKey(publicKey),
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message([]);

      const transaction = new VersionedTransaction(message);
      const signedTransaction = await signAllTransactions([transaction]);

      setMessage('Sending transaction...');
      const { context: { slot: minContextSlot } } = await connection.getLatestBlockhashAndContext({ commitment: 'processed' });
      await sendTransaction(signedTransaction[0], connection, { minContextSlot });

      console.log("Completed sending transaction batch");
      setSending(false);
      toast.success('Transaction confirmed successfully!');
    } catch (error: any) {
      setSending(false);
      console.error(`Error during transaction batch send: ${description}`, error.toString());
      console.log("Failed Instructions:", instructions); // Log the instructions causing the error
      throw new Error(`Error during transaction batch send: ${description}, ${error.toString()}`);
    }
  }, []);

  return { sendTransactionBatch, sending };
};