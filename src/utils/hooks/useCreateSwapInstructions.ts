import { useState, useCallback } from "react";
import { Connection, PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage, AddressLookupTableAccount, PublicKeyInitData, SystemProgram } from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import { toast } from "react-hot-toast";
import { createJupiterApiClient, QuoteGetRequest, QuoteResponse } from "@jup-ag/api";
import { getBundleStatus, getTipAccounts, sendTxUsingJito } from "@utils/bundleUtils";

interface MyQuoteResponse extends QuoteResponse {
  error?: string;
}

export const useTokenOperations = (
  publicKey: PublicKey | null,
  connection: Connection,
  signAllTransactions: any,
  targetTokenMintAddress: string,
  dustReceiver: PublicKey,
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
    let transactionCount = 0;

    try {
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
          autoSlippageCollisionUsdValue: 1_000,
          platformFeeBps: 150,
          maxAutoSlippageBps: 1000,
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

        let quote: MyQuoteResponse | null = null;
        let attemptCount = 0;

        while (!quote && attemptCount < 3) {
          attemptCount++;
          try {
            quote = await jupiterQuoteApi.quoteGet(params);
            if (quote?.error) {
              throw new Error(`Failed to fetch quote: ${quote.error}`);
            }
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

        if (!quote) {
          throw new Error("Failed to fetch a valid quote after multiple attempts");
        }

        const response = await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
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
        if (instructions.error) {
          throw new Error("Failed to get swap instructions: " + instructions.error);
        }

        const {
          computeBudgetInstructions,
          setupInstructions,
          swapInstruction: swapInstructionPayload,
          cleanupInstruction,
          addressLookupTableAddresses,
        } = instructions;

        const deserializeInstruction = (instruction: { programId: PublicKeyInitData; accounts: any[]; data: WithImplicitCoercion<string> | { [Symbol.toPrimitive](hint: "string"): string; }; }) => {
          return new TransactionInstruction({
            programId: new PublicKey(instruction.programId),
            keys: instruction.accounts.map((key) => ({
              pubkey: new PublicKey(key.pubkey),
              isSigner: key.isSigner,
              isWritable: key.isWritable,
            })),
            data: Buffer.from(instruction.data, "base64"),
          });
        };

        const getAddressLookupTableAccounts = async (keys: string[]): Promise<AddressLookupTableAccount[]> => {
          const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
            keys.map((key) => new PublicKey(key))
          );

          return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
            const addressLookupTableAddress = keys[index];
            if (accountInfo) {
              const addressLookupTableAccount = new AddressLookupTableAccount({
                key: new PublicKey(addressLookupTableAddress),
                state: AddressLookupTableAccount.deserialize(accountInfo.data),
              });
              acc.push(addressLookupTableAccount);
            }
            return acc;
          }, new Array<AddressLookupTableAccount>());
        };

        let addressLookupTableAccounts: AddressLookupTableAccount[] = [];
        if (addressLookupTableAddresses && addressLookupTableAddresses.length > 0) {
          addressLookupTableAccounts = await getAddressLookupTableAccounts(addressLookupTableAddresses);
        }

        const swapInstructionsList: TransactionInstruction[] = [
          ...(setupInstructions ? setupInstructions.map(deserializeInstruction) : []),
          deserializeInstruction(swapInstructionPayload),
          ...(Array.isArray(cleanupInstruction) ? cleanupInstruction.map(deserializeInstruction) : [deserializeInstruction(cleanupInstruction)]),
        ];

        swapInstructions.push(...swapInstructionsList);
        setClosedTokenAccounts((prev: Set<any>) => new Set(prev).add(selectedItem.tokenAddress));
      }

      if (swapInstructions.length > 0) {
        transactionCount++;
        await sendTransactionChunks(swapInstructions, undefined, publicKey, signAllTransactions, connection, setMessage, bundleTip, 'Processing bundled Jupiter swaps using Jito...');
      }

      setMessage(`Transaction confirmed successfully! ${transactionCount} transactions were sent.`);
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
    // dustReceiver,
    referralAccountPubkey,
    referralProgramId,
    bundleTip,
    // raydiumUrl,
    setSelectedItems,
    jupiterQuoteApi,
    setClosedTokenAccounts
  ]);

  const sendTransactionChunks = async (
    instructions: TransactionInstruction[],
    addressLookupTableAccounts: AddressLookupTableAccount[] | undefined,
    publicKey: PublicKey,
    signAllTransactions: any,
    connection: Connection,
    setMessage: (msg: string) => void,
    bundleTip: number,
    description: string
  ) => {
    try {
      const tipAccount: any = await getTipAccounts();
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(tipAccount),
          lamports: bundleTip,
        }),
      );
  
      const instructionChunks: TransactionInstruction[][] = [];
      let currentChunk: TransactionInstruction[] = [];
      let currentChunkSize = 0;
  
      for (const instruction of instructions) {
        const instructionSize = instruction.data.length;
        console.log(`Instruction size: ${instructionSize} bytes`);
  
        const estimatedSize = currentChunkSize + instructionSize;
        if (estimatedSize > 1232) { // 1232 bytes is the raw size limit for a transaction
          console.log(`Current chunk size before adding instruction: ${currentChunkSize} bytes`);
          instructionChunks.push(currentChunk);
          currentChunk = [];
          currentChunkSize = 0;
        }
        currentChunk.push(instruction);
        currentChunkSize += instructionSize;
        console.log(`Running total transaction size: ${currentChunkSize} bytes`);
      }
  
      if (currentChunk.length > 0) {
        console.log(`Final chunk size before sending: ${currentChunkSize} bytes`);
        instructionChunks.push(currentChunk);
      }
  
      console.log(`Total instruction chunks: ${instructionChunks.length}`);
  
      const signedTransactions: VersionedTransaction[] = [];
      for (const chunk of instructionChunks) {
        const { blockhash } = await connection.getLatestBlockhash({ commitment: 'processed' });
        const messageV0 = new TransactionMessage({
          payerKey: new PublicKey(publicKey),
          recentBlockhash: blockhash,
          instructions: chunk,
        }).compileToV0Message(addressLookupTableAccounts);
  
        const transaction = new VersionedTransaction(messageV0);
  
        // Log the transaction size before serialization
        const transactionSize = transaction.serialize().length;
        console.log(`Transaction size before serialization: ${transactionSize} bytes`);
  
        signedTransactions.push(transaction);
      }
  
      // Attempt to sign all transactions
      let signedChunks;
      try {
        signedChunks = await signAllTransactions(signedTransactions);
      } catch (error: any) {
        console.error('Error during signing transactions:', error);
        throw new Error(`Error during signing transactions: ${error.toString()}`);
      }
  
      // Log serialized transaction sizes
      const serializedTxs = signedChunks.map((tx: any) => tx.serialize());
      serializedTxs.forEach((tx: string | any[], idx: any) => {
        console.log(`Serialized transaction ${idx} size: ${tx.length} bytes`);
      });
  
      const bundleId = await sendTxUsingJito(serializedTxs);
      setMessage('Sending transaction: ' + bundleId);
      const bundleStatus = await getBundleStatus(bundleId);
      setSelectedItems(new Set());
      if (bundleStatus.result.value.length > 0) {
        console.log(`Completed sending transaction batch: ${JSON.stringify(bundleStatus)}`);
        setSelectedItems(new Set());
      } else {
        console.error(`Error during transaction batch send: ${JSON.stringify(bundleStatus)}`);
        setMessage('Error: ' + bundleId + JSON.stringify(bundleStatus));
      }
    } catch (error: any) {
      console.error(`Error during transaction batch send: ${description}`, error.toString());
      throw new Error(`Error during transaction batch send: ${description}, ${error.toString()}`);
    }
  };
  
  
  
  

  return { handleClosePopup, sending };
};
