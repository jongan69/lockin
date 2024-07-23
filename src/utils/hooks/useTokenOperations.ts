import { useState, useCallback } from "react";
import { Connection, PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage, AddressLookupTableAccount, PublicKeyInitData } from "@solana/web3.js";
import { toast } from "react-hot-toast";
import { useCloseTokenAccount } from "../../utils/hooks/useCloseTokenAccount";
import { createJupiterApiClient, QuoteGetRequest } from "@jup-ag/api";

const MAX_INSTRUCTIONS_PER_TX = 5;

export const useTokenOperations = (
  publicKey: PublicKey | null,
  connection: Connection,
  signTransaction: any,
  sendTransaction: any,
  targetTokenMintAddress: string,
  referralAccountPubkey: PublicKey,
  referralProgramId: PublicKey,
  raydiumUrl: string,
  setShowPopup: (show: boolean) => void,
  setSelectedItems: (items: Set<any>) => void,
  closedTokenAccounts: any,
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
    if (answer && selectedItems.size > 0 && publicKey && signTransaction) {
      try {
        setSending(true);
        setMessage('Preparing transactions...');

        let transactionInstructions: TransactionInstruction[] = [];
        let transactionCount = 0;

        for (const selectedItem of selectedItems) {
          if (selectedItem.mintAddress === targetTokenMintAddress) {
            setErrorMessage("Error: You are already lock maxing this token.");
            window.open(raydiumUrl, '_blank');
            return;
          }
          const balanceInSmallestUnit = selectedItem.amount * Math.pow(10, selectedItem.decimals);
          console.log(`Balance: ${selectedItem.amount} ${selectedItem.symbol} , ${selectedItem.decimals} Decimals`);
          if (balanceInSmallestUnit === 0) {
            const closeInstr = await closeTokenAccount(new PublicKey(selectedItem.tokenAddress));
            transactionInstructions.push(closeInstr);
            setClosedTokenAccounts((prev: Iterable<unknown> | null | undefined) => new Set(prev).add(selectedItem.tokenAddress));
            continue;
          }

          console.log(`Swapping ${balanceInSmallestUnit} ${selectedItem.symbol} for ${targetTokenMintAddress}`);
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

          const quote = await jupiterQuoteApi.quoteGet(params);
          if (!quote) {
            throw new Error("Failed to fetch quote");
          }

          const response = await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userPublicKey: publicKey.toBase58(),
              wrapAndUnwrapSol: true,
              useSharedAccounts: true,
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

          console.log("Instructions from Jupiter API:", instructions);

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

          const instructionsList: TransactionInstruction[] = [
            ...(setupInstructions ? setupInstructions.map(deserializeInstruction) : []),
            deserializeInstruction(swapInstructionPayload),
            ...(cleanupInstruction ? cleanupInstruction.map(deserializeInstruction) : []),
          ];

          transactionInstructions.push(...instructionsList);

          if (transactionInstructions.length >= MAX_INSTRUCTIONS_PER_TX) {
            transactionCount++;
            await sendTransactionBatch(transactionInstructions, addressLookupTableAccounts, publicKey, signTransaction, connection, setMessage, sendTransaction);
            transactionInstructions = [];
          }

          const closeAccountInstr = await closeTokenAccount(new PublicKey(selectedItem.tokenAddress));
          transactionInstructions.push(closeAccountInstr);
          setClosedTokenAccounts((prev: Iterable<unknown> | null | undefined) => new Set(prev).add(selectedItem.tokenAddress));
        }

        if (transactionInstructions.length > 0) {
          transactionCount++;
          await sendTransactionBatch(transactionInstructions, undefined, publicKey, signTransaction, connection, setMessage, sendTransaction);
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
    signTransaction,
    connection,
    setShowPopup,
    targetTokenMintAddress,
    referralAccountPubkey,
    referralProgramId,
    raydiumUrl,
    setSelectedItems,
    closeTokenAccount,
    jupiterQuoteApi,
    sendTransaction,
    setClosedTokenAccounts
  ]);

  const sendTransactionBatch = async (instructions: TransactionInstruction[], addressLookupTableAccounts: AddressLookupTableAccount[] | undefined, publicKey: PublicKey, signTransaction: (arg0: VersionedTransaction) => any, connection: Connection, setMessage: (msg: string) => void, sendTransaction: (arg0: any, arg1: any, arg2: { minContextSlot: any; }) => any) => {
    try {
      const instructionChunks: TransactionInstruction[][] = [];
      let currentChunk: TransactionInstruction[] = [];

      for (const instruction of instructions) {
        const estimatedSize = currentChunk.reduce((acc, instr) => acc + instr.data.length, 0) + instruction.data.length;
        console.log(`Estimated byte size of instruction: ${estimatedSize}`);
        if (estimatedSize > 1232) { // 1232 bytes is the raw size limit for a transaction
          instructionChunks.push(currentChunk);
          currentChunk = [];
        }
        currentChunk.push(instruction);
      }

      if (currentChunk.length > 0) {
        instructionChunks.push(currentChunk);
      }

      for (const chunk of instructionChunks) {
        const { blockhash } = await connection.getLatestBlockhash({ commitment: 'processed' });
        const messageV0 = new TransactionMessage({
          payerKey: new PublicKey(publicKey),
          recentBlockhash: blockhash,
          instructions: chunk,
        }).compileToV0Message(addressLookupTableAccounts);

        const transaction = new VersionedTransaction(messageV0);
        const signedTransaction = await signTransaction(transaction);

        // setMessage('Simulating transaction...');
        // const simulationResult = await connection.simulateTransaction(signedTransaction, { commitment: 'processed' });
        // if (simulationResult.value.err) {
        //   console.error(`Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
        //   throw new Error(`Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
        // }

        setMessage('Sending transaction...');
        const { context: { slot: minContextSlot } } = await connection.getLatestBlockhashAndContext({ commitment: 'processed' });
        await sendTransaction(signedTransaction, connection, { minContextSlot });
      }
    } catch (error: any) {
      console.error("Error during transaction batch send:", error.toString());
      console.log("Failed Instructions:", instructions); // Log the instructions causing the error
      throw new Error(`Error during transaction batch send: ${error.toString()}`);
    }
  };

  return { handleClosePopup, sending };
};