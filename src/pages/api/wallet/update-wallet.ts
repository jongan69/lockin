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
    if (req.method !== 'PUT') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { address, referralAccountPubKey } = req.body;

    if (!address) {
        return res.status(400).json({ message: 'Wallet address is required' });
    }

    if (!referralAccountPubKey) {
        return res.status(400).json({ message: 'Referral account public key is required' });
    }

    try {
        const client = await MongoClient.connect(uri as string);
        const db = client.db('referral');
        const walletsCollection = db.collection('wallets');

        // Check if wallet exists
        const existingWallet = await walletsCollection.findOne({ address });

        if (!existingWallet) {
            await client.close();
            return res.status(404).json({ message: 'Wallet not found' });
        }

        // Update the referralAccountPubKey
        const result = await walletsCollection.updateOne(
            { address },
            { 
                $set: { 
                    referralAccountPubKey,
                    updatedAt: new Date()
                }
            }
        );

        await client.close();

        if (result.modifiedCount === 0) {
            return res.status(400).json({ message: 'No changes were made' });
        }

        return res.status(200).json({ 
            message: 'Wallet updated successfully',
            address,
            referralAccountPubKey
        });
    } catch (error) {
        console.error('Error updating wallet:', error);
        return res.status(500).json({ message: 'Error updating wallet' });
    }
} 