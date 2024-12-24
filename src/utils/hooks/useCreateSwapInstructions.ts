import {
  Connection,
  PublicKey,
  VersionedTransaction,
  SystemProgram,
  TransactionMessage,
  MessageV0,
} from "@solana/web3.js";
import { useState, useCallback, useRef, useEffect } from "react";
import { createJupiterApiClient, QuoteGetRequest, SwapRequest } from "@jup-ag/api";
import { toast } from "react-hot-toast";
import { LOCKIN_MINT, REFER_PROGRAM_ID } from "@utils/globals";
import { fetchQuoteWithRetries } from "@utils/fetchQuote";

// Constants
const PLATFORM_FEE_BPS = 10;
const MAX_TRANSACTIONS_PER_BUNDLE = 5;

// Helper Functions

// Sleep utility
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Add this helper function to chunk transactions
const chunkTransactions = (txs: Uint8Array[], size: number): Uint8Array[][] => {
  const chunks: Uint8Array[][] = [];
  for (let i = 0; i < txs.length; i += size) {
    chunks.push(txs.slice(i, i + size));
  }
  return chunks;
};

// Update the sendBundle function
const sendBundle = async (serializedTxs: Uint8Array[]) => {
  const response = await fetch('/api/jito/bundle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transactions: serializedTxs.map(tx => Buffer.from(tx).toString('base64'))
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || 'Failed to send bundle');
  }
  const json = await response.json();
  console.log('Bundle response:', json);
  return { 
    bundleId: json.bundleId,
    status: json.status 
  };
};

// Add this function to check bundle status
const checkBundleStatus = async (bundleId: string): Promise<string> => {
    const response = await fetch(`/api/jito/status?bundleId=${bundleId}`);
    if (!response.ok) {
        throw new Error('Failed to check bundle status');
    }
    const data = await response.json();
    return data.status;
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
        const tipAccountResponse = await fetch('/api/jito/getTipAccount');
        const tipAccount = (await tipAccountResponse.json()).tipAccount.value[0];
        console.log('Tip account received:', tipAccount);

        const selectedItemsArray = Array.from(selectedItems);
        console.log('Processing items:', selectedItemsArray);

        const serializedSwapTxs: Uint8Array[] = [];

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
              const { transaction: jupTransaction } = swapResponse;
              // Just store the unserialized transaction
              serializedSwapTxs.push(jupTransaction.serialize());
              console.log('Swap transaction added to bundle');
            } catch (error) {
              console.error('Error processing swap for item:', selectedItem, error);
            }
          } catch (error) {
            console.error('Error processing swap for item:', selectedItem, error);
          }
        }

        if (serializedSwapTxs.length > 0) {
          try {
            const bundleChunks = chunkTransactions(serializedSwapTxs, MAX_TRANSACTIONS_PER_BUNDLE - 1);
            console.log(`Split into ${bundleChunks.length} bundles`);

            for (let i = 0; i < bundleChunks.length; i++) {
              try {
                // Get a fresh blockhash for each bundle
                const { blockhash } = await connection.getLatestBlockhash('confirmed');
                console.log(`Bundle ${i + 1} using blockhash:`, blockhash);

                // Create tip transaction with the fresh blockhash
                const tipInstruction = SystemProgram.transfer({
                  fromPubkey: publicKey,
                  toPubkey: new PublicKey(tipAccount),
                  lamports: bundleTip,
                });

                const tipMessage = new TransactionMessage({
                  payerKey: publicKey,
                  recentBlockhash: blockhash,
                  instructions: [tipInstruction],
                }).compileToV0Message([]);

                const tipTransaction = new VersionedTransaction(tipMessage);
                
                // Update the blockhash for each swap transaction in this chunk
                const updatedSwapTxs = await Promise.all(
                  bundleChunks[i].map(async (serializedTx) => {
                    const tx = VersionedTransaction.deserialize(serializedTx);
                    const message = tx.message as MessageV0;
                    
                    // Just update the blockhash without signing
                    const newTx = new VersionedTransaction(
                      new MessageV0({
                        header: message.header,
                        staticAccountKeys: message.staticAccountKeys,
                        recentBlockhash: blockhash,
                        compiledInstructions: message.compiledInstructions,
                        addressTableLookups: message.addressTableLookups
                      })
                    );
                    return newTx; // Return unsigned transaction
                  })
                );

                // Sign all transactions at once
                const allTxsToSign = [tipTransaction, ...updatedSwapTxs];
                let signedTxs;
                try {
                  signedTxs = await signAllTransactions(allTxsToSign);
                } catch (error: any) {
                  if (error.message.includes('rejected')) {
                    toast.error('Transaction signing cancelled by user');
                    setMessage(null);
                    setSending(false);
                    return; // Exit early
                  }
                  throw error; // Re-throw other errors
                }

                // Serialize all signed transactions
                const bundleTxs = signedTxs.map(tx => tx.serialize());
                
                setMessage(`Sending bundle ${i + 1} of ${bundleChunks.length}...`);
                const { bundleId, status } = await sendBundle(bundleTxs);
                if (!bundleId) throw new Error('No bundle ID received');
                console.log(`Bundle ${i + 1} submitted with ID:`, bundleId);

                // Poll for status a few times
                let finalStatus = status;
                for (let attempt = 0; attempt < 3; attempt++) {
                    await sleep(10000); // Wait 10 seconds between checks
                    try {
                        finalStatus = await checkBundleStatus(bundleId);
                        if (finalStatus === 'accepted' || finalStatus === 'finalized') {
                            break;
                        }
                    } catch (error) {
                        console.error('Status check error:', error);
                    }
                }

                toast.success(`Bundle ${i + 1}/${bundleChunks.length} - ID: ${bundleId} (${finalStatus})`);

                // Wait between bundles
                if (i < bundleChunks.length - 1) {
                  await sleep(2000); // Increased delay between bundles
                }
              } catch (error) {
                console.error(`Error processing bundle ${i + 1}:`, error);
                throw error; // Re-throw to be caught by outer try-catch
              }
            }

            setMessage(`All bundles sent successfully. Refreshing in 3 seconds...`);
            await sleep(3000);
            setSending(false);
            onSuccess?.();
            pendingTransactions.current.clear();
          } catch (error: any) {
            console.error("Bundle error:", error);
            setErrorMessage(typeof error === 'string' ? error : error.message || 'Unknown error');
            toast.error(`Failed to send bundles: ${error.message || 'Unknown error'}`);
            setSending(false);
          }
        } else {
          toast.error("Error: No valid transactions to bundle.");
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
