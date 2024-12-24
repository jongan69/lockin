import type { NextApiRequest, NextApiResponse } from 'next';
import { getBundleStatus } from '@utils/getBundleStatus';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { bundleId } = req.query;

    if (!bundleId) {
        return res.status(400).json({ error: 'Bundle ID is required' });
    }

    try {
        const status = await getBundleStatus(bundleId as string);
        console.log(status);
        // Extract relevant status information
        const bundleStatus = status.result.value[0];
        let statusMessage = 'pending';
        console.log(bundleStatus);
        if (bundleStatus) {
            if (bundleStatus.err) {
                statusMessage = 'rejected';
            } else if (bundleStatus.confirmation_status === 'finalized') {
                statusMessage = 'finalized';
            } else if (bundleStatus.confirmation_status === 'confirmed') {
                statusMessage = 'accepted';
            }
        }

        return res.status(200).json({
            success: true,
            bundleId,
            status: statusMessage,
            details: bundleStatus
        });
    } catch (error: any) {
        console.error('Status check error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to check bundle status',
            details: error.message || error
        });
    }
} 