import axios from "axios";
import { REFERAL_WALLET } from "@utils/globals";

export const saveWalletToDb = async (address: string, referredBy: string) => {
    try {
        if (!referredBy) {
            referredBy = REFERAL_WALLET;
        }
        const response = await axios.post('/api/save-wallet', { address, referredBy });
        return response.data.referredBy;
    } catch (error) {
        console.error('Error saving wallet:', error);
        return referredBy;
    }
};