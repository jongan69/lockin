import React from "react";

export type ItemData = {
  decimals: number;
  mintAddress: string;
  name?: string;
  amount: number;
  symbol?: string;
  logo?: string;
  usdValue?: number;
};

type Props = {
  data: ItemData;
};

export function Item({ data }: Props) {
  const name = data.name
  const symbol = data.symbol
  const amount = data.amount
  const logo = data.logo 
  const usdValue = data.usdValue
  // const mint = data.account.data.parsed?.info.mint
  // const balance = data.account.data.parsed?.info.tokenAmount.uiAmount
  // const name = data.name;
  // const collection = data.collectionName;

  return (
    <div className="card shadow-xl bg-neutral text-neutral-content">
      {data && data.logo && (
        <figure className="relative h-80">
          <img
            className="object-cover h-80 w-96 aspect-square	"
            src={logo}
            alt={`Picture of ${name}`}
          />
        </figure>
      )}
      <div className="card-body p-4 items-center text-center">
        <h2 className="card-title m-0">{name}</h2>
        <p>{symbol}: {amount} (≈ ${usdValue})</p>
      </div>
    </div>
  );
}
