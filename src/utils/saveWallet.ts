import axios from "axios";
import { REFERAL_ADDRESS } from "@utils/globals";

interface WalletInfo {
  referredBy: string;
  referralAccountPubKey?: string;
}

export const saveWalletToDb = async (address: string, referredBy: string): Promise<string> => {
    try {
        if (!referredBy) {
            referredBy = REFERAL_ADDRESS;
        }
        const response = await axios.post('/api/wallet/save-wallet', { address, referredBy });
        return response.data.referredBy;
    } catch (error) {
        console.error('Error saving wallet:', error);
        return referredBy;
    }
};

export const getWalletInfo = async (address: string): Promise<WalletInfo | null> => {
    try {
        const response = await axios.get(`/api/wallet/get-wallet?address=${address}`);
        return response.data;
    } catch (error) {
        console.error('Error getting wallet info:', error);
        return null;
    }
};

export const updateWalletReferralAccount = async (address: string, referralAccountPubKey: string) => {
    try {
        const response = await axios.put('/api/wallet/update-wallet', { 
            address, 
            referralAccountPubKey 
        });
        return response.data;
    } catch (error) {
        console.error('Error updating wallet:', error);
        throw error;
    }
};