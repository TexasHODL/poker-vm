export enum PlayerActionType {
    SMALL_BLIND = "post-small-blind",
    BIG_BLIND = "post-big-blind",
    FOLD = "fold",
    CHECK = "check",
    BET = "bet",
    CALL = "call",
    RAISE = "raise",
    ALL_IN = "all-in",
    MUCK = "muck",
    SHOW = "show"
}

export enum NonPlayerActionType {
    DEAL = "deal",
    JOIN = "join",
    LEAVE = "leave",
    NEW_HAND = "new-hand",
    SIT_IN = "sit-in",
    SIT_OUT = "sit-out",
    TOP_UP = "top-up"
}

export const AllPlayerActions = { ...PlayerActionType, ...NonPlayerActionType };

export enum GameType {
    CASH = "cash",
    SIT_AND_GO = "sit-and-go",
    TOURNAMENT = "tournament"
}

// GameFormat represents the game structure/format (preferred over GameType for new code)
export enum GameFormat {
    CASH = "cash",
    SIT_AND_GO = "sit-and-go",
    TOURNAMENT = "tournament"
}

export enum GameStatus {
    WAITING_FOR_PLAYERS = "waiting-for-players",
    REGISTRATION = "registration",
    IN_PROGRESS = "in-progress",
    FINISHED = "finished"
}

export enum PlayerStatus {
    ACTIVE = "active",
    BUSTED = "busted",
    FOLDED = "folded",
    ALL_IN = "all-in",
    SEATED = "seated",
    SITTING_OUT = "sitting-out",
    SITTING_IN = "sitting-in",
    SHOWING = "showing",
    WAITING = "waiting"
}

export enum TexasHoldemRound {
    ANTE = "ante",
    PREFLOP = "preflop",
    FLOP = "flop",
    TURN = "turn",
    RIVER = "river",
    SHOWDOWN = "showdown",
    END = "end"
}

export type RakeConfig = {
    rakeFreeThreshold: bigint; // Absolute value below which the hand is rake-free
    rakePercentage: number; // Percentage of the pot that is the rake (e.g., 5 for 5%)
    rakeCap: bigint; // Maximum rake amount (absolute cap)
    owner: string; // Address that receives the rake
};

export type RakeConfigDTO = {
    rakeFreeThreshold: string; // Absolute value below which the hand is rake-free
    rakePercentage: number; // Percentage of the pot that is the rake (e.g., 5 for 5%)
    rakeCap: string; // Maximum rake amount (absolute cap)
};

export type GameOptions = {
    minBuyIn: bigint;
    maxBuyIn: bigint;
    minPlayers: number;
    maxPlayers: number;
    smallBlind: bigint;
    bigBlind: bigint;
    timeout: number;
    format: GameFormat; // Game format (cash/sit-and-go/tournament)
    rake?: RakeConfig; // Optional rake configuration
    owner?: string; // Table owner who collects rake fees
    startingStack?: bigint; // Starting chips for SNG/Tournament (in chips, not dollars)
    blindLevelDuration?: number; // Minutes per blind level for SNG/Tournament (default: 10)
    otherOptions?: Record<string, any>; // Placeholder for future options
};

export type GameOptionsDTO = {
    minBuyIn?: string;
    maxBuyIn?: string;
    minPlayers?: number;
    maxPlayers?: number;
    smallBlind?: string;
    bigBlind?: string;
    timeout?: number;
    format?: GameFormat; // Game format (cash/sit-and-go/tournament)
    rake?: RakeConfigDTO; // Optional rake configuration
    owner?: string; // Table owner who collects rake fees
    startingStack?: string; // Starting chips for SNG/Tournament (in chips, not dollars)
    blindLevelDuration?: number; // Minutes per blind level for SNG/Tournament (default: 10)
    otherOptions?: Record<string, any>; // Placeholder for future options
};

// This is the type of the last action of a player
export type ActionDTO = {
    playerId: string,
    seat: number,
    action: PlayerActionType | NonPlayerActionType;
    amount: string;
    round: TexasHoldemRound;
    index: number;
    timestamp: number;
};

