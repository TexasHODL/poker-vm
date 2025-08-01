import React, { useEffect, useState, useRef, useCallback } from "react";
import "./QRDeposit.css"; // Import the CSS file with animations
import { QRCodeSVG } from "qrcode.react";
import { Eip1193Provider, ethers, parseUnits } from "ethers";
import axios from "axios";
import { DEPOSIT_ADDRESS, PROXY_URL, TOKEN_ADDRESS } from "../config/constants";
import useUserWallet from "../hooks/useUserWallet";
import useUserWalletConnect from "../hooks/DepositPage/useUserWalletConnect";
import { Link } from "react-router-dom";
import { formatBalance } from "../utils/numberUtils"; // Import formatBalance utility function
import { DepositSession, EtherscanTransaction, TransactionStatus } from "./types";
import spinner from "../assets/spinning-circles.svg";
import { v4 as uuidv4 } from "uuid";
import { colors, getAnimationGradient, hexToRgba, getHexagonStroke } from "../utils/colorConfig";

const ETHERSCAN_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY;
const RPC_URL = import.meta.env.VITE_MAINNET_RPC_URL;
const BITCOIN_PAYMENTS = import.meta.env.VITE_BTCPAY_SERVER_URL;
const basic_auth = import.meta.env.VITE_BTCPAY_BASIC_AUTH;
const CLUB_NAME = import.meta.env.VITE_CLUB_NAME || "Block 52";

// Add USDC contract ABI (just the transfer method)
const USDC_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)"
];

// Add hexagon pattern SVG background
const HexagonPattern = () => {
    return (
        <div className="absolute inset-0 z-0 opacity-5 overflow-hidden pointer-events-none">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <pattern id="hexagons" width="50" height="43.4" patternUnits="userSpaceOnUse" patternTransform="scale(5)">
                        <path d="M25,3.4 L45,17 L45,43.4 L25,56.7 L5,43.4 L5,17 L25,3.4 z" stroke={getHexagonStroke()} strokeWidth="0.6" fill="none" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#hexagons)" />
            </svg>
        </div>
    );
};

