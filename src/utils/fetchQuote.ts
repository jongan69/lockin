import { QuoteGetRequest } from "@jup-ag/api";

// Fetch quotes with retries
export const fetchQuoteWithRetries = async (
    apiClient: any,
    params: QuoteGetRequest
  ): Promise<any> => {
    const MAX_RETRIES = 3;
    const JUPITER_API_RETRY_DELAY = 1000; // 1 second
  
    let attemptCount = 0;
  
    while (attemptCount < MAX_RETRIES) {
      try {
        // Fetch quote using Jupiter API client
        const quote = await apiClient.quoteGet(params);
  
        if (quote && !quote.error) {
          return quote; // Successfully fetched the quote
        }
  
        throw new Error(quote?.error || "No quote returned");
      } catch (error: any) {
        console.error(`Attempt ${attemptCount + 1} failed:`, error);
  
        attemptCount++;
        if (attemptCount >= MAX_RETRIES) {
          throw new Error(`Failed to get quote after ${MAX_RETRIES} attempts`);
        }
  
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, JUPITER_API_RETRY_DELAY));
      }
    }
  
    throw new Error("Failed to fetch a valid quote after retries");
  };
  