export type LegalActionDTO = {
    action: PlayerActionType | NonPlayerActionType;
    min: string | undefined;
    max: string | undefined;
    index: number;
};

export type WinnerDTO = {
    address: string;
    amount: string;
    cards: string[] | undefined;
    name: string | undefined;
    description: string | undefined;
};

export type PlayerDTO = {
    address: string;
    seat: number; // change to position
    stack: string; // BigNumber
    isSmallBlind: boolean,
    isBigBlind: boolean,
    isDealer: boolean,
    holeCards: string[] | undefined;
    status: PlayerStatus;
    lastAction: ActionDTO | undefined;
    legalActions: LegalActionDTO[];
    sumOfBets: string;
    timeout: number;
    signature: string;
};

export type ResultDTO = {
    place: number;
    playerId: string;
    payout: string;
};

export type TexasHoldemGameState = {
    type: string;
    address: string;
    minBuyIn: string;
    maxBuyIn: string;
    minPlayers: number;
    maxPlayers: number;
    smallBlind: string;
    bigBlind: string;
    dealer: number;
    players: string[];
    deck: string;
    communityCards: string[];
    pots: string[];
    lastActedSeat: number;
    actionCount: number;
    handNumber: number;
    round: TexasHoldemRound;
    winners: string[];
    results: ResultDTO[];
    signature: string;
};

export type TexasHoldemStateDTO = {
    gameFormat: GameFormat; // Game format (cash/sit-and-go/tournament)
    address: string;
    gameOptions: GameOptionsDTO;
    smallBlindPosition?: number;
    bigBlindPosition?: number;
    dealer?: number;
    players: PlayerDTO[];
    communityCards: string[];
    deck: string; // Assume this will be encrypted
    pots: string[];
    lastActedSeat?: number;
    nextToAct: number;
    previousActions: ActionDTO[];
    actionCount: number;
    handNumber: number;
    round: TexasHoldemRound;
    winners: WinnerDTO[];
    results: ResultDTO[];
    signature: string;
};

export enum SUIT {
    CLUBS = 1,
    DIAMONDS = 2,
    HEARTS = 3,
    SPADES = 4
}

export type Card = {
    suit: SUIT;
    rank: number;
    value: number;
    mnemonic: string;
};

// Raw API response for getGame - contains JSON string that needs parsing
export type GameOptionsResponse = {
    address?: string;
    game?: string; // JSON string that needs to be parsed
    gameOptions?: GameOptionsDTO;
};

export type GameListItem = {
    id?: string;
    game_id?: string;
    gameId?: string; // Some APIs return camelCase
    address: string;
    gameOptions: GameOptionsDTO;
    current_players?: number;
};

// Block types for Cosmos REST API responses
export type BlockID = {
    hash: string;
    part_set_header?: {
        total: number;
        hash: string;
    };
};

export type BlockHeader = {
    version?: { block: string; app: string };
    chain_id: string;
    height: string;
    time: string;
    last_block_id?: BlockID;
    last_commit_hash?: string;
    data_hash?: string;
    validators_hash?: string;
    next_validators_hash?: string;
    consensus_hash?: string;
    app_hash?: string;
    last_results_hash?: string;
    evidence_hash?: string;
    proposer_address?: string;
};

export type Block = {
    header: BlockHeader;
    data: { txs: string[] };
    evidence?: { evidence?: any[] };
    last_commit?: any;
};

export type BlockResponse = {
    block_id: BlockID;
    block: Block;
    sdk_block?: Block;
};

export type TransactionResponse = {
    nonce: string;
    to: string;
    from: string;
    value: string;
    hash: string;
    signature: string;
    timestamp: string;
    data?: string;
}

// Raw API response for getGameState - contains JSON string that needs parsing
export type GameStateResponse = {
    game_state: string; // JSON string containing the game state
}

export type PerformActionResponse = {
    state: TexasHoldemStateDTO;
    nonce: string;
    to: string;
    from: string;
    value: string;
    hash: string;
    signature: string;
    timestamp: string;
    data?: string;
}
// Constants for URL parameters
export const KEYS = {
    ACTION_TYPE: "action_type",
    INDEX: "index",
    VALUE: "value",
    SEAT: "seat",
    SEED: "seed"
} as const;
