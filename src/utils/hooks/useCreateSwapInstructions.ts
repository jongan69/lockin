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
const MAX_CHUNK_SIZE = 1232; // Solana's max transaction size
const COMPUTE_UNIT_LIMIT = 200000;
const COMPUTE_UNIT_PRICE = 1;
const BUNDLE_STATUS_CHECK_INTERVAL = 2000; // 2 seconds
const MAX_STATUS_CHECKS = 30; // Maximum number of status checks (60 seconds total)
const TRANSACTION_DELAY = 300; // 300ms between transactions
const RATE_LIMIT_RETRY_DELAY = 1000; // 1 second wait when rate limited
const MAX_RATE_LIMIT_RETRIES = 3; // Maximum number of retries for rate limits
const JUPITER_API_RETRY_DELAY = 1000; // 1 second between Jupiter API retries
const MAX_JUPITER_RETRIES = 3;
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';
const MAX_ACCOUNTS_PER_TRANSACTION = 64; // Solana's limit
const MAX_INSTRUCTIONS_PER_CHUNK = 6; // Conservative limit for instructions
const BATCH_SIZE = 1; // Process one token at a time

// Add these constants at the top
const JUPITER_API_ENDPOINTS = [
  'https://quote-api.jup.ag/v6',
  'https://jupiter-price-api.solana.com/v4', // Alternative endpoint
  'https://jup-api.solana.fm/v4'             // Another fallback
];

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

const waitForBundleConfirmation = async (bundleId: string): Promise<boolean> => {
  let checks = 0;
  while (checks < MAX_STATUS_CHECKS) {
    const status = await getBundleStatus(bundleId);
    if (status.result.value.length > 0) {
      const confirmation = status.result.value[0].confirmation_status;
      if (confirmation === 'confirmed' || confirmation === 'finalized') {
        return true;
      }
      if (status.result.value[0].err) {
        throw new Error(`Bundle failed: ${JSON.stringify(status.result.value[0].err)}`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, BUNDLE_STATUS_CHECK_INTERVAL));
    checks++;
  }
  throw new Error('Bundle confirmation timed out');
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const sendTransactionChunks = async (
  instructions: TransactionInstruction[],
  publicKey: PublicKey,
  signAllTransactions: any,
  connection: Connection,
  setMessage: (msg: string) => void,
  bundleTip: number,
  tipAccount: string,
  description: string
): Promise<string> => {
  let retries = 0;
  
  while (retries <= MAX_RATE_LIMIT_RETRIES) {
    try {
      // Add compute budget and priority fee instructions at the start
      const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({ 
        units: COMPUTE_UNIT_LIMIT 
      });
      const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ 
        microLamports: COMPUTE_UNIT_PRICE 
      });

      // Add tip instruction at the end
      const tipInstruction = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(tipAccount),
        lamports: bundleTip,
      });

      const allInstructions = [
        computeBudgetInstruction,
        priorityFeeInstruction,
        ...instructions,
        tipInstruction
      ];

      const { blockhash } = await connection.getLatestBlockhash({ 
        commitment: 'processed' 
      });

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: allInstructions,
      }).compileToV0Message([]);

      const transaction = new VersionedTransaction(messageV0);

      try {
        const signedTransaction = await signAllTransactions([transaction]);
        const serializedTx = signedTransaction[0].serialize();
        const bundleId = await sendTxUsingJito([serializedTx]);
        setMessage('Sending transaction: ' + bundleId);
        return bundleId;
      } catch (signError: any) {
        console.error('Transaction signing error:', signError);
        if (signError.message.includes('overruns')) {
          throw new Error('Transaction too large. Please try with fewer tokens at once.');
        }
        throw signError;
      }

    } catch (error: any) {
      if (error.toString().includes('Rate limit exceeded') && retries < MAX_RATE_LIMIT_RETRIES) {
        retries++;
        setMessage(`Rate limit hit, waiting ${RATE_LIMIT_RETRY_DELAY/1000}s before retry ${retries}/${MAX_RATE_LIMIT_RETRIES}...`);
        await sleep(RATE_LIMIT_RETRY_DELAY);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded for rate limit');
};

const fetchJupiterQuote = async (params: QuoteGetRequest): Promise<any> => {
  try {
    const searchParams = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount.toString(),
      slippageBps: (params.slippageBps || 50).toString(),
      onlyDirectRoutes: (params.onlyDirectRoutes || false).toString(),
    });

    if (params.maxAutoSlippageBps) {
      searchParams.append('maxAutoSlippageBps', params.maxAutoSlippageBps.toString());
    }
    if (params.platformFeeBps) {
      searchParams.append('platformFeeBps', params.platformFeeBps.toString());
    }
    if (params.autoSlippageCollisionUsdValue) {
      searchParams.append('autoSlippageCollisionUsdValue', params.autoSlippageCollisionUsdValue.toString());
    }

    const response = await fetch(`/api/jupiter-quote?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Jupiter quote fetch error:', error);
    throw error;
  }
};

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

const fetchWithRetry = async (url: string, options: RequestInit, retries = MAX_JUPITER_RETRIES): Promise<Response> => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${i + 1} failed:`, error);
      
      if (error.message.includes('400')) {
        throw error;
      }
      
      if (i < retries - 1) {
        await sleep(JUPITER_API_RETRY_DELAY * (i + 1));
        continue;
      }
    }
  }
  throw lastError;
};

