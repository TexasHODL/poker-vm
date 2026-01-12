import { useMemo } from "react";
import { useGameStateContext } from "../context/GameStateContext";
import { GameOptionsDTO } from "@block52/poker-vm-sdk";
import { GameOptionsReturn } from "../types/index";

/**
 * Custom hook to fetch game options for a table
 * 
 * NOTE: Game options are handled through GameStateContext subscription.
 * Components call subscribeToTable(tableId) which creates a WebSocket connection with both tableAddress 
 * and playerId parameters. This hook reads the real-time game options from that context.
 * 
 * @returns Object containing game options and loading state - no defaults, returns actual values from server
 */
export const useGameOptions = (): GameOptionsReturn => {
    // Get game state directly from Context - real-time data via WebSocket
    const { gameState, isLoading, error } = useGameStateContext();

    // Memoize game options processing - no defaults, use actual server values
    const gameOptions = useMemo((): Required<GameOptionsDTO> | null => {
        if (!gameState?.gameOptions) {
            return null;
        }

        try {
            const options = gameState.gameOptions;
            
            // Check for missing fields and log errors
            const missingFields = [];
            if (!options.smallBlind) missingFields.push("smallBlind");
            if (!options.bigBlind) missingFields.push("bigBlind");
            if (options.timeout === undefined || options.timeout === null) missingFields.push("timeout");
            if (!options.minBuyIn) missingFields.push("minBuyIn");
            if (!options.maxBuyIn) missingFields.push("maxBuyIn");
            if (!options.maxPlayers) missingFields.push("maxPlayers");
            if (!options.minPlayers) missingFields.push("minPlayers");
            if (!options.format) missingFields.push("format");
            
            if (missingFields.length > 0) {
                console.error("⚠️ Missing game options fields from server:", missingFields);
            }
            
            // Only return options if we have the critical required fields (smallBlind, bigBlind, and format)
            // timeout is optional - use default of 30 seconds if not provided
            if (!options.smallBlind || !options.bigBlind || !options.format) {
                console.error("⚠️ Cannot display game options: missing critical fields (smallBlind, bigBlind, or format)");
                return null; // Return null during loading or when data is incomplete
            }

            // Use default timeout of 30 seconds if not provided
            const timeout = options.timeout ?? 30;
            
            // Return the actual game options from the server with defaults for optional fields
            // Cast as Required<GameOptionsDTO> since we've already checked critical fields exist
            return {
                minBuyIn: options.minBuyIn!,
                maxBuyIn: options.maxBuyIn!,
                maxPlayers: options.maxPlayers!,
                minPlayers: options.minPlayers!,
                smallBlind: options.smallBlind,
                bigBlind: options.bigBlind,
                timeout: timeout, // Use default timeout if not provided
                format: options.format!,
                otherOptions: options.otherOptions!
            } as Required<GameOptionsDTO>;
        } catch (err) {
            console.error("Error parsing game options:", err);
            return null;
        }
    }, [gameState]);

    return {
        gameOptions,
        isLoading,
        error
    };
};
