import { useState, useCallback } from "react";
import { GameFormat, COSMOS_CONSTANTS } from "@block52/poker-vm-sdk";
import { getSigningClient, getCosmosClient } from "../utils/cosmos/client";
import { useNetwork } from "../context/NetworkContext";

// Type for rake configuration options
export interface RakeOptions {
    rakeFreeThreshold: number;  // Pot threshold in USDC below which no rake is taken
    rakePercentage: number;     // Percentage of pot taken as rake (0-100)
    rakeCap: number;            // Maximum rake amount in USDC per hand
    owner: string;              // Address that receives the rake
}

// Type for SNG/Tournament specific options
export interface SNGOptions {
    startingStack: number;       // Starting chips for each player (in chips, not dollars)
    blindLevelDuration?: number; // Minutes per blind level (default: 10)
}

// Type for creating new table options
export interface CreateTableOptions {
    format: GameFormat;
    minBuyIn: number;
    maxBuyIn: number;
    minPlayers: number;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    rake?: RakeOptions;         // Optional rake configuration
    sng?: SNGOptions;           // Optional SNG/Tournament configuration
}

// Type for useNewTable hook return
export interface UseNewTableReturn {
    createTable: (gameOptions: CreateTableOptions) => Promise<{ txHash: string; gameId: string | null } | null>;
    isCreating: boolean;
    error: Error | null;
    newGameId: string | null;
}

/**
 * Custom hook to create a new game on Cosmos blockchain using SigningCosmosClient
 * @returns Object with createTable function, loading state, and error
 */
