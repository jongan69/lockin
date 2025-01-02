import { REFERAL_ADDRESS } from '@utils/globals';
import { MongoClient } from 'mongodb';
import type { NextApiRequest, NextApiResponse } from 'next';

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error('Please add your Mongo URI to .env.local');
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    let { address, referredBy, referralAccountPubKey } = req.body;

    if (!address) {
        return res.status(400).json({ message: 'Wallet address is required' });
    }

    if (!referredBy) {
        referredBy = REFERAL_ADDRESS;
    }

    try {
        const client = await MongoClient.connect(uri as string);
        const db = client.db('referral');
        const walletsCollection = db.collection('wallets');

        // Check if wallet already exists
        const existingWallet = await walletsCollection.findOne({ address });

        if (existingWallet) {
            await client.close();
            return res.status(202).json({ message: `Wallet already registered, registered by: ${existingWallet.referredBy}`, referredBy: existingWallet.referredBy });
        }

        // Save wallet with timestamp
        await walletsCollection.insertOne({
            address,
            referredBy,
            createdAt: new Date(),
        });

        await client.close();

        return res.status(200).json({ message: 'Wallet saved successfully' });
    } catch (error) {
        console.error('Error saving wallet:', error);
        return res.status(500).json({ message: 'Error saving wallet' });
    }
} 