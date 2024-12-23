import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import {
  Connection, PublicKey, VersionedTransaction, TransactionInstruction,
  TransactionMessage, SystemProgram
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
const MAX_CHUNK_SIZE = 700; // Even more conservative size limit
const COMPUTE_UNIT_LIMIT = 200000;
const COMPUTE_UNIT_PRICE = 1;
const BUNDLE_STATUS_CHECK_INTERVAL = 2000; // 2 seconds
const MAX_STATUS_CHECKS = 30; // Maximum number of status checks (60 seconds total)
const JUPITER_API_RETRY_DELAY = 1000; // 1 second between Jupiter API retries
const MAX_JUPITER_RETRIES = 3;
const MAX_INSTRUCTIONS_PER_CHUNK = 1; // Process one instruction at a time
const TRANSACTION_OVERHEAD = 500; // Increase overhead buffer

// Add these constants at the top

export type BundleStatus = {
  jsonrpc: string;
  result: {
    context: { slot: number };
    value: {
      bundle_id: string;
      transactions: string[];
      slot: number;
      confirmation_status: 'processed' | 'confirmed' | 'finalized' | string;
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

// Add new constants for bundle confirmation
const MAX_BUNDLE_CONFIRMATION_RETRIES = 3;
const BUNDLE_CONFIRMATION_RETRY_DELAY = 5000; // 5 seconds

// Update the waitForBundleConfirmation function
export const waitForBundleConfirmation = async (bundleId: string, retryCount = 0): Promise<boolean> => {
  let checks = 0;
  
  try {
    while (checks < MAX_STATUS_CHECKS) {
      const status = await getBundleStatus(bundleId);
      
      // Add more detailed checks
      if (status?.result?.value?.[0]) {
        const bundleStatus = status.result.value[0];
        
        // Check for confirmation status
        if (bundleStatus.confirmation_status) {
          if (bundleStatus.confirmation_status === 'confirmed' || 
              bundleStatus.confirmation_status === 'finalized') {
            return true;
          }
        }
        
        // Check for error status
        if (bundleStatus.err) {
          // Success case
          if (JSON.stringify(bundleStatus.err) === '{"Ok":null}') {
            return true;
          }
          
          // Real error case
          if (JSON.stringify(bundleStatus.err) !== '{"Ok":null}') {
            throw new Error(`Bundle failed: ${JSON.stringify(bundleStatus.err)}`);
          }
        }
      }

      // If we get here, keep waiting
      await sleep(BUNDLE_STATUS_CHECK_INTERVAL);
      checks++;
    }

    // If we reach here, confirmation timed out
    if (retryCount < MAX_BUNDLE_CONFIRMATION_RETRIES) {
      console.log(`Bundle confirmation timed out, retrying (${retryCount + 1}/${MAX_BUNDLE_CONFIRMATION_RETRIES})`);
      await sleep(BUNDLE_CONFIRMATION_RETRY_DELAY);
      return waitForBundleConfirmation(bundleId, retryCount + 1);
    }

    console.error('Bundle confirmation failed after all retries');
    return false; // Return false instead of throwing
  } catch (error) {
    console.error('Bundle confirmation error:', error);
    if (retryCount < MAX_BUNDLE_CONFIRMATION_RETRIES) {
      console.log(`Retrying bundle confirmation (${retryCount + 1}/${MAX_BUNDLE_CONFIRMATION_RETRIES})`);
      await sleep(BUNDLE_CONFIRMATION_RETRY_DELAY);
      return waitForBundleConfirmation(bundleId, retryCount + 1);
    }
    return false; // Return false instead of throwing
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Update constants
const MAX_TRANSACTION_RETRIES = 3;
const RETRY_DELAY = 2000;
const MAX_ACCOUNTS_PER_TRANSACTION = 15; // Reduce account limit

// Add new helper function to split large instructions
const splitLargeInstruction = (instruction: TransactionInstruction): TransactionInstruction[] => {
  if (instruction.keys.length <= MAX_ACCOUNTS_PER_TRANSACTION) {
    return [instruction];
  }

  // For setup/cleanup instructions that are too large, we'll process them in chunks
  const chunks: TransactionInstruction[] = [];
  let currentKeys = [];
  
  for (let i = 0; i < instruction.keys.length; i++) {
    currentKeys.push(instruction.keys[i]);
    
    if (currentKeys.length === MAX_ACCOUNTS_PER_TRANSACTION || i === instruction.keys.length - 1) {
      chunks.push(new TransactionInstruction({
        programId: instruction.programId,
        keys: currentKeys,
        data: instruction.data,
      }));
      currentKeys = [];
    }
  }

  return chunks;
};

// Add new helper function to process single instruction
const processSingleInstruction = async (
  instruction: TransactionInstruction,
  publicKey: PublicKey,
  signAllTransactions: any,
  connection: Connection,
  setMessage: (msg: string) => void,
  bundleTip: number,
  tipAccount: string,
  retryCount = 0
): Promise<boolean> => {
  try {
    // Split large instructions into smaller ones
    const instructionChunks = splitLargeInstruction(instruction);
    let success = true;

    for (let i = 0; i < instructionChunks.length; i++) {
      const chunk = instructionChunks[i];
      
      if (i > 0) {
        await sleep(1000); // Add delay between chunks
      }

      const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
        units: COMPUTE_UNIT_LIMIT
      });

      const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: COMPUTE_UNIT_PRICE
      });

      const tipInstruction = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(tipAccount),
        lamports: bundleTip,
      });

      const { blockhash } = await connection.getLatestBlockhash({
        commitment: 'processed'
      });

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [
          computeBudgetInstruction,
          priorityFeeInstruction,
          chunk,
          tipInstruction
        ],
      }).compileToV0Message([]);

      const transaction = new VersionedTransaction(messageV0);

      try {
        const signedTransaction = await signAllTransactions([transaction]);
        const serializedTx = signedTransaction[0].serialize();
        const bundleId = await sendTxUsingJito([serializedTx]);

        // Wait for confirmation
        await waitForBundleConfirmation(bundleId);
      } catch (error: any) {
        console.error('Transaction error:', error);
        success = false;
        break;
      }
    }

    if (!success && retryCount < MAX_TRANSACTION_RETRIES) {
      await sleep(RETRY_DELAY);
      return processSingleInstruction(
        instruction,
        publicKey,
        signAllTransactions,
        connection,
        setMessage,
        bundleTip,
        tipAccount,
        retryCount + 1
      );
    }

    return success;
  } catch (error: any) {
    console.error('Processing error:', error);
    return false;
  }
};

