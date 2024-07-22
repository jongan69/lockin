import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import Bottleneck from 'bottleneck';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID_ADDRESS } from '@utils/globals';

const useTokenBalance = (tokenAccountAddress: string) => {
  const { connection } = useConnection();
  const [balance, setBalance] = useState<any>(0);
  const [balanceLoading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBalance = async () => {
      setLoading(true);
      setError(null);

      const rpcLimiter = new Bottleneck({
        maxConcurrent: 1,
        minTime: 500, // Adjust based on your rate limit requirements
      });

      try {
        const tokenAccount = new PublicKey(tokenAccountAddress);
        const tokenAccountBalance = await rpcLimiter.schedule(() =>
          connection.getTokenAccountBalance(tokenAccount)
        );
        // console.log("tokenAccountBalance", tokenAccountBalance);

        if (tokenAccountBalance) {
          const tokenBalance = tokenAccountBalance.value.uiAmount || 0;
          setBalance(tokenBalance);
        } else {
          setBalance(0);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, [tokenAccountAddress]);

  return { balance, balanceLoading, error };
};

export default useTokenBalance;
