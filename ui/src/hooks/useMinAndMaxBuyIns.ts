import { useGameStateContext } from "../context/GameStateContext";
import { MinAndMaxBuyInsReturn } from "../types/index";

/**
 * Custom hook to fetch min and max buy-in values for a table
 * 
 * NOTE: Min and max buy-in values are handled through GameStateContext subscription.
 * Components call subscribeToTable(tableId) which creates a WebSocket connection with both tableAddress 
 * and playerId parameters. This hook reads the real-time buy-in data from that context.
 * 
 * @returns Object containing min/max buy-in values in wei
 */
export const useMinAndMaxBuyIns = (): MinAndMaxBuyInsReturn => {
  // Get game state directly from Context - real-time data via WebSocket
  const { gameState, isLoading, error } = useGameStateContext();

  // Default values in case of error or loading
  const defaultValues: MinAndMaxBuyInsReturn = {
    minBuyInWei: "10000000000000000", // 0.01 ETH
    maxBuyInWei: "1000000000000000000", // 1 ETH
    isLoading,
    error
  };

  // If still loading or error occurred, return default values
  if (isLoading || error || !gameState) {
    return defaultValues;
  }

  try {
    // Extract game options from the game state
    const gameOptions = gameState.gameOptions;

    console.log("🎰 useMinAndMaxBuyIns - Game Options:");
    console.log("  Full gameState:", gameState);
    console.log("  Full gameOptions:", gameOptions);
    console.log("  Game format:", gameOptions?.format);
    console.log("  Raw minBuyIn:", gameOptions?.minBuyIn, typeof gameOptions?.minBuyIn);
    console.log("  Raw maxBuyIn:", gameOptions?.maxBuyIn, typeof gameOptions?.maxBuyIn);

    if (!gameOptions) {
      console.warn("No game options found in game state");
      return defaultValues;
    }

    // Get min and max buy-in values
    let minBuyInWei = gameOptions.minBuyIn || defaultValues.minBuyInWei;
    let maxBuyInWei = gameOptions.maxBuyIn || defaultValues.maxBuyInWei;

    // TEMPORARY FIX: PVM returns Wei values (18 decimals) but Cosmos uses micro-units (6 decimals)
    // If values are larger than 100 million (> 10^8), divide by 10^12 to convert Wei → micro-units
    // Normal USDC micro-units max out at ~100 million (e.g., 50000000 = $50)
    // Wei values are typically 10^15 or larger (e.g., 5000000000000000000 = 5 ETH)
    const WEI_TO_MICROUNITS_DIVISOR = 1_000_000_000_000; // 10^12
    const SUSPICIOUSLY_LARGE = 100_000_000; // 10^8 (100 million micro-units = $100, anything above is likely Wei)

    const minBuyInNumber = typeof minBuyInWei === "string" ? parseInt(minBuyInWei, 10) : Number(minBuyInWei);
    const maxBuyInNumber = typeof maxBuyInWei === "string" ? parseInt(maxBuyInWei, 10) : Number(maxBuyInWei);

    console.log("🔍 Checking if values need Wei conversion:");
    console.log("  minBuyInNumber:", minBuyInNumber);
    console.log("  maxBuyInNumber:", maxBuyInNumber);
    console.log("  Threshold (SUSPICIOUSLY_LARGE):", SUSPICIOUSLY_LARGE);

    if (minBuyInNumber > SUSPICIOUSLY_LARGE) {
      console.warn("⚠️ minBuyIn looks like Wei, converting to micro-units:", minBuyInWei);
      minBuyInWei = String(Math.floor(minBuyInNumber / WEI_TO_MICROUNITS_DIVISOR));
      console.log("  ✅ Converted minBuyIn to:", minBuyInWei);
    }

    if (maxBuyInNumber > SUSPICIOUSLY_LARGE) {
      console.warn("⚠️ maxBuyIn looks like Wei, converting to micro-units:", maxBuyInWei);
      maxBuyInWei = String(Math.floor(maxBuyInNumber / WEI_TO_MICROUNITS_DIVISOR));
      console.log("  ✅ Converted maxBuyIn to:", maxBuyInWei);
    }

    // ADDITIONAL CHECK: If values are still wrong after Wei conversion, try dividing by 1000
    // This handles the case where PVM multiplies by 1000 for some reason
    const finalMinNumber = typeof minBuyInWei === "string" ? parseInt(minBuyInWei, 10) : Number(minBuyInWei);
    const finalMaxNumber = typeof maxBuyInWei === "string" ? parseInt(maxBuyInWei, 10) : Number(maxBuyInWei);

    // If still above 100M after Wei conversion, try /1000
    if (finalMinNumber > SUSPICIOUSLY_LARGE) {
      console.warn("⚠️ minBuyIn still too large after Wei check, dividing by 1000:", minBuyInWei);
      minBuyInWei = String(Math.floor(finalMinNumber / 1000));
      console.log("  ✅ Final minBuyIn:", minBuyInWei);
    }

    if (finalMaxNumber > SUSPICIOUSLY_LARGE) {
      console.warn("⚠️ maxBuyIn still too large after Wei check, dividing by 1000:", maxBuyInWei);
      maxBuyInWei = String(Math.floor(finalMaxNumber / 1000));
      console.log("  ✅ Final maxBuyIn:", maxBuyInWei);
    }

    console.log("🎰 useMinAndMaxBuyIns - Buy-in values:");
    console.log("  minBuyIn from gameOptions:", gameOptions.minBuyIn);
    console.log("  maxBuyIn from gameOptions:", gameOptions.maxBuyIn);
    console.log("  minBuyInWei (after all conversions):", minBuyInWei);
    console.log("  maxBuyInWei (after all conversions):", maxBuyInWei);

    const result: MinAndMaxBuyInsReturn = {
      minBuyInWei,
      maxBuyInWei,
      isLoading: false,
      error: null
    };

    return result;
  } catch (err) {
    console.error("Error parsing buy-in values:", err);
    return {
      ...defaultValues,
      error: err instanceof Error ? err : new Error("Error parsing buy-in values")
    };
  }
};
