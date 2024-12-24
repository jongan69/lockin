import {
  Connection,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
  SystemProgram,
  TransactionMessage,
  MessageV0,
  MessageCompiledInstruction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import { useState, useCallback, useRef, useEffect } from "react";
import { createJupiterApiClient, QuoteGetRequest, SwapRequest } from "@jup-ag/api";
import { toast } from "react-hot-toast";
import { LOCKIN_MINT, REFER_PROGRAM_ID } from "@utils/globals";
import { fetchQuoteWithRetries } from "@utils/fetchQuote";
import bs58 from "bs58";
import { BLOCKENGINE } from "@utils/endpoints";

const JITO_BUNDLE_ENDPOINT = `https://${BLOCKENGINE}/api/v1/bundles`;

// Constants
const PLATFORM_FEE_BPS = 10;

// Helper Functions

// Sleep utility
// const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch tip accounts
export async function getTipAccounts(): Promise<string> {
  const payload = { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] };
  const res = await fetch(JITO_BUNDLE_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error.message);

  const tipAccounts = json.result;
  if (!Array.isArray(tipAccounts) || tipAccounts.length === 0) {
    throw new Error("No tip accounts available");
  }

  const selectedAccount = tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
  
  try {
    // Validate the account is a valid public key
    new PublicKey(selectedAccount);
    return selectedAccount;
  } catch (error) {
    throw new Error(`Invalid tip account format: ${selectedAccount}`);
  }
}

// Derive Fee Account
export async function getFeeAccount(
  referralAccount: PublicKey,
  mint: PublicKey
): Promise<PublicKey> {
  const [feeAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("referral_ata"), referralAccount.toBuffer(), mint.toBuffer()],
    REFER_PROGRAM_ID
  );
  return feeAccount;
}

// Send a bundle using Jito
export async function sendBundleUsingJito(serializedTxs: Uint8Array[]): Promise<string> {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [serializedTxs.map((tx) => bs58.encode(tx))],
  };

  const res = await fetch(JITO_BUNDLE_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message);
  }

  return json.result; // Returns the bundle ID
}

// Submit swap request
const submitSwapRequest = async (swapRequest: SwapRequest): Promise<any> => {
  const response = await fetch("https://quote-api.jup.ag/v6/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(swapRequest),
  });

  const json = await response.json();
  console.log('Full swap response:', json);

  if (!response.ok || json.error) {
    throw new Error(json.error || "Failed to execute swap");
  }

  // Return the entire transaction instead of just instructions
  return {
    transaction: VersionedTransaction.deserialize(
      Buffer.from(json.swapTransaction, 'base64')
    ),
    lastValidBlockHeight: json.lastValidBlockHeight,
    computeUnitLimit: json.computeUnitLimit
  };
};

// Create transactions from chunk

// Add this helper function
const compiledInstructionToTransaction = (
  instruction: MessageCompiledInstruction,
  message: MessageV0,
  allAccounts: PublicKey[]
): TransactionInstruction => {
  // Get the original account metadata from the message
  const accountMetadata = instruction.accountKeyIndexes.map(idx => {
    const isWritable = message.isAccountWritable(idx);
    const isSigner = message.isAccountSigner(idx);
    return {
      pubkey: allAccounts[idx],
      isSigner,
      isWritable
    };
  });

  return new TransactionInstruction({
    programId: allAccounts[instruction.programIdIndex],
    keys: accountMetadata,
    data: Buffer.from(instruction.data)
  });
};