// Add new constants for bundle handling
const MAX_BUNDLE_SIZE = 5; // Match BUNDLE_TRANSACTION_LIMIT from example
const BUNDLE_RETRY_DELAY = 2000;
const MAX_BUNDLE_RETRIES = 3;

// Add new constants for Jito integration
const LEADER_SLOT_CHECK_INTERVAL = 500; // 500ms between leader slot checks
const MAX_LEADER_SLOT_WAIT = 60000; // 60 seconds maximum wait time

// Add new helper function to wait for leader slot
const waitForNextLeaderSlot = async (
  connection: Connection,
  setMessage: (msg: string) => void
): Promise<boolean> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < MAX_LEADER_SLOT_WAIT) {
    try {
      const payload = { 
        jsonrpc: "2.0", 
        id: 1, 
        method: "getNextScheduledLeader", 
        params: [] 
      };

      const res = await fetch(BUNDLE_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      });

      const json = await res.json();
      if (json.error) throw new Error(json.error.message);

      const numSlots = json.result.nextLeaderSlot - json.result.currentSlot;
      if (numSlots <= 2) {
        return true;
      }

      setMessage(`Waiting for next Jito leader slot (${numSlots} slots away)...`);
      await sleep(LEADER_SLOT_CHECK_INTERVAL);
    } catch (error) {
      console.error('Error checking leader slot:', error);
      return false;
    }
  }
  return false;
};

