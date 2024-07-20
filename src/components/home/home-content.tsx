import { useWallet } from "@solana/wallet-adapter-react";
import React, { useEffect, useState } from "react";
import { ItemList } from "@components/home/item-list";
import { toast } from "react-hot-toast";
import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import { Circles } from "react-loader-spinner";
import { fetchIpfsMetadata } from "../../utils/fetchIpfsMetadata";
import { extractCidFromUrl } from "../../utils/extractCidFromUrl";
import { fetchJupiterSwap } from "../../utils/fetchJupiterSwap";
import Bottleneck from "bottleneck";

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT!;
const connection = new Connection(RPC_ENDPOINT);
const metaplex = Metaplex.make(connection);
const DEFAULT_IMAGE_URL =
  process.env.UNKNOWN_IMAGE_URL ||
  "https://s3.coinmarketcap.com/static-gravity/image/5cc0b99a8dd84fbfa4e150d84b5531f2.png";

// Rate limiters
const rpcLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1, // 2 requests per second
});

const apiLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 100, // 2 requests per second
});

type TokenData = {
  decimals: number;
  mintAddress: string;
  name?: string;
  amount: number;
  symbol?: string;
  logo?: string;
  usdValue?: number;
};

export function HomeContent() {
  const { publicKey, signTransaction } = useWallet();
  const [signState, setSignState] = useState<string>("initial");
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const prevPublicKey = React.useRef<string>(publicKey?.toBase58() || "");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (publicKey && publicKey.toBase58() !== prevPublicKey.current) {
      prevPublicKey.current = publicKey.toBase58();
      setSignState("initial");
    }
  }, [publicKey]);

  useEffect(() => {
    async function sign() {
      if (publicKey && signTransaction && signState === "initial") {
        setLoading(true);
        setSignState("loading");
        const signToastId = toast.loading("Getting Token Data...");

        try {
          const tokenAccounts = await rpcLimiter.schedule(() =>
            connection.getParsedTokenAccountsByOwner(publicKey, {
              programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
            })
          );

          const tokenDataPromises = tokenAccounts.value.map(async (tokenAccount: { account: { data: { parsed: { info: { mint: any; tokenAmount: { uiAmount: any; decimals: any; }; }; }; }; }; }) => {
            const mintAddress = tokenAccount.account.data.parsed.info.mint;
            const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
            const decimals = tokenAccount.account.data.parsed.info.tokenAmount.decimals;
            const jupiterPrice = await apiLimiter.schedule(() =>
              fetchJupiterSwap(mintAddress)
            );

            const metadata = await fetchTokenMetadata(new PublicKey(mintAddress), mintAddress);

            return {
              mintAddress,
              amount,
              decimals,
              ...metadata,
              usdValue: amount * jupiterPrice.data[mintAddress].price,
            };
          });

          const tokens = await Promise.all(tokenDataPromises);
          setTokens(tokens);
          setSignState("success");
          toast.success("Token Data Retrieved", { id: signToastId });
        } catch (error: any) {
          setSignState("error");
          toast.error("Error verifying wallet, please reconnect wallet", { id: signToastId });
        } finally {
          setLoading(false);
        }
      }
    }

    sign();
  }, [signState, signTransaction, publicKey]);

  async function fetchTokenMetadata(mintAddress: PublicKey, mint: string) {
    try {
      const metadataAccount = metaplex
        .nfts()
        .pdas()
        .metadata({ mint: mintAddress });

      const metadataAccountInfo = await rpcLimiter.schedule(() =>
        connection.getAccountInfo(metadataAccount)
      );
      const token = await rpcLimiter.schedule(() =>
        metaplex.nfts().findByMint({ mintAddress: mintAddress })
      );
      if (metadataAccountInfo && token) {
        const cid = extractCidFromUrl(token.uri);
        if (cid) {
          console.log(`Found cid: ${cid} using url: ${token.uri ? JSON.stringify(token.uri) : JSON.stringify(token.json?.image)}`);
          const newMetadata = await apiLimiter.schedule(() => fetchIpfsMetadata(cid));
          return {
            name: token?.name,
            symbol: token?.symbol,
            logo: newMetadata.imageUrl,
          };
        } else {
          return {
            name: token?.name,
            symbol: token?.symbol,
            logo: token.json?.image ?? DEFAULT_IMAGE_URL,
          };
        }
      }
    } catch (error) {
      console.error("Error fetching token metadata:", error);
      return { name: "Unknown", symbol: "Unknown", logo: DEFAULT_IMAGE_URL };
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Circles color="#00BFFF" height={80} width={80} />
      </div>
    );
  }

  if (!tokens && signState === "error") {
    return (
      <div className="flex justify-center items-center h-screen">
        <Circles color="#00BFFF" height={80} width={80} />
      </div>
    );
  }

  if (publicKey && signState === "success" && tokens.length === 0) {
    return <p className="text-center p-4">Loading wallet information...</p>;
  }

  const hasFetchedData = publicKey && signState === "success" && tokens.length > 0;

  return (
    <div className="grid grid-cols-1">
      {hasFetchedData ? (
        <div>
          <h2 className="text-center text-primary mt-4">Token Accounts</h2>
          <ItemList items={tokens} />
        </div>
      ) : (
        <div className="text-center">
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
                  {`Please Disconnect and reconnect your wallet. \nYou might need to reload the page. \nYou might have too many fucking tokens AND WE'RE BEING RATE LIMITED, shoutout bald guy Mert.`}
                </h2>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