// Hook: useCreateSwapInstructions
export const useCreateSwapInstructions = (
  publicKey: PublicKey | null,
  connection: Connection,
  signAllTransactions: (transactions: VersionedTransaction[]) => Promise<VersionedTransaction[]>,
  setMessage: React.Dispatch<React.SetStateAction<string | null>>,
  referralAccountPubkey: PublicKey
) => {
  const [sending, setSending] = useState(false);
  const pendingTransactions = useRef(new Set<string>());
  const jupiterQuoteApi = createJupiterApiClient();

  useEffect(() => {
    return () => {
      pendingTransactions.current.clear();
    };
  }, []);

  const handleClosePopup = useCallback(
    async (
      answer: boolean,
      selectedItems: Set<TokenItem>,
      setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>,
      bundleTip: number,
      onSuccess?: () => void
    ) => {
      console.log('handleClosePopup started:', { answer, selectedItems, bundleTip });
      
      if (!answer || selectedItems.size === 0 || !publicKey || !signAllTransactions) {
        console.log('Early return due to:', { 
          answer, 
          itemsSize: selectedItems.size, 
          hasPublicKey: !!publicKey, 
          hasSignAllTx: !!signAllTransactions 
        });
        return;
      }

      setSending(true);
      setMessage("Preparing transactions...");

      try {
        console.log('Fetching tip account...');
        const tipAccount = await getTipAccounts();
        console.log('Tip account received:', tipAccount);

        const selectedItemsArray = Array.from(selectedItems);
        console.log('Processing items:', selectedItemsArray);
        
        const serializedTxs: Uint8Array[] = [];

        for (const selectedItem of selectedItemsArray) {
          try {
            console.log('Processing item:', selectedItem);
            const balanceInSmallestUnit = selectedItem.amount * Math.pow(10, selectedItem.decimals);
            console.log('Balance in smallest unit:', balanceInSmallestUnit);
            
            if (balanceInSmallestUnit === 0) {
              console.log('Skipping zero balance item');
              continue;
            }

            console.log('Getting fee account...');
            const feeAccount = await getFeeAccount(referralAccountPubkey, new PublicKey(LOCKIN_MINT));
            console.log('Fee account:', feeAccount.toBase58());

            const params: QuoteGetRequest = {
              inputMint: selectedItem.mintAddress,
              outputMint: LOCKIN_MINT,
              amount: Number(balanceInSmallestUnit),
              slippageBps: 50,
              platformFeeBps: PLATFORM_FEE_BPS,
              onlyDirectRoutes: false,
              asLegacyTransaction: false,
            };
            console.log('Fetching quote with params:', params);

            const quote = await fetchQuoteWithRetries(jupiterQuoteApi, params);
            console.log('Quote received:', quote);

            const swapRequest: SwapRequest = {
              userPublicKey: publicKey.toBase58(),
              wrapAndUnwrapSol: true,
              useSharedAccounts: true,
              feeAccount: feeAccount.toBase58(),
              quoteResponse: quote,
            };
            console.log('Submitting swap request:', swapRequest);

            const swapResponse = await submitSwapRequest(swapRequest);
            console.log('Swap response received:', swapResponse);

            try {
              console.log('Processing swap response...');
              const { transaction } = swapResponse;
              console.log('Transaction received:', transaction);

              // Get all accounts and lookup tables from the original transaction
              const message = transaction.message as MessageV0;
              const lookupTables = await Promise.all(
                message.addressTableLookups.map(lookup =>
                  connection.getAddressLookupTable(lookup.accountKey)
                )
              );
              const lookupTableAccounts = lookupTables
                .map(table => table.value)
                .filter((account): account is AddressLookupTableAccount => account !== null);

              // Get all accounts for instruction conversion
              const allAccounts = [
                ...message.staticAccountKeys,
                ...lookupTableAccounts.flatMap(table => table.state.addresses)
              ];

              // Create tip instruction
              const tipInstruction = SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: new PublicKey(tipAccount),
                lamports: bundleTip,
              });

              // Create new transaction with original swap instructions plus tip
              const { blockhash } = await connection.getLatestBlockhash();
              const swapInstructions = message.compiledInstructions.map(inst => 
                compiledInstructionToTransaction(inst, message, allAccounts)
              );

              console.log('Creating transaction with instructions:', {
                swapInstructionsCount: swapInstructions.length,
                hasTipInstruction: true
              });

              const messageV0 = new TransactionMessage({
                payerKey: publicKey,
                recentBlockhash: blockhash,
                instructions: [...swapInstructions, tipInstruction],
              }).compileToV0Message(lookupTableAccounts);

              const newTransaction = new VersionedTransaction(messageV0);

              // Simulate the transaction before signing
              console.log('Simulating transaction...');
              const simulation = await connection.simulateTransaction(newTransaction);
              
              if (simulation.value.err) {
                console.error('Simulation failed:', {
                  error: simulation.value.err,
                  logs: simulation.value.logs,
                  unitsConsumed: simulation.value.unitsConsumed
                });
                
                // Try using the original transaction from Jupiter without modifications
                console.log('Attempting simulation with original transaction...');
                const originalSimulation = await connection.simulateTransaction(transaction);
                
                if (originalSimulation.value.err) {
                  console.error('Original transaction simulation also failed:', originalSimulation.value.err);
                  throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
                }
                
                // If original works, use it instead
                console.log('Using original transaction from Jupiter');
                const signedTransaction = await signAllTransactions([transaction]);
                signedTransaction.forEach((tx) => serializedTxs.push(tx.serialize()));
              } else {
                console.log('Simulation successful:', {
                  unitsConsumed: simulation.value.unitsConsumed,
                  logs: simulation.value.logs
                });
                
                const signedTransaction = await signAllTransactions([newTransaction]);
                signedTransaction.forEach((tx) => serializedTxs.push(tx.serialize()));
              }

              console.log('Transaction serialized and added to batch');
            } catch (error) {
              console.error('Error processing swap for item:', selectedItem, error);
            }
          } catch (error) {
            console.error('Error processing swap for item:', selectedItem, error);
          }
        }

        if (serializedTxs.length > 0) {
          console.log('Sending bundle with transactions:', serializedTxs.length);
          const bundleId = await sendBundleUsingJito(serializedTxs);
          console.log('Bundle submitted with ID:', bundleId);
          setMessage(`Bundle submitted with ID: ${bundleId}`);
          toast.success(`Bundle submitted successfully`);
          if (onSuccess) onSuccess();
        } else {
          throw new Error("No valid transactions to bundle.");
        }
      } catch (error: any) {
        console.error("Swap error:", error);
        setErrorMessage(error.toString());
        toast.error("Failed to complete swaps");
      } finally {
        setSending(false);
        pendingTransactions.current.clear();
      }
    },
    [publicKey, signAllTransactions, connection, setMessage, referralAccountPubkey]
  );


  return { handleClosePopup, sending, pendingTransactions: pendingTransactions.current };
};

// Types
export type TokenItem = {
  symbol: string;
  mintAddress: string;
  amount: number;
  decimals: number;
  tokenAddress: string;
};