// Update sendBundle function to wait for leader slot
const sendBundle = async (
  transactions: VersionedTransaction[],
  connection: Connection,
  setMessage: (msg: string) => void,
  retryCount = 0
): Promise<boolean> => {
  try {
    // Wait for next leader slot
    const isLeaderSlot = await waitForNextLeaderSlot(connection, setMessage);
    if (!isLeaderSlot) {
      throw new Error('Failed to find leader slot');
    }

    const serializedTxs = transactions.map(tx => tx.serialize());
    const bundleId = await sendTxUsingJito(serializedTxs);
    
    setMessage(`Sent bundle: ${bundleId}`);
    
    // Wait for confirmation
    const confirmed = await waitForBundleConfirmation(bundleId);
    if (!confirmed && retryCount < MAX_BUNDLE_RETRIES) {
      setMessage(`Bundle failed, retrying (${retryCount + 1}/${MAX_BUNDLE_RETRIES})...`);
      await sleep(BUNDLE_RETRY_DELAY);
      return sendBundle(transactions, connection, setMessage, retryCount + 1);
    }
    
    return confirmed;
  } catch (error) {
    console.error('Bundle error:', error);
    if (retryCount < MAX_BUNDLE_RETRIES) {
      await sleep(BUNDLE_RETRY_DELAY);
      return sendBundle(transactions, connection, setMessage, retryCount + 1);
    }
    return false;
  }
};

// Update sendTransactionChunks to process one instruction at a time
const sendTransactionChunks = async (
  instructions: TransactionInstruction[],
  publicKey: PublicKey,
  signAllTransactions: any,
  connection: Connection,
  setMessage: (msg: string) => void,
  bundleTip: number,
  tipAccount: string
): Promise<string> => {
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < instructions.length; i++) {
    try {
      const instruction = instructions[i];
      
      // Skip if too many accounts
      if (instruction.keys.length > MAX_ACCOUNTS_PER_TRANSACTION) {
        console.warn(`Skipping instruction with ${instruction.keys.length} accounts`);
        failureCount++;
        continue;
      }

      const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
        units: COMPUTE_UNIT_LIMIT
      });
      const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: COMPUTE_UNIT_PRICE
      });
      const tipInstruction = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(tipAccount),
        lamports: bundleTip,
      });

      const { blockhash } = await connection.getLatestBlockhash({
        commitment: 'processed'
      });

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [
          computeBudgetInstruction,
          priorityFeeInstruction,
          instruction,
          tipInstruction
        ],
      }).compileToV0Message([]);

      const transaction = new VersionedTransaction(messageV0);
      
      try {
        const signedTransaction = await signAllTransactions([transaction]);
        const serializedTx = signedTransaction[0].serialize();
        const bundleId = await sendTxUsingJito([serializedTx]);
        
        // Wait for confirmation
        const confirmed = await waitForBundleConfirmation(bundleId);
        if (confirmed) {
          successCount++;
        } else {
          failureCount++;
        }

        // Add delay between transactions
        if (i < instructions.length - 1) {
          await sleep(1000);
        }
      } catch (error) {
        console.error('Transaction error:', error);
        failureCount++;
      }
    } catch (error) {
      console.error(`Failed to process instruction ${i + 1}:`, error);
      failureCount++;
    }
  }

  if (successCount === 0) {
    throw new Error('All instructions failed to process');
  }

  console.log(`Processed ${successCount} instructions successfully, ${failureCount} failed`);
  return 'success';
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

// Add new constants
const VERIFY_BALANCE_RETRIES = 3;
const BALANCE_CHECK_INTERVAL = 2000; // 2 seconds

