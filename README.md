# Lockin.wtf

![Lockin.wtf Logo](https://user-images.githubusercontent.com/38172/212745837-5de1adb8-7bca-4af1-9772-9e9547a4a06b.png)

An on-chain lockin dApp that allows you to lock in your tokens.

## What's Included

### **🗝️ Connect to a Solana Wallet and Validate Ownership**

First things first!

Easily connect any Solana wallet supported by [@solana/wallet-adapter](https://github.com/solana-labs/wallet-adapter) to your dApp by adjusting the configuration. Popular wallets like [Phantom](https://phantom.app/) and [Backpack](https://www.backpack.app/) are included by default.

To enhance the user experience and save a few clicks, auto-connect is enabled by default, allowing the dApp to connect to your wallet automatically if it has been approved before.

To address potential security issues, we've implemented a signing mechanism to validate wallet ownership. The dApp will automatically request a signature upon wallet connection, but this can also be done during specific actions to confirm intent.

Creating a signature is done on the client-side without any interaction with the blockchain, making it completely safe.

![Wallet Connection](https://user-images.githubusercontent.com/38172/212745139-919a969c-1064-414f-8e63-eaacfc17d29d.mp4)

### **🔗 Interact with Solana's Blockchain**

Once your wallet is connected, it's time to interact with the blockchain!

This starter kit includes examples for the following actions:

- Create a transaction of SOL to another wallet
- Create a transaction of an SPL token (like $BONK) to another wallet
- Submit the transaction to the blockchain
- Confirm if the transaction was successful
- Find the Twitter handle associated with a wallet address

All these actions are performed natively using official Solana libraries like [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/), [@solana/spl-token](https://solana-labs.github.io/solana-program-library/token/js/), and [@solana/name-service](https://spl.solana.com/name-service).

Additionally, we use Next.js architecture to execute these actions on the backend, with only the transaction signing happening on the client-side.

![Blockchain Interaction](https://user-images.githubusercontent.com/38172/212745192-14713ea5-6dab-4889-b400-baf1337a4f1f.mp4)

### **🔌 Fetch On-Chain Data through Helius API**

Solana's blockchain data can be complex to parse, but services like [Helius](https://helius.xyz/) provide APIs to access stored data more easily.

Helius API parses and formats the data in a more readable way, which is a boon for developers!

In this template, we use the Helius API to retrieve the list of NFTs in your wallet, but you can adapt this example to fetch other data from their multiple endpoints.

### **🎨 Build Your Own Style**

This template uses [Tailwind CSS](https://tailwindcss.com/) and [daisyUI](https://daisyui.com/) for rapid development, allowing you to quickly iterate and build any kind of dApp with pre-defined or custom themes.

You can easily change the theme by modifying `daisy.themes` in `./tailwind.config.js` and setting the `data-theme` attribute in the `<html>` tag.

To enhance accessibility, we integrated a simple theme switcher, enabling users to toggle between dark and light modes.

We also added the [react-hot-toast](https://react-hot-toast.com/) library for visually appealing feedback on on-chain actions.

![Theme Switcher](https://user-images.githubusercontent.com/38172/212745502-628238cd-311c-436c-b669-76285fa5769b.mp4)

## Getting Started

1. Get an API key from [Helius](https://helius.xyz/). This is necessary to fetch wallet details.
2. Run `npx create-next-app -e https://github.com/aeminium-labs/nextjs-solana-starter-kit` to set up this template locally (you can also click on the "Use this template" button or fork the repository).
3. Add a `.env.local` file with your Helius API key:

```
HELIUS_API_KEY=<your key>
```

4. Run `npm run dev` to start the development server.
5. Make changes and have fun!

## Deploying

1. Run `npm run build` locally to ensure everything compiles correctly.
2. Link your favorite server provider to your repository (we use Vercel for the demo).
3. Any push to the `main` branch will automatically deploy a new version.

> _This starter kit was made possible by the amazing [Create dApp Solana Next](https://github.com/thuglabs/create-dapp-solana-nextjs) template, which served as the foundation for everything here._