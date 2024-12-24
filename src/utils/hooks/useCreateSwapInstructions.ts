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

// Constants
const PLATFORM_FEE_BPS = 10;

// Helper Functions

// Sleep utility
// const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
// export async function sendBundleUsingJito(serializedTxs: Uint8Array[]): Promise<string> {
//   const payload = {
//     jsonrpc: "2.0",
//     id: 1,
//     method: "sendBundle",
//     params: [serializedTxs.map((tx) => bs58.encode(tx))],
//   };

//   const res = await fetch(JITO_BUNDLE_ENDPOINT, {
//     method: "POST",
//     body: JSON.stringify(payload),
//     headers: { "Content-Type": "application/json" },
//   });

//   const json = await res.json();
//   if (json.error) {
//     throw new Error(json.error.message);
//   }

//   return json.result; // Returns the bundle ID
// }

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

// Replace the direct Jito client code with API calls
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

  return await response.json();
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
        // const client = jito.searcher.searcherClient(JITO_BUNDLE_ENDPOINT);
        // const tipAccount = await client.getTipAccounts();
        const tipAccountResponse = await fetch('/api/jito/getTipAccount');
        const tipAccount = (await tipAccountResponse.json()).tipAccount.value[0];
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
              const { transaction: jupTransaction } = swapResponse;

              // Create separate tip transaction
              const { blockhash } = await connection.getLatestBlockhash();
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

              // Sign both transactions
              const signedTransactions = await signAllTransactions([tipTransaction, jupTransaction]);

              // Add both transactions to the bundle
              signedTransactions.forEach((tx) => serializedTxs.push(tx.serialize()));
              console.log('Transactions serialized and added to bundle');
            } catch (error) {
              console.error('Error processing swap for item:', selectedItem, error);
            }
          } catch (error) {
            console.error('Error processing swap for item:', selectedItem, error);
          }
        }

        if (serializedTxs.length > 0) {
          console.log('Sending bundle with transactions:', serializedTxs.length);
          const { bundleId, bundleStatus } = await sendBundle(serializedTxs);
          console.log('Bundle submitted with ID:', bundleId);
          setMessage(`Bundle Status: ${bundleStatus}`)
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
