import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ethers } from "ethers";
import { useGameOptions } from "../../hooks/useGameOptions";
import { useVacantSeatData } from "../../hooks/useVacantSeatData";
import { formatWeiToSimpleDollars } from "../../utils/numberUtils";
import { getAccountBalance } from "../../utils/b52AccountUtils";
import { colors, hexToRgba } from "../../utils/colorConfig";
import { joinTable } from "../../hooks/playerActions/joinTable";

interface SitAndGoAutoJoinModalProps {
    tableId: string;
    onJoinSuccess: () => void;
}

const SitAndGoAutoJoinModal: React.FC<SitAndGoAutoJoinModalProps> = ({ tableId, onJoinSuccess }) => {
    const [accountBalance, setAccountBalance] = useState<string>("0");
    const [isBalanceLoading, setIsBalanceLoading] = useState<boolean>(true);
    const [buyInError, setBuyInError] = useState("");
    const [isJoining, setIsJoining] = useState(false);
    const [hasJoined, setHasJoined] = useState(false);

    // Get game options
    const { gameOptions } = useGameOptions();
    const { emptySeatIndexes, isUserAlreadyPlaying } = useVacantSeatData();
    
    // Get publicKey once
    const publicKey = useMemo(() => localStorage.getItem("user_eth_public_key") || undefined, []);

    // Calculate formatted values
    const { maxBuyInFormatted, balanceFormatted, smallBlindFormatted, bigBlindFormatted } = useMemo(() => {
        if (!gameOptions) {
            return {
                maxBuyInFormatted: "0",
                balanceFormatted: 0,
                smallBlindFormatted: "0",
                bigBlindFormatted: "0"
            };
        }

        const maxFormatted = formatWeiToSimpleDollars(gameOptions.maxBuyIn || "0");
        const balance = accountBalance ? parseFloat(ethers.formatUnits(accountBalance, 18)) : 0;
        const smallBlind = formatWeiToSimpleDollars(gameOptions.smallBlind || "0");
        const bigBlind = formatWeiToSimpleDollars(gameOptions.bigBlind || "0");

        return {
            maxBuyInFormatted: maxFormatted,
            balanceFormatted: balance,
            smallBlindFormatted: smallBlind,
            bigBlindFormatted: bigBlind
        };
    }, [gameOptions, accountBalance]);

    // Fetch balance on mount
    useEffect(() => {
        const fetchBalance = async () => {
            try {
                setIsBalanceLoading(true);

                if (!publicKey) {
                    setBuyInError("No wallet address available");
                    setIsBalanceLoading(false);
                    return;
                }

                const balance = await getAccountBalance();
                setAccountBalance(balance);
            } catch (err) {
                console.error("Error fetching account balance:", err);
                setBuyInError("Failed to fetch balance");
            } finally {
                setIsBalanceLoading(false);
            }
        };

        fetchBalance();
    }, [publicKey]);

    // Handle auto-join
    const handleTakeSeat = useCallback(async () => {
        if (!publicKey || !tableId || isUserAlreadyPlaying || hasJoined) return;

        // Check if there are empty seats
        if (emptySeatIndexes.length === 0) {
            setBuyInError("No empty seats available");
            return;
        }

        // Check balance
        const maxBuyInNumber = parseFloat(maxBuyInFormatted);
        if (balanceFormatted < maxBuyInNumber) {
            setBuyInError(`Insufficient balance. Need $${maxBuyInFormatted}`);
            return;
        }

        setIsJoining(true);
        setBuyInError("");

        try {
            // Get random seat
            const randomIndex = Math.floor(Math.random() * emptySeatIndexes.length);
            const selectedSeat = emptySeatIndexes[randomIndex];

            // Convert buy-in to Wei (use max buy-in for Sit & Go)
            const buyInWei = ethers.parseUnits(maxBuyInFormatted, 18).toString();

            // Join the table with the selected seat
            await joinTable(tableId, {
                amount: buyInWei,
                seatNumber: selectedSeat
            });
            
            // Mark as joined and notify parent
            setHasJoined(true);
            
            // Store buy-in info in localStorage for the table component
            localStorage.setItem("buy_in_amount", maxBuyInFormatted);
            localStorage.setItem("wait_for_big_blind", JSON.stringify(false));
            
            // Small delay then close
            setTimeout(() => {
                onJoinSuccess();
            }, 500);
        } catch (error: any) {
            console.error("Failed to join table:", error);
            setBuyInError(error.message || "Failed to join table");
        } finally {
            setIsJoining(false);
        }
    }, [publicKey, tableId, isUserAlreadyPlaying, hasJoined, emptySeatIndexes, maxBuyInFormatted, balanceFormatted, onJoinSuccess]);

    // Don't show modal if user is already playing or has joined
    if (isUserAlreadyPlaying || hasJoined) {
        return null;
    }

    // Get player count label
    const getPlayerCountLabel = () => {
        if (!gameOptions) return "";
        const count = gameOptions.minPlayers || gameOptions.maxPlayers || 0;
        if (count === 2) return "Heads Up";
        if (count === 6) return "6-Max";
        if (count === 9) return "Full Ring";
        return `${count} Players`;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-gray-800/90 backdrop-blur-md p-8 rounded-xl w-96 shadow-2xl border border-blue-400/20 relative overflow-hidden">
                {/* Web3 styled background */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-purple-600/10 rounded-xl"></div>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-pulse"></div>
                
                <div className="relative z-10">
                    <div className="flex items-center justify-center mb-4">
                        <img src="/block52.png" alt="Block52 Logo" className="h-16 w-auto object-contain" />
                    </div>
                    
                    <div className="flex items-center justify-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-400/30">
                            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                                      d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                            </svg>
                        </div>
                    </div>
                    
                    <h2 className="text-2xl font-bold text-white text-center mb-2 text-shadow">Sit & Go Tournament</h2>
                    <p className="text-gray-300 text-center mb-6 text-sm">Join this exciting {getPlayerCountLabel()} tournament!</p>
                    
                    {/* Game Options Display */}
                    <div className="space-y-3 mb-6">
                        <div className="bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-blue-500/30">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-sm">Format:</span>
                                <span className="text-white font-semibold">Texas Hold'em • {getPlayerCountLabel()}</span>
                            </div>
                        </div>
                        
                        <div className="bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-blue-500/30">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-sm">Buy-in:</span>
                                <span className="text-white font-semibold">${maxBuyInFormatted}</span>
                            </div>
                        </div>
                        
                        <div className="bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-blue-500/30">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-sm">Blinds:</span>
                                <span className="text-white font-semibold">
                                    ${smallBlindFormatted} / ${bigBlindFormatted}
                                </span>
                            </div>
                        </div>
                        
                        <div className="bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-blue-500/30">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-sm">Your Balance:</span>
                                <span className={`font-semibold ${balanceFormatted >= parseFloat(maxBuyInFormatted) ? "text-green-400" : "text-red-400"}`}>
                                    ${balanceFormatted.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Error Message */}
                    {buyInError && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                            <p className="text-red-400 text-sm text-center">{buyInError}</p>
                        </div>
                    )}

                    {/* Available Seats */}
                    <div className="mb-6 p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                        <div className="text-center">
                            <div className="text-xs text-blue-300 font-semibold mb-1">SEATS AVAILABLE</div>
                            <div className="text-lg text-white font-bold">
                                {emptySeatIndexes.length} / {gameOptions?.maxPlayers || 0}
                            </div>
                        </div>
                    </div>
                    
                    {/* Take Seat Button */}
                    <button
                        onClick={handleTakeSeat}
                        disabled={isJoining || isBalanceLoading || balanceFormatted < parseFloat(maxBuyInFormatted) || emptySeatIndexes.length === 0}
                        className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all duration-300 ${
                            isJoining || isBalanceLoading || balanceFormatted < parseFloat(maxBuyInFormatted) || emptySeatIndexes.length === 0
                                ? "bg-gray-600 cursor-not-allowed"
                                : "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 transform hover:scale-105"
                        }`}
                    >
                        {isJoining ? (
                            <div className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Joining Table...
                            </div>
                        ) : isBalanceLoading ? (
                            "Loading Balance..."
                        ) : balanceFormatted < parseFloat(maxBuyInFormatted) ? (
                            "Insufficient Balance"
                        ) : emptySeatIndexes.length === 0 ? (
                            "Table Full"
                        ) : (
                            "Take My Seat"
                        )}
                    </button>
                    
                    <div className="mt-6 text-center">
                        <p className="text-xs text-gray-400">Tournament starts when all players are seated</p>
                        <div className="flex items-center justify-center gap-1 mt-2">
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                            <span className="text-xs text-gray-400">Powered by Block52</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SitAndGoAutoJoinModal;