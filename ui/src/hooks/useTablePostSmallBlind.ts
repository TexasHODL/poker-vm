import { ethers } from "ethers";
import axios from "axios";
import useSWRMutation from "swr/mutation";
import { PROXY_URL } from "../config/constants";

interface PostSmallBlindOptions {
  userAddress: string | null;
  privateKey: string | null;
  publicKey: string | null;
  nonce?: string | number;
  actionIndex?: number | null;
  smallBlindAmount?: string; // Optional amount override
}

async function postSmallBlindFetcher(
  url: string,
  { arg }: { arg: PostSmallBlindOptions }
) {
  const { userAddress, privateKey, publicKey, nonce = Date.now().toString(), actionIndex, smallBlindAmount } = arg;
  
  console.log("🔵 Post small blind attempt for:", url);
  console.log("🔵 Using action index:", actionIndex);
  
  if (!userAddress || !privateKey) {
    console.error("🔵 Missing address or private key");
    throw new Error("Missing user address or private key");
  }

  // Ensure address is lowercase to avoid case-sensitivity issues
  const normalizedAddress = userAddress.toLowerCase();
  console.log("🔵 Using normalized address:", normalizedAddress);
  
  // Create a wallet to sign the message
  const wallet = new ethers.Wallet(privateKey);
  
  // Extract tableId correctly - grab the last segment of the URL
  const urlParts = url.split("/");
  const tableId = urlParts[urlParts.length - 2]; // Get the table ID part, not "post_small_blind"
  console.log("🔵 Extracted table ID:", tableId);
  
  // Create message to sign in format that matches the action pattern
  // Format: "post-small-blind" + amount + tableId + timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  const amount = smallBlindAmount || "100000000000000000"; // Default to 0.1 ETH if not provided
  const messageToSign = `post-small-blind${amount}${tableId}${timestamp}`;
  console.log("🔵 Message to sign:", messageToSign);
  
  // Sign the message
  const signature = await wallet.signMessage(messageToSign);
  console.log("🔵 Signature created");

  // Prepare request data that matches the proxy's expected format for PERFORM_ACTION
  const requestData = {
    userAddress: normalizedAddress, // Use the normalized (lowercase) address
    signature,
    publicKey: (publicKey || userAddress).toLowerCase(), // Also normalize publicKey
    action: "post-small-blind", // Explicitly specify the action
    amount, // Small blind amount
    smallBlindAmount: amount, // Include as both for flexibility in the server
    nonce: nonce || timestamp,
    timestamp,
    index: actionIndex !== undefined && actionIndex !== null ? actionIndex : 0 // Check explicitly for undefined/null
  };

  console.log("🔵 Sending post small blind request:", requestData);
  
  try {
    // Send the request to the proxy server with appropriate headers
    const response = await axios.post(url, requestData, {
      headers: {
        "Content-Type": "application/json"
      }
    });
    console.log("🔵 Post small blind response:", response.data);
    return response.data;
  } catch (error) {
    console.error("🔵 Post small blind error:", error);
    if (axios.isAxiosError(error) && error.response) {
      console.error("🔵 Response data:", error.response.data);
    }
    throw error;
  }
}

export function useTablePostSmallBlind(tableId: string | undefined) {
  const { trigger, isMutating, error, data } = useSWRMutation(
    tableId ? `${PROXY_URL}/table/${tableId}/post_small_blind` : null,
    postSmallBlindFetcher
  );

  // Add better error handling
  if (error) {
    console.error("Post small blind hook error:", error instanceof Error ? error.message : String(error));
  }

  // Return post small blind handler that accepts action index
  return {
    postSmallBlind: tableId ? (options: Omit<PostSmallBlindOptions, "actionIndex"> & { actionIndex?: number | null }) => 
      trigger(options) : null,
    isPostingSmallBlind: isMutating,
    error,
    data
  };
}
