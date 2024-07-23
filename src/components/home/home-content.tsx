import { useWallet } from "@solana/wallet-adapter-react";
import React, { useEffect, useState, useRef } from "react";
import { ItemList } from "@components/home/item-list";
import { toast } from "react-hot-toast";
import { Circles } from "react-loader-spinner";
import useTokenBalance from "@utils/hooks/useTokenBalance";
import { FEE_ADDRESS } from "@utils/globals";
import { apiLimiter, fetchTokenAccounts, handleTokenData, TokenData } from "../../utils/tokenUtils";

export function HomeContent() {
  const { publicKey, signTransaction } = useWallet();
  const [signState, setSignState] = useState<string>("initial");
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const prevPublicKey = useRef<string>(publicKey?.toBase58() || "");
  const [loading, setLoading] = useState<boolean>(false);
  const [totalAccounts, setTotalAccounts] = useState<number>(0);
  const { balance } = useTokenBalance(FEE_ADDRESS);
  const [totalValue, setTotalValue] = useState<number>(0);

  useEffect(() => {
    if (publicKey && publicKey.toBase58() !== prevPublicKey.current) {
      prevPublicKey.current = publicKey.toBase58();
      setSignState("initial");
    }
  }, [publicKey]);

  const updateTotalValue = (usdValue: number) => {
    setTotalValue((prevValue) => prevValue + usdValue);
  };

  useEffect(() => {
    const sign = async () => {
      if (publicKey && signTransaction && signState === "initial") {
        setLoading(true);
        setSignState("loading");
        const signToastId = toast.loading("Getting Token Data...");

        try {
          const tokenAccounts = await fetchTokenAccounts(publicKey);
          setTotalAccounts(tokenAccounts.value.length);

          const tokenDataPromises = tokenAccounts.value.map((tokenAccount) =>
            handleTokenData(publicKey, tokenAccount, apiLimiter).then((tokenData) => {
              updateTotalValue(tokenData.usdValue);
              return tokenData;
            })
          );

          const tokens = await Promise.all(tokenDataPromises);
          setTokens(tokens);
          setSignState("success");
          toast.success("Token Data Retrieved", { id: signToastId });
        } catch (error) {
          setSignState("error");
          toast.error("Error verifying wallet, please reconnect wallet", { id: signToastId });
          console.error(error);
        } finally {
          setLoading(false);
        }
      }
    };

    sign();
  }, [signState, signTransaction, publicKey]);

  if (loading || !tokens || signState === "loading") {
    return (
      <>
        <p>Found {totalAccounts} Accounts, Getting Token Data...</p>
        <div className="flex justify-center items-center h-screen">
          <Circles color="#00BFFF" height={80} width={80} />
        </div>
      </>
    );
  }

  if (publicKey && signState === "success" && tokens.length === 0) {
    return <p className="text-center p-4">Loading wallet information...</p>;
  }

  const hasFetchedData = publicKey && signState === "success" && tokens.length > 0 && totalAccounts > 0;

  return (
    <div className="grid grid-cols-1">
      {hasFetchedData ? (
        <div>
          <ItemList initialItems={tokens} totalValue={totalValue} />
        </div>
      ) : (
        <div className="text-center">
          <p className="text-center p-4">
            This app allows users to convert SPL Tokens to $Lockin and will close their token account for returning rent.
          </p>
          {!publicKey && (
            <div className="card border-2 border-primary mb-5">
              <div className="card-body items-center">
                <h2 className="card-title text-center text-primary mb-2">
                  Please connect your wallet to lock in...
                </h2>
              </div>
            </div>
          )}
          {publicKey && signState === "error" && (
            <div className="card border-2 border-primary mb-5">
              <div className="card-body items-center text-center">
                <h2 className="card-title text-center mb-2">
                  {`Please Disconnect and reconnect your wallet. You might need to reload the page. You might have too many tokens and we're being rate limited. Thank you for locking in 🔒`}
                </h2>
              </div>
            </div>
          )}
        </div>
      )}
      {balance > 0 && <p className="text-center p-4">Total LOCKINS Generated: {balance.toFixed(5)}</p>}
    </div>
  );
}
