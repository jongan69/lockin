import { useState, useCallback } from "react";
import { Connection, PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage, AddressLookupTableAccount, PublicKeyInitData } from "@solana/web3.js";
import { toast } from "react-hot-toast";
import { useCloseTokenAccount } from "../../utils/hooks/useCloseTokenAccount";
import { createJupiterApiClient, QuoteGetRequest, QuoteResponse } from "@jup-ag/api";

interface MyQuoteResponse extends QuoteResponse {
  error?: string;
}

export const useTokenOperations = (
  publicKey: PublicKey | null,
  connection: Connection,
  signAllTransactions: any,
  sendTransaction: any,
  targetTokenMintAddress: string,
  dustReceiver: PublicKey,
  referralAccountPubkey: PublicKey,
  referralProgramId: PublicKey,
  raydiumUrl: string,
  setShowPopup: (show: boolean) => void,
  setSelectedItems: (items: Set<any>) => void,
  setClosedTokenAccounts: any,
) => {
  const [sending, setSending] = useState(false);
  const { closeTokenAccount } = useCloseTokenAccount();
  const jupiterQuoteApi = createJupiterApiClient();

  const handleClosePopup = useCallback(async (
    answer: boolean,
    selectedItems: Set<any>,
    setMessage: (msg: string) => void,
    setErrorMessage: (msg: string | null) => void
  ) => {
    console.log("1. Entered handleClosePopup");
    if (answer && selectedItems.size > 0 && publicKey && signAllTransactions) {
      console.log("2. Valid conditions for processing transactions");
      try {
        setSending(true);
        setMessage('Preparing transactions...');
        console.log("3. Preparing transactions...");

        let swapAndDustInstructions: TransactionInstruction[] = [];
        let closeAccountInstructions: TransactionInstruction[] = [];
        let transactionCount = 0;

        for (const selectedItem of selectedItems) {
          console.log(`4. Processing selected item: ${selectedItem.mintAddress}`);
          if (selectedItem.mintAddress === targetTokenMintAddress) {
            setErrorMessage("Error: You are already lock maxing this token.");
            window.open(raydiumUrl, '_blank');
            return;
          }
          const balanceInSmallestUnit = selectedItem.amount * Math.pow(10, selectedItem.decimals);
          console.log(`5. Balance: ${selectedItem.amount} ${selectedItem.symbol} , ${selectedItem.decimals} Decimals`);
          if (balanceInSmallestUnit === 0) {
            console.log("6. Account balance is zero, adding to close account instructions");
            const closeInstr = await closeTokenAccount(new PublicKey(selectedItem.tokenAddress));
            closeAccountInstructions.push(closeInstr);
            setClosedTokenAccounts((prev: Iterable<unknown> | null | undefined) => new Set(prev).add(selectedItem.tokenAddress));
            continue;
          }

          console.log(`7. Swapping ${balanceInSmallestUnit} ${selectedItem.symbol} for ${targetTokenMintAddress}`);
          let params: QuoteGetRequest = {
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
            // maxAccounts: 20
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
          let quoteSuccess = false;
          let attemptCount = 0;

          while (!quoteSuccess && attemptCount < 3) {
            attemptCount++;
            console.log(`8. Fetching quote from Jupiter API, attempt ${attemptCount}`);
            try {
              quote = await jupiterQuoteApi.quoteGet(params);
              if (quote?.error) {
                throw new Error(`Failed to fetch quote: ${quote.error}`);
              }
              quoteSuccess = true;
            } catch (error: any) {
              if (error.message.includes("ROUTE_PLAN_DOES_NOT_CONSUME_ALL_THE_AMOUNT")) {
                console.log(`8.1 Error: ${error.message}. Reducing amount and retrying...`);
                params.amount = Math.floor(params.amount * 0.95); // Reduce amount by 5%
              } else if (error.response && error.response.status === 400) {
                console.error("8.2 Bad Request Error: ", error.toString());
                throw new Error(`Bad Request: ${error.toString()}`);
              } else {
                throw error;
              }
            }
          }

          if (!quoteSuccess) {
            throw new Error("Failed to fetch a valid quote after multiple attempts");
          }

          console.log("9. Fetching swap instructions from Jupiter API");
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

          console.log("10. Instructions from Jupiter API:", instructions);

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

          console.log("11. Checking if address lookup table accounts are needed");
          let addressLookupTableAccounts: AddressLookupTableAccount[] = [];
          if (addressLookupTableAddresses && addressLookupTableAddresses.length > 0) {
            addressLookupTableAccounts = await getAddressLookupTableAccounts(addressLookupTableAddresses);
          }

          const swapAndDustInstructionsList: TransactionInstruction[] = [
            ...(setupInstructions ? setupInstructions.map(deserializeInstruction) : []),
            deserializeInstruction(swapInstructionPayload),
            ...(Array.isArray(cleanupInstruction) ? cleanupInstruction.map(deserializeInstruction) : [deserializeInstruction(cleanupInstruction)]),
          ];

          console.log("12. Adding swap instructions to the list");
          swapAndDustInstructions.push(...swapAndDustInstructionsList);

          if (balanceInSmallestUnit > 0) {
            console.log("13. Adding transfer to dust receiver instruction");
            const transferToDustReceiverInstr = new TransactionInstruction({
              programId: new PublicKey(selectedItem.mintAddress),
              keys: [
                { pubkey: new PublicKey(selectedItem.tokenAddress), isSigner: false, isWritable: true },
                { pubkey: dustReceiver, isSigner: false, isWritable: true },
                { pubkey: publicKey, isSigner: true, isWritable: false },
              ],
              data: Buffer.from([]), // Add the actual data required for transfer
            });
            swapAndDustInstructions.push(transferToDustReceiverInstr);
          }

          console.log("14. Adding close account instruction to the list");
          const closeAccountInstr = await closeTokenAccount(new PublicKey(selectedItem.tokenAddress));
          closeAccountInstructions.push(closeAccountInstr);
          setClosedTokenAccounts((prev: Iterable<unknown> | null | undefined) => new Set(prev).add(selectedItem.tokenAddress));
        }

        if (swapAndDustInstructions.length > 0) {
          transactionCount++;
          console.log(`15. Sending swap and dust removal transaction batch, transaction count: ${transactionCount}`);
          await sendTransactionChunks(swapAndDustInstructions, undefined, publicKey, signAllTransactions, connection, setMessage, sendTransaction, 'Processing swaps and dust removal');
        }

        if (closeAccountInstructions.length > 0) {
          transactionCount++;
          console.log(`16. Sending close account transaction batch, transaction count: ${transactionCount}`);
          await sendTransactionChunks(closeAccountInstructions, undefined, publicKey, signAllTransactions, connection, setMessage, sendTransaction, 'Closing token accounts');
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
    } else {
      setShowPopup(false);
      setSelectedItems(new Set());
    }
  }, [
    publicKey,
    signAllTransactions,
    connection,
    setShowPopup,
    targetTokenMintAddress,
    dustReceiver,
    referralAccountPubkey,
    referralProgramId,
    raydiumUrl,
    setSelectedItems,
    closeTokenAccount,
    jupiterQuoteApi,
    sendTransaction,
    setClosedTokenAccounts
  ]);

  const sendTransactionChunks = async (
    instructions: TransactionInstruction[],
    addressLookupTableAccounts: AddressLookupTableAccount[] | undefined,
    publicKey: PublicKey,
    signAllTransactions: any,
    connection: Connection,
    setMessage: (msg: string) => void,
    sendTransaction: (arg0: any, arg1: any, arg2: { minContextSlot: any; }) => any,
    description: string
  ) => {
    try {
      console.log(`17. Entering sendTransactionChunks: ${description}`);
      const instructionChunks: TransactionInstruction[][] = [];
      let currentChunk: TransactionInstruction[] = [];

      for (const instruction of instructions) {
        const estimatedSize = currentChunk.reduce((acc, instr) => acc + instr.data.length, 0) + instruction.data.length;
        console.log(`18. Estimated byte size of instruction: ${estimatedSize}`);
        if (estimatedSize > 1232) { // 1232 bytes is the raw size limit for a transaction
          console.log("19. Current chunk size exceeds limit, creating new chunk");
          instructionChunks.push(currentChunk);
          currentChunk = [];
        }
        currentChunk.push(instruction);
      }

      if (currentChunk.length > 0) {
        instructionChunks.push(currentChunk);
      }

      const signedTransactions: VersionedTransaction[] = [];
      for (const chunk of instructionChunks) {
        const { blockhash } = await connection.getLatestBlockhash({ commitment: 'processed' });
        const messageV0 = new TransactionMessage({
          payerKey: new PublicKey(publicKey),
          recentBlockhash: blockhash,
          instructions: chunk,
        }).compileToV0Message(addressLookupTableAccounts);

        const transaction = new VersionedTransaction(messageV0);
        signedTransactions.push(transaction);
      }

      console.log("20. Signing transaction chunks");
      const signedChunks = await signAllTransactions(signedTransactions);

      for (const signedTransaction of signedChunks) {
        setMessage('Sending transaction...');
        const { context: { slot: minContextSlot } } = await connection.getLatestBlockhashAndContext({ commitment: 'processed' });
        await sendTransaction(signedTransaction, connection, { minContextSlot });
      }
      console.log("21. Completed sending transaction batch");
    } catch (error: any) {
      console.error(`Error during transaction batch send: ${description}`, error.toString());
      console.log("Failed Instructions:", instructions); // Log the instructions causing the error
      throw new Error(`Error during transaction batch send: ${description}, ${error.toString()}`);
    }
  };

  return { handleClosePopup, sending };
};
