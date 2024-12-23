import { useState, useCallback } from "react";
import { Connection, PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage } from "@solana/web3.js";
import { toast } from "react-hot-toast";

const TRANSACTION_SIZE_LIMIT = 1232; // Max size limit in bytes

export const useSendBatchTransaction = () => {
  const [sending, setSending] = useState(false);

  const createTransaction = (instrs: TransactionInstruction[], publicKey: PublicKey, blockhash: string) => {
    const message = new TransactionMessage({
      payerKey: publicKey,
      recentBlockhash: blockhash,
      instructions: instrs,
    }).compileToV0Message([]);
    return new VersionedTransaction(message);
  };

  const sendTransactionBatch = useCallback(async (
    instructions: TransactionInstruction[],
    publicKey: PublicKey,
    signAllTransactions: any,
    connection: Connection,
    setMessage: (msg: string) => void,
    sendTransaction: (arg0: any, arg1: any, arg2: { minContextSlot: any; }) => any,
    description: string
  ) => {
    console.log('Starting batch transaction:', {
      description,
      instructionCount: instructions.length,
      publicKey: publicKey.toString()
    });

    try {
      setSending(true);
      
      const { blockhash } = await connection.getLatestBlockhash({ commitment: 'processed' });
      console.log('Retrieved blockhash:', blockhash);

      // Log batch creation
      let batches = [];
      let currentBatch: TransactionInstruction[] = [];
      let batchSizes: number[] = [];

      for (const instruction of instructions) {
        currentBatch.push(instruction);
        const currentTransaction = createTransaction(currentBatch, publicKey, blockhash);
        const serializedSize = currentTransaction.serialize().length;
        
        console.log('Current transaction size:', {
          size: serializedSize,
          limit: TRANSACTION_SIZE_LIMIT,
          instructionCount: currentBatch.length
        });

        if (serializedSize > TRANSACTION_SIZE_LIMIT) {
          currentBatch.pop();
          batches.push([...currentBatch]);
          batchSizes.push(serializedSize);
          currentBatch = [instruction];
          console.log('Created new batch due to size limit');
        }
      }

      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        const finalTransaction = createTransaction(currentBatch, publicKey, blockhash);
        batchSizes.push(finalTransaction.serialize().length);
      }

      console.log('Batch summary:', {
        totalBatches: batches.length,
        batchSizes,
        totalInstructions: instructions.length
      });

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        console.log(`Processing batch ${i + 1}/${batches.length}`);
        const batch = batches[i];
        const batchTransaction = createTransaction(batch, publicKey, blockhash);
        
        console.log('Signing batch transaction...');
        const signedBatchTransaction = await signAllTransactions([batchTransaction]);

        const { context: { slot: minContextSlot } } = await connection.getLatestBlockhashAndContext({ commitment: 'processed' });
        console.log('Sending batch with context slot:', minContextSlot);
        
        await sendTransaction(signedBatchTransaction[0], connection, { minContextSlot });
        console.log(`Completed batch ${i + 1}`);
      }

      console.log('All batches processed successfully');
      setSending(false);
    } catch (error: any) {
      console.error('Batch transaction error:', {
        error: error.toString(),
        stack: error.stack,
        description
      });
      setSending(false);
      throw error;
    }
  }, []);

  return { sendTransactionBatch, sending };
};
