import { TokenData } from "@utils/tokenUtils";
import React, { useState, useEffect } from "react";


type ImageProps = {
  cid?: string | null;
  logo: string | undefined;
  alt: string;
};

const DEFAULT_IMAGE_URL =
  process.env.UNKNOWN_IMAGE_URL ||
  "https://s3.coinmarketcap.com/static-gravity/image/5cc0b99a8dd84fbfa4e150d84b5531f2.png";

const ImageComponent = ({ cid, alt, logo }: ImageProps) => {
  const [src, setSrc] = useState<string>(DEFAULT_IMAGE_URL);

  useEffect(() => {
    if (cid && !logo) {
      const imageUrl = `https://ipfs.io/ipfs/${cid}`;
      setSrc(imageUrl);
    } else if (logo) {
      setSrc(logo);
    }
  }, [cid, logo, alt]);

  const handleError = () => {
    setSrc(DEFAULT_IMAGE_URL);
  };
  console.log(`Image src: ${src}, https://ipfs.io/ipfs/${cid}`);
  return <img className="object-cover h-80 w-96 aspect-square" src={src} alt={alt} onError={handleError} />;
};

type ItemProps = {
  data: TokenData;
};

export function Item({ data }: ItemProps) {
  const { 
    name, 
    symbol, 
    amount, 
    logo, 
    usdValue, 
    cid, 
    collectionName,
    collectionLogo,
    isNft
  } = data;

  const cardClass = `card shadow-xl bg-neutral text-neutral-content ${usdValue === 0 && amount > 0 || isNft && amount > 0 ? 'border-red-500 border-4' : ''}`;

  return (
    <div className={cardClass}>
      {logo && (
        <figure className="relative h-80">
          <ImageComponent cid={cid} logo={logo ?? collectionLogo} alt={`Picture of ${name}`} />
        </figure>
      )}
      <div className="card-body p-4 items-center text-center">
        <h2 className="card-title m-0">{name}</h2>
        {isNft && <p>NFT Collection Name: {collectionName}</p>}
        <p>
          {symbol}: {Number(amount).toFixed(5)}(≈ ${usdValue})
        </p>
      </div>
    </div>
  );
}