const QRDeposit: React.FC = () => {
    const { accountData, refreshBalance } = useUserWallet();
    const b52Balance = accountData?.balance;
    const b52Nonce = accountData?.nonce;
    const b52Address = accountData?.address;
    const { isConnected, open, address: web3Address } = useUserWalletConnect();
    const [showQR, setShowQR] = useState<boolean>(false);
    const [latestTransaction, setLatestTransaction] = useState<EtherscanTransaction | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(300); // 5 minutes in seconds
    const [isQuerying, setIsQuerying] = useState<boolean>(false);
    const [loggedInAccount, setLoggedInAccount] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [currentSession, setCurrentSession] = useState<DepositSession | null>(null);
    const [depositAmount, setDepositAmount] = useState<string>("");
    const [web3Balance, setWeb3Balance] = useState<string>("0");
    const [isTransferring, setIsTransferring] = useState(false);
    const [displayBalance, setDisplayBalance] = useState<string>("0");
    const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>(null);
    const [progressPercentage, setProgressPercentage] = useState<number>(0);
    const [completionCountdown, setCompletionCountdown] = useState<number>(0);
    const [isDepositCompleted, setIsDepositCompleted] = useState<boolean>(false);

    const [isBitcoinLoading, setIsBitcoinLoading] = useState<boolean>(false);
    // const [usdcAmount, setUSDCAmount] = useState("100.00"); // Default value for USDC input

    // Add state for mouse position
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    // Add a ref for the animation frame ID
    const animationFrameRef = useRef<number | undefined>(undefined);

    // Add effect to track mouse movement
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Only update if no animation frame is pending
            if (!animationFrameRef.current) {
                animationFrameRef.current = requestAnimationFrame(() => {
                    // Calculate mouse position as percentage of window
                    const x = (e.clientX / window.innerWidth) * 100;
                    const y = (e.clientY / window.innerHeight) * 100;
                    setMousePosition({ x, y });
                    animationFrameRef.current = undefined;
                });
            }
        };

        window.addEventListener("mousemove", handleMouseMove);

        // Cleanup function to remove event listener and cancel any pending animation frames
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    // Get progress percentage based on transaction status
    const getProgressFromStatus = (status: TransactionStatus): number => {
        switch (status) {
            case "DETECTED":
                return 20;
            case "PROCESSING":
                return 40;
            case "CONFIRMING":
                return 60;
            case "CONFIRMED":
                return 80;
            case "COMPLETED":
                return 100;
            default:
                return 0;
        }
    };

    // Update progress based on transaction status
    useEffect(() => {
        if (transactionStatus) {
            setProgressPercentage(getProgressFromStatus(transactionStatus));

            // Start 30 second countdown after confirmation
            if (transactionStatus === "CONFIRMED") {
                setCompletionCountdown(20);
            }
        }
    }, [transactionStatus]);

    // Handle completion countdown
    useEffect(() => {
        if (completionCountdown <= 0) {
            if (transactionStatus === "CONFIRMED") {
                setTransactionStatus("COMPLETED");
            }
            return;
        }

        const timer = setInterval(() => {
            setCompletionCountdown(prev => prev - 1);

            // Gradually increase progress from 80 to 100 during countdown
            const newProgress = 80 + ((30 - completionCountdown) / 30) * 20;
            setProgressPercentage(Math.min(newProgress, 100));
        }, 1000);

        return () => clearInterval(timer);
    }, [completionCountdown, transactionStatus]);

    // Update displayBalance when b52Balance changes
    useEffect(() => {
        if (b52Balance) {
            setDisplayBalance(b52Balance.toString());
        }
    }, [b52Balance]);

    // Add refresh interval for balance
    useEffect(() => {
        // Set up a timer to refresh balance every 5 seconds
        const balanceRefreshInterval = setInterval(() => {
            // Use the refreshBalance function from the hook
            refreshBalance();
        }, 5000);

        // Clean up interval on unmount
        return () => clearInterval(balanceRefreshInterval);
    }, [refreshBalance]);

    // Add countdown timer effect
    useEffect(() => {
        if (!showQR || !currentSession || currentSession.status !== "PENDING" || timeLeft <= 0) {
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft(prevTime => {
                const newTime = prevTime - 1;
                if (newTime <= 0) {
                    // Session expired
                    setShowQR(false);
                    setCurrentSession(prev => (prev ? { ...prev, status: "EXPIRED" } : null));
                    return 0;
                }
                return newTime;
            });
        }, 1000);

        // Cleanup timer on unmount or when conditions change
        return () => {
            clearInterval(timer);
        };
    }, [showQR, currentSession, timeLeft]);

    // Format time function
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    // Get the stored public key on component mount
    useEffect(() => {
        const storedKey = localStorage.getItem("user_eth_public_key");
        if (storedKey) {
            setLoggedInAccount(storedKey);
        }
    }, []);

    // Function to get USDC balance of connected wallet
    const fetchWeb3Balance = useCallback(async () => {
        if (!web3Address) return;

        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const usdcContract = new ethers.Contract(TOKEN_ADDRESS, USDC_ABI, provider);
            const balance = await usdcContract.balanceOf(web3Address);
            setWeb3Balance(ethers.formatUnits(balance, 6)); // USDC has 6 decimals
        } catch (error) {
            console.error("Error fetching USDC balance:", error);
        }
    }, [web3Address]);

    // Fetch balance when wallet connects
    useEffect(() => {
        if (web3Address) {
            fetchWeb3Balance();
        }
    }, [fetchWeb3Balance, web3Address]);

    // Handle form submission for Bitcoin payments.
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (BITCOIN_PAYMENTS) {
            const formData = new FormData(e.currentTarget);

            const config = {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Basic ${basic_auth}`
                }
            };

            const payload = {
                orderId: uuidv4(),
                itemDesc: "Bitcoin Buy In",
                metadata: {
                    itemCode: `${CLUB_NAME} Buy In`,
                    orderUrl: `${BITCOIN_PAYMENTS}/invoices`,
                    itemDesc: loggedInAccount
                },
                checkout: {
                    speedPolicy: "HighSpeed",
                    defaultPaymentMethod: "BTC-CHAIN",
                    lazyPaymentMethods: true,
                    expirationMinutes: 90,
                    monitoringMinutes: 90,
                    paymentTolerance: 0,
                    redirectAutomatically: true
                },
                amount: formData.get("usdcAmount"),
                currency: "USD"
            };

            try {
                setIsBitcoinLoading(true);
                const response = await axios.post(`${BITCOIN_PAYMENTS}/invoices`, payload, config);
                setIsBitcoinLoading(false);
                console.log("🔷 QRDeposit: Bitcoin payment response:", response.data);

                // Navigate to the payment URL
                if (response.data && response.data.checkoutLink) {
                    window.location.href = response.data.checkoutLink;
                }
            } catch (error) {
                console.error("🔷 QRDeposit: Bitcoin payment error:", error);
            }
        }
    };

    const handleGenerateQR = async () => {
        if (!loggedInAccount) {
            setError("Please connect your wallet first");
            return;
        }

        if (BITCOIN_PAYMENTS) {
            const basic_auth = process.env.VITE_BTCPAY_BASIC_AUTH;

            const config = {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Basic ${basic_auth}`
                }
            };

            const payload = {
                orderId: "test",
                itemDesc: "Bitcoin Buy In",
                metadata: {
                    itemCode: `${process.env.VITE_CLUB_NAME} BuyIn`,
                    orderUrl: "https://payments.texashodl.net",
                    itemDesc: loggedInAccount
                },
                checkout: {
                    speedPolicy: "HighSpeed",
                    defaultPaymentMethod: "BTC-CHAIN",
                    lazyPaymentMethods: true,
                    expirationMinutes: 90,
                    monitoringMinutes: 90,
                    paymentTolerance: 0,
                    redirectAutomatically: true
                },
                amount: "0", // Use the USDC amount entered by the user
                currency: "USD"
            };

            try {
                setIsBitcoinLoading(true);
                const response = await axios.post(`${BITCOIN_PAYMENTS}/invoices`, payload, config);
                setIsBitcoinLoading(false);
                console.log("🔷 QRDeposit: Bitcoin payment response:", response.data);

                // Navigate to the payment URL
                if (response.data && response.data.checkoutLink) {
                    window.location.href = response.data.checkoutLink;
                }
            } catch (error) {
                console.error("🔷 QRDeposit: Bitcoin payment error:", error);
            }
        }

        if (!BITCOIN_PAYMENTS) {
            try {
                const payload = {
                    userAddress: loggedInAccount,
                    depositAddress: DEPOSIT_ADDRESS
                };

                const response = await axios.post(`${PROXY_URL}/deposit-sessions`, payload);

                setCurrentSession(response.data);
                setSessionId(response.data._id);
                setShowQR(true);
                setTimeLeft(300); // 5 minutes
                startPolling();
                setError(null);
                setTransactionStatus(null);
                setProgressPercentage(0);
            } catch (error: unknown) {
                console.error("Failed to create deposit session:", error);
                if (error && typeof error === "object" && "response" in error) {
                    const axiosError = error as { response?: { data?: { error?: string } } };
                    setError(axiosError.response?.data?.error || "Failed to create deposit session");
                } else {
                    setError("Failed to create deposit session");
                }
            }
        }
    };

    // Function to check session status periodically
    const checkSessionStatus = useCallback(async () => {
        if (!sessionId || !currentSession || isDepositCompleted) return;

        try {
            console.log("🔷 QRDeposit: Checking session status");
            const response = await axios.get(`${PROXY_URL}/deposit-sessions/user/${loggedInAccount}`);
            const session = response.data;

            if (session) {
                console.log("🔷 QRDeposit: Session status update:", session);
                setCurrentSession(session);

                // Update transaction status if it changed
                if (session.txStatus && session.txStatus !== transactionStatus) {
                    console.log("🔷 QRDeposit: Transaction status changed to:", session.txStatus);
                    setTransactionStatus(session.txStatus);

                    // Set completed flag when we reach COMPLETED state
                    if (session.txStatus === "COMPLETED") {
                        console.log("🔷 QRDeposit: Deposit completed, stopping further checks");
                        setIsDepositCompleted(true);
                    }
                }

                // If session is completed, request a balance refresh
                if (session.status === "COMPLETED" && currentSession.status !== "COMPLETED") {
                    console.log("🔷 QRDeposit: Session completed, refreshing balance");
                    refreshBalance();
                    setIsDepositCompleted(true);
                }
            }
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                // Session not found, stop polling
                console.log("🔷 QRDeposit: Session no longer exists, stopping checks");
                setIsDepositCompleted(true);
                // Clear the current session if it was removed from the server
                if (currentSession.status !== "COMPLETED") {
                    setCurrentSession(null);
                    setShowQR(false);
                }
            } else {
                console.error("Failed to check session status:", error);
            }
        }
    }, [currentSession, isDepositCompleted, loggedInAccount, refreshBalance, sessionId, transactionStatus]);

    // Poll for session status updates - stop when completed
    useEffect(() => {
        if (!currentSession || !sessionId || isDepositCompleted) return;

        console.log("🔷 QRDeposit: Starting session polling");
        const interval = setInterval(checkSessionStatus, 5000);
        return () => {
            console.log("🔷 QRDeposit: Stopping session polling");
            clearInterval(interval);
        };
    }, [currentSession, sessionId, loggedInAccount, isDepositCompleted, checkSessionStatus]);

    // Reset completion state when starting a new QR code session
    useEffect(() => {
        if (showQR && currentSession?.status === "PENDING") {
            setIsDepositCompleted(false);
        }
    }, [showQR, currentSession]);

    const completeSession = useCallback(
        async (amount: number) => {
            if (!sessionId) return;

            try {
                setTransactionStatus("DETECTED");

                const response = await axios.put(`${PROXY_URL}/deposit-sessions/${sessionId}/complete`, {
                    amount
                });
                console.log("Session completed request:", response.data);
                setCurrentSession(response.data);

                // Update transaction status if available
                if (response.data.txStatus) {
                    setTransactionStatus(response.data.txStatus);
                } else {
                    setTransactionStatus("PROCESSING");
                }
            } catch (error) {
                console.error("Failed to complete session:", error);
            }
        },
        [sessionId]
    );

    const startPolling = useCallback(() => {
        console.log("Starting transaction polling");

        const interval = setInterval(async () => {
            setIsQuerying(true);
            try {
                const response = await axios.get(
                    `https://api.etherscan.io/api?module=account&action=txlist&address=${DEPOSIT_ADDRESS}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`
                );

                if (response.data.status === "1" && response.data.result.length > 0) {
                    const latestTx = response.data.result[0];
                    setLatestTransaction(latestTx);

                    // If we find a new transaction, complete the session
                    if (currentSession?.status === "PENDING") {
                        await completeSession(parseFloat(ethers.formatEther(latestTx.value)));
                    }
                }
            } catch (error) {
                console.error("Error fetching transactions:", error);
            } finally {
                setIsQuerying(false);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [completeSession, currentSession?.status]);

    // Function to copy text to clipboard
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    // Add polling effect
    useEffect(() => {
        if (!showQR || !currentSession || currentSession.status !== "PENDING") return;

        // Add function to check for token transfers
        const checkForTransfer = async () => {
            if (!currentSession || currentSession.status !== "PENDING") return;

            try {
                setIsQuerying(true);
                const provider = new ethers.JsonRpcProvider(RPC_URL);

                // Get token contract
                const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ["event Transfer(address indexed from, address indexed to, uint256 value)"], provider);

                // Get latest block number
                const latestBlock = await provider.getBlockNumber();

                // Look for Transfer events in last few blocks
                const events = await tokenContract.queryFilter(tokenContract.filters.Transfer(null, DEPOSIT_ADDRESS), latestBlock - 10, latestBlock);

                if (events.length > 0) {
                    const lastTransfer = events[events.length - 1] as ethers.EventLog;
                    if (!lastTransfer.args) return;
                    const [from, to, value] = lastTransfer.args;

                    console.log("=== Transfer Detected ===");
                    console.log("From:", from);
                    console.log("To:", to);
                    console.log("Value:", value.toString());
                    console.log("Session ID:", currentSession._id);

                    setTransactionStatus("DETECTED");

                    const response = await axios.put(`${PROXY_URL}/deposit-sessions/${currentSession._id}/complete`, { amount: value.toString() });

                    if (response.data) {
                        setCurrentSession(response.data);

                        if (response.data.txStatus) {
                            setTransactionStatus(response.data.txStatus);
                        } else {
                            setTransactionStatus("PROCESSING");
                        }
                    }
                }
            } catch (error) {
                console.error("Error checking for transfers:", error);
            } finally {
                setIsQuerying(false);
            }
        };

        const interval = setInterval(checkForTransfer, 5000); // Check every 5 seconds

        return () => clearInterval(interval);
    }, [showQR, currentSession]);

    // Function to handle direct USDC transfer
    const handleDirectTransfer = async () => {
        if (!web3Address || !currentSession) return;

        setIsTransferring(true);
        try {
            // Get signer from connected wallet
            const provider = new ethers.BrowserProvider(window.ethereum as unknown as Eip1193Provider);
            const signer = await provider.getSigner();

            // Create USDC contract instance
            const usdcContract = new ethers.Contract(TOKEN_ADDRESS, USDC_ABI, signer);

            // Convert amount to USDC units (6 decimals)
            const amount = parseUnits(depositAmount, 6);

            // Send transfer transaction
            setTransactionStatus("DETECTED");
            const tx = await usdcContract.transfer(DEPOSIT_ADDRESS, amount);
            setTransactionStatus("PROCESSING");
            await tx.wait();

            // Update session with amount
            await completeSession(parseFloat(depositAmount));

            // Refresh balances
            fetchWeb3Balance();

            // Show success message
            alert("Deposit successful!");
        } catch (error) {
            console.error("Transfer failed:", error);
            alert("Transfer failed. Please try again.");
            setTransactionStatus(null);
        } finally {
            setIsTransferring(false);
        }
    };

    // Get status message based on transaction status
    const getStatusMessage = (): string => {
        switch (transactionStatus) {
            case "DETECTED":
                return "Deposit detected! Processing...";
            case "PROCESSING":
                return "Processing your deposit...";
            case "CONFIRMING":
                return "Confirming transaction on Layer 1...";
            case "CONFIRMED":
                return `Deposit confirmed on Layer 1! Finalizing (${completionCountdown}s)...`;
            case "COMPLETED":
                return "Deposit confirmed on Layer 2!";
            default:
                return "Waiting for deposit...";
        }
    };

    // Check for existing session on component mount
    useEffect(() => {
        const checkExistingSession = async () => {
            if (!loggedInAccount) return;

            try {
                const response = await axios.get(`${PROXY_URL}/deposit-sessions/user/${loggedInAccount}`);
                if (response.data) {
                    const session = response.data;

                    // Only set current session if it's not completed or expired
                    if (session.status === "PENDING" || session.status === "PROCESSING") {
                        console.log("🔷 QRDeposit: Found active session:", session);
                        setCurrentSession(session);
                        setSessionId(session._id);
                        setShowQR(true);

                        // Set transaction status if available
                        if (session.txStatus) {
                            setTransactionStatus(session.txStatus);
                        }

                        // Calculate remaining time
                        const expiresAt = new Date(session.expiresAt).getTime();
                        const now = new Date().getTime();
                        const remainingTime = Math.max(0, Math.floor((expiresAt - now) / 1000));
                        setTimeLeft(Math.min(remainingTime, 300));

                        if (remainingTime > 0) {
                            startPolling();
                        }
                    } else {
                        console.log("🔷 QRDeposit: Found completed or expired session, not loading it:", session);
                    }
                }
            } catch (error) {
                console.log("No active session found or error occurred:", error);
            }
        };

        checkExistingSession();
    }, [loggedInAccount, startPolling]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background animations */}
            <div
                className="fixed inset-0 z-0"
                style={{
                    backgroundImage: getAnimationGradient(mousePosition.x, mousePosition.y),
                    backgroundColor: colors.table.bgBase,
                    filter: "blur(40px)",
                    transition: "all 0.3s ease-out"
                }}
            />

            {/* Add hexagon pattern overlay */}
            <HexagonPattern />

            {/* Animated pattern overlay */}
            <div
                className="fixed inset-0 z-0 opacity-20"
                style={{
                    backgroundImage: `
                        repeating-linear-gradient(
                            ${45 + mousePosition.x / 10}deg,
                            ${hexToRgba(colors.animation.color2, 0.1)} 0%,
                            ${hexToRgba(colors.animation.color1, 0.1)} 25%,
                            ${hexToRgba(colors.animation.color4, 0.1)} 50%,
                            ${hexToRgba(colors.animation.color5, 0.1)} 75%,
                            ${hexToRgba(colors.animation.color2, 0.1)} 100%
                        )
                    `,
                    backgroundSize: "400% 400%",
                    animation: "gradient 15s ease infinite",
                    transition: "background 0.5s ease"
                }}
            />

            {/* Moving light animation */}
            <div
                className="fixed inset-0 z-0 opacity-30"
                style={{
                    backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${hexToRgba(colors.brand.primary, 0.1)} 25%, rgba(0,0,0,0) 50%, ${hexToRgba(colors.brand.primary, 0.1)} 75%, rgba(0,0,0,0) 100%)`,
                    backgroundSize: "200% 100%",
                    animation: "shimmer 8s infinite linear"
                }}
            />

            <div 
                className="max-w-md w-full backdrop-blur-md rounded-xl shadow-2xl p-6 relative z-10 transition-all duration-300"
                style={{
                    backgroundColor: colors.ui.bgDark,
                    border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`,
                    boxShadow: `0 0 20px ${hexToRgba(colors.brand.primary, 0.1)}`
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 25px ${hexToRgba(colors.brand.primary, 0.15)}`;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 20px ${hexToRgba(colors.brand.primary, 0.1)}`;
                }}
            >
                {/* Back Button */}
                <Link 
                    to="/" 
                    className="absolute top-4 left-4 flex items-center transition duration-300"
                    style={{ color: colors.ui.textSecondary }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "white";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = colors.ui.textSecondary;
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path
                            fillRule="evenodd"
                            d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                            clipRule="evenodd"
                        />
                    </svg>
                    <span>Back to Dashboard</span>
                </Link>

                <h1 className="text-2xl font-extrabold text-center mb-6 mt-5" style={{ color: "white" }}>
                    Deposit {BITCOIN_PAYMENTS ? "Bitcoin" : "USDC"} in to {CLUB_NAME}
                </h1>

                <div 
                    className="backdrop-blur-sm rounded-lg p-4 mb-6 shadow-lg transition-all duration-300"
                    style={{
                        backgroundColor: colors.ui.bgMedium,
                        border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.2);
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.1);
                    }}
                >
                    <p className="text-lg mb-2" style={{ color: "white" }}>{CLUB_NAME} Balance:</p>
                    <p className="text-xl font-bold" style={{ color: colors.brand.primary }}>${formatBalance(displayBalance)} USDC</p>
                    {b52Nonce !== null && (
                        <p 
                            className="text-sm mt-2 border-t pt-2"
                            style={{
                                color: colors.ui.textSecondary + "dd",
                                borderColor: colors.ui.textSecondary
                            }}
                        >
                            <span style={{ color: colors.brand.primary + "cc" }}>Nonce:</span> {b52Nonce}
                        </p>
                    )}
                </div>

                {/* Transaction Progress Bar */}
                {transactionStatus && (
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-lg font-semibold" style={{ color: "white" }}>Deposit Status</h2>
                            <span className="text-sm" style={{ color: colors.accent.success }}>{getStatusMessage()}</span>
                        </div>
                        <div className="w-full rounded-full h-4" style={{ backgroundColor: colors.ui.bgMedium }}>
                            <div
                                className="h-4 rounded-full transition-all duration-500 ease-out"
                                style={{ 
                                    width: `${progressPercentage}%`,
                                    backgroundColor: colors.accent.success
                                }}
                            ></div>
                        </div>
                        {currentSession?.txHash && (
                            <div className="mt-2 text-xs text-gray-400">
                                TX:{" "}
                                <a
                                    href={`https://etherscan.io/tx/${currentSession.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:underline"
                                    style={{ color: colors.brand.primary }}
                                >
                                    {currentSession.txHash.substring(0, 10)}...{currentSession.txHash.substring(currentSession.txHash.length - 8)}
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {/* Session Status */}
                {currentSession && !transactionStatus && (
                    <div 
                        className="backdrop-blur-sm rounded-lg p-4 mb-6 shadow-lg transition-all duration-300"
                        style={{
                            backgroundColor: colors.ui.bgMedium,
                            border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.2);
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.1);
                        }}
                    >
                        <h2 className="text-lg font-semibold mb-2" style={{ color: "white" }}>Session Status</h2>
                        <p className="text-sm" style={{ color: colors.ui.textSecondary + "dd" }}>Status: {currentSession.status}</p>
                        <p className="text-sm" style={{ color: colors.ui.textSecondary + "dd" }}>Session ID: {currentSession._id}</p>
                        {currentSession.amount && <p className="text-sm" style={{ color: colors.ui.textSecondary + "dd" }}>Amount: ${(Number(currentSession.amount) / 1e6).toFixed(2)} USDC</p>}
                    </div>
                )}

                {/* Timer Display */}
                {showQR && currentSession?.status === "PENDING" && !transactionStatus && (
                    <div className="text-center mb-4">
                        <div className="text-xl font-bold" style={{ color: "white" }}>Time Remaining: {formatTime(timeLeft)}</div>
                        <div className="text-sm" style={{ color: colors.ui.textSecondary }}>
                            Session will expire in {Math.floor(timeLeft / 60)} minutes and {timeLeft % 60} seconds
                        </div>
                        <div 
                            className="mt-2 p-2 backdrop-blur-sm rounded-lg"
                            style={{
                                backgroundColor: colors.ui.bgMedium,
                                border: `1px solid ${colors.accent.danger}50`
                            }}
                        >
                            <div className="flex items-center" style={{ color: "#eab308" }}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        fillRule="evenodd"
                                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                <span className="font-semibold">Do not close this page while waiting for deposit</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Block52 Account Display */}
                <form onSubmit={handleSubmit}>
                    {!showQR && (
                        <div 
                            className="backdrop-blur-sm rounded-lg p-4 mb-6 shadow-lg transition-all duration-300"
                            style={{
                                backgroundColor: colors.ui.bgMedium,
                                border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.2);
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.1);
                            }}
                        >
                            <h2 className="text-lg font-semibold mb-2" style={{ color: "white" }}>Block52 Account</h2>
                            <p className="text-sm break-all" style={{ color: colors.ui.textSecondary + "dd" }}>{b52Address || loggedInAccount || "Not logged in"}</p>
                        </div>
                    )}

                    {BITCOIN_PAYMENTS && (
                        <div 
                            className="backdrop-blur-sm rounded-lg p-4 mb-6 shadow-lg transition-all duration-300"
                            style={{
                                backgroundColor: colors.ui.bgMedium,
                                border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.2);
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.1);
                            }}
                        >
                            <p className="text-sm mb-2" style={{ color: colors.ui.textSecondary + "dd" }}>Amount in USD:</p>
                            <input 
                                name="usdcAmount" 
                                type="text" 
                                placeholder="100.00" 
                                className="w-full p-2 rounded-lg"
                                style={{
                                    backgroundColor: colors.ui.bgDark,
                                    color: "white"
                                }}
                            />
                        </div>
                    )}

                    {/* Generate QR / Main Content Area */}
                    {!showQR ? (
                        <button
                            onClick={handleGenerateQR}
                            disabled={!loggedInAccount}
                            className="w-full py-3 px-4 rounded-lg transition duration-300 shadow-md"
                            style={{
                                backgroundColor: !loggedInAccount ? colors.ui.textSecondary : colors.brand.primary,
                                color: "white",
                                cursor: !loggedInAccount ? "not-allowed" : "pointer"
                            }}
                            onMouseEnter={(e) => {
                                if (loggedInAccount) {
                                    e.currentTarget.style.backgroundColor = colors.brand.secondary;
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (loggedInAccount) {
                                    e.currentTarget.style.backgroundColor = colors.brand.primary;
                                }
                            }}
                        >
                            {BITCOIN_PAYMENTS ? "Pay with Bitcoin" : "Generate Deposit QR Code"}
                            {isBitcoinLoading && <img src={spinner} />}
                        </button>
                    ) : (
                        // <button
                        //     type="submit"
                        //     className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300 shadow-md mt-4"
                        // >
                        //     {BITCOIN_PAYMENTS ? "Pay with Bitcoin" : "Generate Deposit QR Code"}
                        //     {isBitcoinLoading && <img src={spinner} />}
                        // </button>
                        <>
                            {/* Only show QR if no transaction is in progress */}
                            {!transactionStatus && (
                                <>
                                    <div 
                                        className="backdrop-blur-sm rounded-lg p-4 mb-6 shadow-lg transition-all duration-300"
                                        style={{
                                            backgroundColor: colors.ui.bgMedium,
                                            border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.2);
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.1);
                                        }}
                                    >
                                        <h2 className="text-lg font-semibold mb-2" style={{ color: "white" }}>Pay with USDC ERC20</h2>
                                        <p className="text-sm mb-4" style={{ color: colors.ui.textSecondary + "dd" }}>Only send USDC using the Ethereum network</p>
                                    </div>

                                    {/* QR Code */}
                                    <div className="flex justify-center mb-6">
                                        <div className="bg-white p-4 rounded-lg shadow-lg">
                                            <QRCodeSVG value={`ethereum:${DEPOSIT_ADDRESS}`} size={200} level="H" />
                                        </div>
                                    </div>

                                    {/* Payment Details */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm text-gray-400">Payment address</label>
                                            <div
                                                className="flex items-center justify-between p-2 rounded cursor-pointer"
                                                style={{
                                                    backgroundColor: colors.ui.bgMedium,
                                                    border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`
                                                }}
                                                onClick={() => copyToClipboard(DEPOSIT_ADDRESS)}
                                            >
                                                <span className="text-sm" style={{ color: "white" }}>{`${DEPOSIT_ADDRESS}`}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Latest Transaction */}
                            {latestTransaction && !transactionStatus && (
                                <div className="mt-6">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-lg font-semibold text-white">Latest Transaction</h3>
                                        <span 
                                            className="text-xs"
                                            style={{
                                                color: isQuerying ? colors.accent.success : colors.ui.textSecondary
                                            }}
                                        >
                                            {isQuerying ? "🔄 Checking for new transactions..." : "Last checked just now"}
                                        </span>
                                    </div>
                                    <div 
                                        className="p-3 rounded text-sm"
                                        style={{
                                            backgroundColor: colors.ui.bgMedium,
                                            color: "white",
                                            border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`
                                        }}
                                    >
                                        <p>
                                            Hash: {latestTransaction.hash.slice(0, 10)}...{latestTransaction.hash.slice(-8)}
                                        </p>
                                        <p>Amount: {ethers.formatEther(latestTransaction.value)} ETH</p>
                                        <p>
                                            From: {latestTransaction.from.slice(0, 6)}...{latestTransaction.from.slice(-4)}
                                        </p>
                                        <p>Age: {new Date(Number(latestTransaction.timeStamp) * 1000).toLocaleString()}</p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </form>

                {/* Web3 Wallet Connection Section - Now placed below as alternative */}
                <div className="mt-8 pt-6 border-t border-gray-700">
                    <div className="text-center mb-4">
                        <span className="text-gray-400 text-sm">OR</span>
                    </div>

                    <div 
                        className="backdrop-blur-sm rounded-lg p-4 shadow-lg transition-all duration-300"
                        style={{
                            backgroundColor: colors.ui.bgMedium,
                            border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.2);
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = hexToRgba(colors.brand.primary, 0.1);
                        }}
                    >
                        <h2 className="text-lg font-semibold mb-4" style={{ color: "white" }}>Deposit with Web3 Wallet</h2>
                        <p className="text-sm mb-4" style={{ color: colors.ui.textSecondary }}>Alternative method using your connected Web3 wallet</p>

                        {!isConnected ? (
                            <button
                                onClick={open}
                                className="w-full py-3 px-4 rounded-lg transition duration-300 shadow-md"
                                style={{
                                    backgroundColor: colors.brand.primary,
                                    color: "white"
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = colors.brand.secondary;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = colors.brand.primary;
                                }}
                            >
                                Connect Wallet
                            </button>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center" style={{ color: "white" }}>
                                    <span>
                                        Connected: {web3Address?.slice(0, 6)}...{web3Address?.slice(-4)}
                                    </span>
                                    <span>Balance: {web3Balance} USDC</span>
                                </div>

                                <div className="space-y-2">
                                    <input
                                        type="number"
                                        value={depositAmount}
                                        onChange={e => setDepositAmount(e.target.value)}
                                        placeholder="Enter USDC amount"
                                        className="w-full p-2 rounded"
                                        style={{
                                            backgroundColor: colors.ui.textSecondary,
                                            border: `1px solid ${hexToRgba(colors.brand.primary, 0.2)}`,
                                            color: "white"
                                        }}
                                        min="0"
                                        step="0.01"
                                    />

                                    <button
                                        onClick={handleDirectTransfer}
                                        disabled={!depositAmount || isTransferring || !currentSession || transactionStatus !== null}
                                        className="w-full py-3 px-4 rounded-lg transition duration-300 shadow-md"
                                        style={{
                                            backgroundColor: (!depositAmount || isTransferring || !currentSession || transactionStatus !== null) 
                                                ? colors.ui.textSecondary 
                                                : colors.brand.primary,
                                            color: "white",
                                            cursor: (!depositAmount || isTransferring || !currentSession || transactionStatus !== null) 
                                                ? "not-allowed" 
                                                : "pointer"
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!(!depositAmount || isTransferring || !currentSession || transactionStatus !== null)) {
                                                e.currentTarget.style.backgroundColor = colors.brand.secondary;
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!(!depositAmount || isTransferring || !currentSession || transactionStatus !== null)) {
                                                e.currentTarget.style.backgroundColor = colors.brand.primary;
                                            }
                                        }}
                                    >
                                        {isTransferring ? "Processing..." : "Deposit USDC"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Error message display */}
            {error && (
                <div 
                    className="mt-4 p-3 backdrop-blur-md rounded-lg shadow-lg z-10"
                    style={{
                        backgroundColor: colors.accent.danger + "/90",
                        color: "white",
                        border: `1px solid ${colors.accent.danger}`
                    }}
                >
                    Error: {error}
                </div>
            )}

            {/* Powered by Block52 */}
            <div className="fixed bottom-4 left-4 flex items-center z-10">
                <div 
                    className="flex flex-col items-start px-3 py-2 rounded-lg backdrop-blur-sm shadow-lg transition-all duration-300"
                    style={{
                        backgroundColor: colors.ui.bgDark,
                        border: `1px solid ${colors.accent.glow}30`
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = `0 0 20px ${hexToRgba(colors.accent.glow, 0.2)}`;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
                    }}
                >
                    <div className="text-left mb-1">
                        <span 
                            className="text-xs font-medium tracking-wide"
                            style={{
                                background: `linear-gradient(to right, ${colors.accent.glow}, ${colors.brand.primary}, ${colors.accent.glow})`,
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text"
                            }}
                        >
                            POWERED BY
                        </span>
                    </div>
                    <img 
                        src="/logo1080.png" 
                        alt="Block52 Logo" 
                        className="h-12 w-auto object-contain" 
                        style={{
                            filter: `drop-shadow(0 0 8px ${hexToRgba(colors.accent.glow, 0.5)})`
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default QRDeposit;