export const useNewTable = (): UseNewTableReturn => {
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [newGameId, setNewGameId] = useState<string | null>(null);
    const { currentNetwork } = useNetwork();

    const createTable = useCallback(async (
        gameOptions: CreateTableOptions
    ): Promise<{ txHash: string; gameId: string | null } | null> => {
        console.log("🏁 useNewTable.createTable called with options:", gameOptions);
        console.log("Current network:", currentNetwork);

        setIsCreating(true);
        setError(null);
        setNewGameId(null);

        try {
            const { signingClient, userAddress } = await getSigningClient(currentNetwork);

            // Convert buy-in from dollars to usdc micro-units using SDK constants
            console.log("📍 Converting amounts to micro-units...");
            const minBuyInB52USDC = BigInt(Math.floor(gameOptions.minBuyIn * Math.pow(10, COSMOS_CONSTANTS.USDC_DECIMALS)));
            const maxBuyInB52USDC = BigInt(Math.floor(gameOptions.maxBuyIn * Math.pow(10, COSMOS_CONSTANTS.USDC_DECIMALS)));

            // Convert blind values from dollars to micro-units
            const smallBlindB52USDC = BigInt(Math.floor(gameOptions.smallBlind * Math.pow(10, COSMOS_CONSTANTS.USDC_DECIMALS)));
            const bigBlindB52USDC = BigInt(Math.floor(gameOptions.bigBlind * Math.pow(10, COSMOS_CONSTANTS.USDC_DECIMALS)));

            console.log("🎮 Game Settings:");
            console.log(`  Game Format: ${gameOptions.format}`);
            console.log(`  Buy In: $${gameOptions.minBuyIn} - $${gameOptions.maxBuyIn}`);
            console.log(`  Blinds: $${gameOptions.smallBlind}/$${gameOptions.bigBlind} (input)`);
            console.log(`  Blinds: ${smallBlindB52USDC}/${bigBlindB52USDC} usdc (converted)`);

            console.log("📊 Final game parameters:");
            console.log(`  Game Format: ${gameOptions.format}`);
            console.log(`  Players: ${gameOptions.minPlayers}-${gameOptions.maxPlayers}`);
            console.log(`  Min Buy-in: ${minBuyInB52USDC} usdc ($${gameOptions.minBuyIn})`);
            console.log(`  Max Buy-in: ${maxBuyInB52USDC} usdc ($${gameOptions.maxBuyIn})`);
            console.log(`  Small Blind: ${smallBlindB52USDC} usdc`);
            console.log(`  Big Blind: ${bigBlindB52USDC} usdc`);

            // Convert rake options if provided
            let rakeConfig = undefined;
            if (gameOptions.rake) {
                const rakeFreeThresholdB52USDC = BigInt(Math.floor(gameOptions.rake.rakeFreeThreshold * Math.pow(10, COSMOS_CONSTANTS.USDC_DECIMALS)));
                const rakeCapB52USDC = BigInt(Math.floor(gameOptions.rake.rakeCap * Math.pow(10, COSMOS_CONSTANTS.USDC_DECIMALS)));

                rakeConfig = {
                    rakeFreeThreshold: rakeFreeThresholdB52USDC,
                    rakePercentage: gameOptions.rake.rakePercentage,
                    rakeCap: rakeCapB52USDC,
                    owner: gameOptions.rake.owner
                };

                console.log("💰 Rake Configuration:");
                console.log(`  Rake Free Threshold: ${rakeFreeThresholdB52USDC} usdc ($${gameOptions.rake.rakeFreeThreshold})`);
                console.log(`  Rake Percentage: ${gameOptions.rake.rakePercentage}%`);
                console.log(`  Rake Cap: ${rakeCapB52USDC} usdc ($${gameOptions.rake.rakeCap})`);
                console.log(`  Owner: ${gameOptions.rake.owner}`);
            }

            // Convert SNG options if provided
            let sngConfig = undefined;
            if (gameOptions.sng) {
                sngConfig = {
                    startingStack: BigInt(gameOptions.sng.startingStack),
                    blindLevelDuration: gameOptions.sng.blindLevelDuration
                };

                console.log("🎰 SNG Configuration:");
                console.log(`  Starting Stack: ${gameOptions.sng.startingStack} chips`);
                console.log(`  Blind Level Duration: ${gameOptions.sng.blindLevelDuration ?? 10} minutes`);
            }

            console.log("🚀 Creating New Game on Cosmos Blockchain:");
            console.log(`Creator: ${userAddress}`);

            // Map GameFormat to string for Cosmos
            const gameTypeStr = gameOptions.format === GameFormat.SIT_AND_GO ? "sit_and_go" :
                gameOptions.format === GameFormat.TOURNAMENT ? "tournament" : "cash";

            console.log(`Mapped game format: ${gameOptions.format} -> ${gameTypeStr}`);

            // Timeout in seconds (5 minutes = 300 seconds)
            const timeoutSeconds = 300;

            console.log("📍 Calling signingClient.createGame...");
            // Call SigningCosmosClient.createGame()
            const txHash = await signingClient.createGame(
                gameTypeStr,
                gameOptions.minPlayers,
                gameOptions.maxPlayers,
                minBuyInB52USDC,
                maxBuyInB52USDC,
                smallBlindB52USDC,
                bigBlindB52USDC,
                timeoutSeconds,
                rakeConfig,
                sngConfig
            );

            if (txHash) {
                console.log(`✅ Game creation transaction submitted: ${txHash}`);
                setNewGameId(txHash);

                // Fetch the transaction to extract the game_id from events
                try {
                    console.log("📡 Fetching transaction details to extract game_id...");
                    const cosmosClient = getCosmosClient(currentNetwork);

                    if (!cosmosClient) {
                        console.warn("⚠️ Could not get cosmos client to fetch transaction details");
                        return null;
                    }

                    // Wait a moment for the transaction to be indexed
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    const tx = await cosmosClient.getTx(txHash);
                    console.log("📦 Transaction response:", tx);
                    
                    // Extract game_id from game_created event
                    let gameId: string | null = null;
                    if (tx?.tx_response?.events) {
                        const gameCreatedEvent = tx.tx_response.events.find((e: any) => e.type === "game_created");
                        if (gameCreatedEvent) {
                            const gameIdAttr = gameCreatedEvent.attributes?.find((a: any) => a.key === "game_id");
                            if (gameIdAttr) {
                                gameId = gameIdAttr.value;
                                console.log(`✅ Extracted game_id from transaction: ${gameId}`);
                            }
                        }
                    }
                    
                    if (!gameId) {
                        console.warn("⚠️ Could not extract game_id from transaction events");
                    }
                    
                    return { txHash, gameId };
                } catch (txError) {
                    console.error("❌ Error fetching transaction details:", txError);
                    // Return txHash even if we couldn't get game_id
                    return { txHash, gameId: null };
                }
            } else {
                console.warn("⚠️ signingClient.createGame returned null/undefined");
                return null;
            }
        } catch (err: any) {
            const errorMessage = err.message || "Failed to create game on blockchain";
            setError(new Error(errorMessage));
            console.error("❌ Error creating game:", err);
            console.error("Error stack:", err.stack);
            return null;
        } finally {
            console.log("📍 Finally block: setting isCreating to false");
            setIsCreating(false);
        }
    }, [currentNetwork]);

    return {
        createTable,
        isCreating,
        error,
        newGameId
    };
};
