import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import {
  Connection, PublicKey, VersionedTransaction, TransactionInstruction,
  TransactionMessage, AddressLookupTableAccount, SystemProgram
} from "@solana/web3.js";
import { toast } from "react-hot-toast";
import { createJupiterApiClient, QuoteGetRequest } from "@jup-ag/api";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { useState, useCallback } from "react";

// Hardcoded variables
const BUNDLE_ENDPOINT = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
const MAX_RETRIES = 3;
const AUTO_SLIPPAGE_COLLISION_USD_VALUE = 1000;
const PLATFORM_FEE_BPS = 10;
const MAX_CHUNK_SIZE = 1232; // Max instruction size for Solana transactions
const COMPUTE_UNIT_LIMIT = 200000;
const COMPUTE_UNIT_PRICE = 1;

export type BundleStatus = {
  jsonrpc: string;
  result: {
    context: { slot: number };
    value: {
      bundle_id: string;
      transactions: string[];
      slot: number;
      confirmation_status: string;
      err: any;
    }[];
  };
  id: number;
};

export async function getBundleStatus(id: string): Promise<BundleStatus> {
  const payload = { jsonrpc: "2.0", id: 1, method: "getBundleStatuses", params: [[id]] };

  const res = await fetch(BUNDLE_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error.message);

  return json;
}

export async function getTipAccounts(): Promise<string> {
  const payload = { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] };

  const res = await fetch(BUNDLE_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error.message);

  const tipAccounts = json.result;
  return tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
}

export async function sendTxUsingJito(serializedTxs: (Uint8Array | Buffer | number[])[]): Promise<string> {
  const payload = { jsonrpc: "2.0", id: 1, method: "sendBundle", params: [serializedTxs.map(t => bs58.encode(t))] };

  const res = await fetch(BUNDLE_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error.message);

  return json.result;
}

