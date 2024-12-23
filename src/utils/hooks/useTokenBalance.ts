import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import Bottleneck from 'bottleneck';
import { useConnection } from '@solana/wallet-adapter-react';

export const useTokenBalance = (tokenAccountAddress: string) => {
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number>(0);
  const [balanceLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const rpcLimiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 1000,
      retryCount: 3,
    });

    const fetchBalance = async () => {
      if (!tokenAccountAddress) {
        setBalance(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const tokenAccount = new PublicKey(tokenAccountAddress);
        const tokenAccountBalance = await rpcLimiter.schedule(async () => {
          try {
            return await connection.getTokenAccountBalance(tokenAccount);
          } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return await connection.getTokenAccountBalance(tokenAccount);
          }
        });

        if (isMounted) {
          if (tokenAccountBalance) {
            setBalance(tokenAccountBalance.value.uiAmount || 0);
          } else {
            setBalance(0);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
          setBalance(0);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchBalance();

    return () => {
      isMounted = false;
    };
  }, [tokenAccountAddress, connection]);

  return { balance, balanceLoading, error };
};