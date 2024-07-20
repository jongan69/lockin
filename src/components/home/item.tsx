import React, { useState, useEffect } from "react";

export type ItemData = {
  decimals: number;
  mintAddress: string;
  tokenAddress: string;
  name?: string;
  amount: number;
  symbol?: string;
  logo?: string;
  usdValue: number;
  cid?: string;
};

type ImageProps = {
  cid: string | undefined;
  logo: string | undefined;
  alt: string;
};

const DEFAULT_IMAGE_URL =
  process.env.UNKNOWN_IMAGE_URL ||
  "https://s3.coinmarketcap.com/static-gravity/image/5cc0b99a8dd84fbfa4e150d84b5531f2.png";

const ImageComponent = ({ cid, alt, logo }: ImageProps) => {
  const [src, setSrc] = useState<string>(DEFAULT_IMAGE_URL);

  useEffect(() => {
    if (cid) {
      const imageUrl = `https://ipfs.io/ipfs/${cid}`;
      setSrc(imageUrl);
    } else if (logo) {
      setSrc(logo);
    }
  }, [cid]);

  const handleError = () => {
    setSrc(DEFAULT_IMAGE_URL);
  };

  return <img className="object-cover h-80 w-96 aspect-square" src={src} alt={alt} onError={handleError} />;
};

type ItemProps = {
  data: ItemData;
};

export function Item({ data }: ItemProps) {
  const { name, symbol, amount, logo, usdValue, cid } = data;

  return (
    <div className="card shadow-xl bg-neutral text-neutral-content">
      {logo && (
        <figure className="relative h-80">
          <ImageComponent cid={cid} logo={logo} alt={`Picture of ${name}`} />
        </figure>
      )}
      <div className="card-body p-4 items-center text-center">
        <h2 className="card-title m-0">{name}</h2>
        <p>
          {symbol}: {amount} (≈ ${usdValue})
        </p>
      </div>
    </div>
  );
}