export const useCreateSwapInstructions = (
  publicKey: PublicKey | null,
  connection: Connection,
  signAllTransactions: any,
  targetTokenMintAddress: string,
  dustReceiver: PublicKey,
  maxBps: number,
  referralAccountPubkey: PublicKey,
  referralProgramId: PublicKey,
  bundleTip: number,
  setShowPopup: (show: boolean) => void,
  setSelectedItems: (items: Set<any>) => void,
  setClosedTokenAccounts: any,
) => {
  const [sending, setSending] = useState(false);
  const jupiterQuoteApi = createJupiterApiClient();

  const handleClosePopup = useCallback(async (
    answer: boolean,
    selectedItems: Set<any>,
    setMessage: (msg: string) => void,
    setErrorMessage: (msg: string | null) => void
  ) => {
    if (!answer || selectedItems.size === 0 || !publicKey || !signAllTransactions) {
      setShowPopup(false);
      setSelectedItems(new Set());
      return;
    }

    setSending(true);
    setMessage('Preparing transactions...');

    let swapInstructions: TransactionInstruction[] = [];

    try {
      const tipAccount = await getTipAccounts();

      for (const selectedItem of selectedItems) {
        const balanceInSmallestUnit = selectedItem.amount * Math.pow(10, selectedItem.decimals);
        if (balanceInSmallestUnit === 0) {
          setClosedTokenAccounts((prev: Set<any>) => new Set(prev).add(selectedItem.tokenAddress));
          continue;
        }

        const params: QuoteGetRequest = {
          inputMint: new PublicKey(selectedItem.mintAddress).toBase58(),
          outputMint: new PublicKey(targetTokenMintAddress).toBase58(),
          amount: balanceInSmallestUnit,
          autoSlippage: true,
          autoSlippageCollisionUsdValue: AUTO_SLIPPAGE_COLLISION_USD_VALUE,
          platformFeeBps: PLATFORM_FEE_BPS,
          maxAutoSlippageBps: maxBps,
          minimizeSlippage: true,
          onlyDirectRoutes: false,
          asLegacyTransaction: false,
        };

        const [feeAccount] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("referral_ata"),
            referralAccountPubkey.toBuffer(),
            new PublicKey(targetTokenMintAddress).toBuffer(),
          ],
          referralProgramId
        );

        let quote = await fetchQuoteWithRetries(jupiterQuoteApi, params);

        const response = await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userPublicKey: publicKey.toBase58(),
            wrapAndUnwrapSol: true,
            useSharedAccounts: false,
            feeAccount: feeAccount.toBase58(),
            quoteResponse: quote,
            dynamicComputeUnitLimit: true,
            skipUserAccountsRpcCalls: true
          })
        });

        const instructions = await response.json();
        if (instructions.error) throw new Error("Failed to get swap instructions: " + instructions.error);

        const {
          computeBudgetInstructions,
          setupInstructions,
          swapInstruction: swapInstructionPayload,
          cleanupInstruction,
          addressLookupTableAddresses,
        } = instructions;

        const swapInstructionsList = [
          ...(setupInstructions ? setupInstructions.map(deserializeInstruction) : []),
          deserializeInstruction(swapInstructionPayload),
          ...(Array.isArray(cleanupInstruction) ? cleanupInstruction.map(deserializeInstruction) : [deserializeInstruction(cleanupInstruction)]),
        ];

        swapInstructions.push(...swapInstructionsList);
        setClosedTokenAccounts((prev: Set<any>) => new Set(prev).add(selectedItem.tokenAddress));
      }

      if (swapInstructions.length > 0) {
        const transactionChunks = splitInstructionsIntoChunks(swapInstructions, publicKey, connection);
        for (const chunk of transactionChunks) {
          await sendTransactionChunks(chunk, publicKey, signAllTransactions, connection, setMessage, bundleTip, tipAccount, 'Processing bundled Jupiter swaps using Jito...');
        }
      }

      setMessage('Transaction confirmed successfully!');
      toast.success('Transaction confirmed successfully!');
      setShowPopup(false);
    } catch (error: any) {
      console.error("Error during transaction:", error.toString());
      setErrorMessage(`Transaction failed: ${error}`);
      toast.error("Transaction failed. Please try again.");
    } finally {
      setSending(false);
    }
  }, [
    publicKey,
    signAllTransactions,
    connection,
    setShowPopup,
    targetTokenMintAddress,
    referralAccountPubkey,
    referralProgramId,
    bundleTip,
    setSelectedItems,
    jupiterQuoteApi,
    setClosedTokenAccounts
  ]);

  const fetchQuoteWithRetries = async (apiClient: any, params: QuoteGetRequest) => {
    let quote = null;
    let attemptCount = 0;

    while (!quote && attemptCount < MAX_RETRIES) {
      attemptCount++;
      try {
        quote = await apiClient.quoteGet(params);
        if (quote?.error) throw new Error(`Failed to fetch quote: ${quote.error}`);
      } catch (error: any) {
        if (error.message.includes("ROUTE_PLAN_DOES_NOT_CONSUME_ALL_THE_AMOUNT")) {
          params.amount = Math.floor(params.amount * 0.95); // Reduce amount by 5%
        } else if (error.response && error.response.status === 400) {
          throw new Error(`Bad Request: ${error.toString()}`);
        } else {
          throw error;
        }
      }
    }

    if (!quote) throw new Error("Failed to fetch a valid quote after multiple attempts");
    return quote;
  };

  const deserializeInstruction = (instruction: any) => {
    return new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: instruction.accounts.map((key: any) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: Buffer.from(instruction.data, "base64"),
    });
  };

  const splitInstructionsIntoChunks = (
    instructions: TransactionInstruction[],
    publicKey: PublicKey,
    connection: Connection,
    maxChunkSize = MAX_CHUNK_SIZE
  ): TransactionInstruction[][] => {
    const chunks: TransactionInstruction[][] = [];
    let currentChunk: TransactionInstruction[] = [];
    let currentChunkSize = 0;

    instructions.forEach(instruction => {
      const instructionSize = instruction.data.length + (instruction.keys.length * 32);

      if (currentChunkSize + instructionSize > maxChunkSize) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChunkSize = 0;
      }

      currentChunk.push(instruction);
      currentChunkSize += instructionSize;
    });

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  };

  const sendTransactionChunks = async (
    instructions: TransactionInstruction[],
    publicKey: PublicKey,
    signAllTransactions: any,
    connection: Connection,
    setMessage: (msg: string) => void,
    bundleTip: number,
    tipAccount: string,
    description: string
  ) => {
    try {
      const tipInstruction = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(tipAccount),
        lamports: bundleTip,
      });

      instructions.push(tipInstruction);

      const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT });
      const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE });

      instructions.unshift(computeBudgetInstruction, priorityFeeInstruction);

      const { blockhash } = await connection.getLatestBlockhash({ commitment: 'processed' });
      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message([]);

      const transaction = new VersionedTransaction(messageV0);
      const signedTransaction = await signAllTransactions([transaction]);
      const serializedTx = signedTransaction[0].serialize();

      const bundleId = await sendTxUsingJito([serializedTx]);
      setMessage('Sending transaction: ' + bundleId);
      const bundleStatus = await getBundleStatus(bundleId);
      setSelectedItems(new Set());

      if (bundleStatus.result.value.length > 0) {
        console.log(`Completed sending transaction batch: ${JSON.stringify(bundleStatus)}`);
      } else {
        console.error(`Jito Bundle Status Seems to be Null: ${JSON.stringify(bundleStatus)}`);
        setMessage(`Result Jito Bundle ID: ${bundleId} \nJito Bundle Status ${JSON.stringify(bundleStatus.result)}`);
      }
    } catch (error: any) {
      console.error(`Error during chunked and bundled transaction: ${description}`, error.toString());
      throw new Error(`Error during chunked and bundled transaction: ${description}, ${error.toString()}`);
    }
  };

  return { handleClosePopup, sending };
};
