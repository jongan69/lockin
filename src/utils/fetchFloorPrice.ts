export const fetchFloorPrice = async (ca: string | undefined) => {
  try {
    const response = await fetch(`/api/nftfloor?ca=${ca}`);
    const price = await response.json();
    return price;
  } catch (error) {
    console.error(`Error fetching floor price: ${error}`);
    return { floorPrice: "Error", usdValue: 0.00, uiFormmatted: "0.0000 Sol" };
  }
};
  