// Add new helper function to verify swap success
const verifySwapSuccess = async (
  connection: Connection,
  tokenAccount: string,
  expectedAmount: number,
  retryCount = 0
): Promise<boolean> => {
  try {
    const accountInfo = await connection.getParsedAccountInfo(new PublicKey(tokenAccount));
    if (!accountInfo.value) return false;

    const balance = (accountInfo.value.data as any).parsed.info.tokenAmount.amount;
    if (balance >= expectedAmount) return true;

    if (retryCount < VERIFY_BALANCE_RETRIES) {
      await sleep(BALANCE_CHECK_INTERVAL);
      return verifySwapSuccess(connection, tokenAccount, expectedAmount, retryCount + 1);
    }

    return false;
  } catch (error) {
    console.error('Balance verification error:', error);
    return false;
  }
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

    const results: { 
      token: string, 
      success: boolean, 
      error?: string 
    }[] = [];

    try {
      const tipAccount = await getTipAccounts();
      const selectedItemsArray = Array.from(selectedItems);

      for (const selectedItem of selectedItemsArray) {
        try {
          setMessage(`Processing ${selectedItem.symbol || selectedItem.mintAddress}...`);
          
          const balanceInSmallestUnit = selectedItem.amount * Math.pow(10, selectedItem.decimals);
          if (balanceInSmallestUnit === 0) {
            continue;
          }

          // Get quote
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

          const quote = await fetchQuoteWithRetries(jupiterQuoteApi, params);
          if (!quote) {
            results.push({ 
              token: selectedItem.symbol || selectedItem.mintAddress, 
              success: false, 
              error: 'No route found' 
            });
            continue;
          }

          // Get swap instructions
          const [feeAccount] = PublicKey.findProgramAddressSync(
            [
              Buffer.from("referral_ata"),
              referralAccountPubkey.toBuffer(),
              new PublicKey(targetTokenMintAddress).toBuffer(),
            ],
            referralProgramId
          );

          const swapInstructionsResponse = await fetchWithRetry(
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

          const instructions = await swapInstructionsResponse.json();
          if (instructions.error) {
            results.push({ 
              token: selectedItem.symbol || selectedItem.mintAddress, 
              success: false, 
              error: instructions.error 
            });
            continue;
          }

          // Process swap instructions
          const swapInstructions = [
            ...(instructions.setupInstructions || []).map(deserializeInstruction),
            deserializeInstruction(instructions.swapInstruction),
            ...(Array.isArray(instructions.cleanupInstruction) ? 
              instructions.cleanupInstruction.map(deserializeInstruction) : 
              [deserializeInstruction(instructions.cleanupInstruction)])
          ];

          // Send transaction
          const success = await sendTransactionChunks(
            swapInstructions,
            publicKey,
            signAllTransactions,
            connection,
            setMessage,
            bundleTip,
            tipAccount
          );

          if (success === 'success') {
            setClosedTokenAccounts((prev: Set<any>) => new Set(prev).add(selectedItem.tokenAddress));
            results.push({ 
              token: selectedItem.symbol || selectedItem.mintAddress, 
              success: true 
            });
          } else {
            results.push({ 
              token: selectedItem.symbol || selectedItem.mintAddress, 
              success: false, 
              error: 'Transaction failed' 
            });
          }

          await sleep(1000); // Delay between tokens
        } catch (error: any) {
          results.push({ 
            token: selectedItem.symbol || selectedItem.mintAddress, 
            success: false, 
            error: error.toString() 
          });
        }
      }

      // Show final results
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (successful === 0) {
        throw new Error('All swaps failed');
      }

      const resultMessage = `Completed ${successful} swaps successfully${failed > 0 ? `, ${failed} failed` : ''}`;
      setMessage(resultMessage);
      toast.success(resultMessage);
      
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error("Swap error:", error);
      setErrorMessage(error.toString());
      toast.error("Some swaps failed. Check console for details.");
    } finally {
      setSending(false);
      setShowPopup(false);
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
    instructions: TransactionInstruction[]  ): TransactionInstruction[][] => {
    const chunks: TransactionInstruction[][] = [];
    let currentChunk: TransactionInstruction[] = [];
    let currentInstructionCount = 0;
    let estimatedSize = 0;

    // Base transaction size including header
    const baseSize = 100; // Conservative estimate for transaction header

    for (const instruction of instructions) {
      // Estimate instruction size
      const instructionSize =
        1 + // Discriminator
        1 + // Number of accounts
        (instruction.keys.length * 33) + // Account metas (pubkey + is_signer + is_writable)
        2 + // Data length prefix
        instruction.data.length + // Actual instruction data
        TRANSACTION_OVERHEAD; // Additional buffer

      // Check if adding this instruction would exceed limits
      if (currentInstructionCount >= MAX_INSTRUCTIONS_PER_CHUNK ||
        estimatedSize + instructionSize + baseSize >= MAX_CHUNK_SIZE) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentInstructionCount = 0;
          estimatedSize = 0;
        }
      }

      currentChunk.push(instruction);
      currentInstructionCount++;
      estimatedSize += instructionSize;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    console.log(`Split ${instructions.length} instructions into ${chunks.length} chunks`);
    return chunks;
  };

  return { handleClosePopup, sending };
};

