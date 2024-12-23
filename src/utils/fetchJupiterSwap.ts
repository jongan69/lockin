export const fetchJupiterSwap = async (id: string | undefined) => {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${id}`);
    const price = await response.json();
    return price;
  };
  