// Add these error handling utilities at the top
const isJupiterError = (error: any) => {
  return error?.response?.data?.error || error?.message?.includes('Jupiter');
};

const getSwapErrorMessage = (error: any): string => {
  if (error?.toString().includes('interceptors did not return')) {
    return 'Connection error with Jupiter API, retrying...';
  }
  if (error?.toString().includes('Rate limit exceeded')) {
    return 'Rate limit hit, please wait a moment before trying again';
  }
  if (error?.toString().includes('insufficient funds')) {
    return 'Insufficient funds for swap';
  }
  if (error?.toString().includes('slippage tolerance exceeded')) {
    return 'Price impact too high, try a smaller amount or adjust slippage';
  }
  if (isJupiterError(error)) {
    return `Jupiter swap error: ${error.response?.data?.error || error.message}`;
  }
  return `Swap failed: ${error.toString()}`;
};

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
    setErrorMessage: (msg: string | null) => void,
    onSuccess?: () => void
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
      const selectedItemsArray = Array.from(selectedItems);
      
      // Process tokens in smaller batches
      for (let i = 0; i < selectedItemsArray.length; i += BATCH_SIZE) {
        const batch = selectedItemsArray.slice(i, i + BATCH_SIZE);
        let batchInstructions: TransactionInstruction[] = [];

        for (const selectedItem of batch) {
          const balanceInSmallestUnit = selectedItem.amount * Math.pow(10, selectedItem.decimals);
          if (balanceInSmallestUnit === 0) {
            setClosedTokenAccounts((prev: Set<any>) => new Set(prev).add(selectedItem.tokenAddress));
            continue;
          }

          setMessage(`Preparing swap for ${selectedItem.symbol || selectedItem.mintAddress}...`);

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
          if (!quote) {
            console.log(`Skipping token ${selectedItem.symbol || selectedItem.mintAddress} - no route found`);
            setClosedTokenAccounts((prev: Set<any>) => new Set(prev).add(selectedItem.tokenAddress));
            continue;
          }

          let swapInstructionsResponse;
          try {
            swapInstructionsResponse = await fetchWithRetry(
              '/api/jupiter-swap',
              {
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
              }
            );
          } catch (error) {
            console.error(`Failed to fetch swap instructions for ${selectedItem.symbol || selectedItem.mintAddress}:`, error);
            setClosedTokenAccounts((prev: Set<any>) => new Set(prev).add(selectedItem.tokenAddress));
            continue;
          }

          const instructions = await swapInstructionsResponse.json();
          if (instructions.error) {
            console.error(`Jupiter API error for ${selectedItem.symbol || selectedItem.mintAddress}:`, instructions.error);
            setClosedTokenAccounts((prev: Set<any>) => new Set(prev).add(selectedItem.tokenAddress));
            continue;
          }

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

          if (swapInstructionsList.length > 0) {
            batchInstructions.push(...swapInstructionsList);
            setClosedTokenAccounts((prev: Set<any>) => new Set(prev).add(selectedItem.tokenAddress));
          }
        }

        // Process each batch separately
        if (batchInstructions.length > 0) {
          const transactionChunks = splitInstructionsIntoChunks(batchInstructions, publicKey, connection);
          for (const chunk of transactionChunks) {
            await sendTransactionChunks(
              chunk,
              publicKey,
              signAllTransactions,
              connection,
              setMessage,
              bundleTip,
              tipAccount,
              'Processing batch...'
            );
            // Add delay between chunks
            await sleep(1000);
          }
        }
      }

      setMessage('Transaction confirmed successfully!');
      toast.success('Transaction confirmed successfully!');
      setShowPopup(false);
      if (onSuccess) onSuccess();
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
    maxBps,
    bundleTip,
    setSelectedItems,
    jupiterQuoteApi,
    setClosedTokenAccounts,
  ]);

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
    let currentSize = 0;
    
    // Account for transaction header size
    const headerSize = 3 + 32 + 32 + 8 + 1 + 1; // version + fee payer + blockhash + counter + signatures
    currentSize += headerSize;

    instructions.forEach(instruction => {
      // Calculate precise instruction size
      const instructionSize = 1 + // discriminator
        1 + // accounts length
        instruction.keys.length * 33 + // account metas (pubkey + is_signer + is_writable)
        1 + // data length
        instruction.data.length; // actual data

      if (currentSize + instructionSize > maxChunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentSize = headerSize;
        }
      }

      currentChunk.push(instruction);
      currentSize += instructionSize;
    });

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  };

  return { handleClosePopup, sending };
};

