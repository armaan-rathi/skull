export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

const PLAYER_COLORS = [
  "#b63a48",
  "#d8b26e",
  "#4c9f9a",
  "#7fa6d3",
  "#7a9b59",
  "#e08b5b",
  "#c97b84",
  "#8f6b4f",
];

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type CardType = "rose" | "skull";

export type Player = {
  id: string;
  name: string;
  color: string;
  avatarId: string;
  score: number;
  hand: CardType[];
  pile: CardType[];
  revealed: CardType[];
  eliminated: boolean;
};

export type RoundPhase = "place" | "bid" | "reveal" | "roundEnd";

export type RoundResult = {
  bidderId: string;
  outcome: "success" | "fail";
  message: string;
};

export type RoundState = {
  phase: RoundPhase;
  leadPlayerId: string;
  currentPlayerId: string;
  bidding: {
    active: boolean;
    highestBid: number;
    highestBidderId: string | null;
    passes: string[];
  };
  reveal: {
    bidderId: string | null;
    target: number;
    revealedCount: number;
    reveals: { playerId: string; card: CardType }[];
    hitSkull: boolean;
  };
  result: RoundResult | null;
};

export type GamePhase = "lobby" | "play" | "gameEnd";

export type GameState = {
  roomId: string;
  phase: GamePhase;
  round: number;
  players: Player[];
  roundState: RoundState | null;
  activePlayerId: string | null;
  winnerId: string | null;
  log: string[];
};

export type Action =
  | { type: "INIT_ROOM"; roomId: string }
  | { type: "ADD_PLAYER"; name: string; avatarId: string }
  | { type: "REMOVE_PLAYER"; id: string }
  | { type: "SET_ACTIVE_PLAYER"; id: string }
  | { type: "START_GAME" }
  | { type: "PLACE_CARD"; playerId: string; card: CardType }
  | { type: "START_BID"; playerId: string; amount: number }
  | { type: "RAISE_BID"; playerId: string; amount: number }
  | { type: "PASS_BID"; playerId: string }
  | { type: "REVEAL_CARD"; playerId: string; targetPlayerId: string }
  | { type: "NEXT_ROUND" }
  | { type: "RESET_GAME" };

const createId = () => Math.random().toString(36).slice(2, 10);

const createRoomCode = () =>
  Array.from({ length: 4 })
    .map(() => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)])
    .join("");

export const normalizeRoomCode = (code: string) =>
  code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const createFreshHand = (): CardType[] =>
  shuffle(["rose", "rose", "rose", "skull"]);

const addLog = (log: string[], entry: string) => {
  const next = [...log, entry];
  return next.slice(-9);
};

const getPlayerIndex = (players: Player[], id: string) =>
  players.findIndex((player) => player.id === id);

const getNextActivePlayerId = (players: Player[], currentId: string) => {
  if (players.length === 0) {
    return currentId;
  }
  let startIndex = getPlayerIndex(players, currentId);
  if (startIndex < 0) {
    startIndex = 0;
  }
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (startIndex + offset) % players.length;
    if (!players[index].eliminated) {
      return players[index].id;
    }
  }
  return players[startIndex]?.id ?? currentId;
};

const getNextBidPlayerId = (
  players: Player[],
  currentId: string,
  passes: string[]
) => {
  if (players.length === 0) {
    return currentId;
  }
  const passed = new Set(passes);
  let startIndex = getPlayerIndex(players, currentId);
  if (startIndex < 0) {
    startIndex = 0;
  }
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (startIndex + offset) % players.length;
    const candidate = players[index];
    if (candidate && !candidate.eliminated && !passed.has(candidate.id)) {
      return candidate.id;
    }
  }
  return currentId;
};

const getActivePlayers = (players: Player[]) =>
  players.filter((player) => !player.eliminated);

const getTotalPlacedCards = (players: Player[]) =>
  players.reduce((total, player) => total + player.pile.length, 0);

const collectRoundCards = (players: Player[]) =>
  players.map((player) => ({
    ...player,
    hand: [...player.hand, ...player.pile, ...player.revealed],
    pile: [],
    revealed: [],
  }));

const applyEliminations = (players: Player[]) =>
  players.map((player) => ({
    ...player,
    eliminated: player.eliminated || player.hand.length === 0,
  }));

const createRoundState = (
  players: Player[],
  leadPlayerId: string
): RoundState => ({
  phase: "place",
  leadPlayerId,
  currentPlayerId: leadPlayerId,
  bidding: {
    active: false,
    highestBid: 0,
    highestBidderId: null,
    passes: [],
  },
  reveal: {
    bidderId: null,
    target: 0,
    revealedCount: 0,
    reveals: [],
    hitSkull: false,
  },
  result: null,
});

const resetPlayersForNewGame = (players: Player[]) =>
  players.map((player) => ({
    ...player,
    score: 0,
    hand: createFreshHand(),
    pile: [],
    revealed: [],
    eliminated: false,
  }));

export const createLobbyState = (roomId?: string): GameState => ({
  roomId: roomId ?? createRoomCode(),
  phase: "lobby",
  round: 0,
  players: [],
  roundState: null,
  activePlayerId: null,
  winnerId: null,
  log: ["Room opened. Add players to begin."],
});

export const gameReducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case "INIT_ROOM": {
      const normalized = normalizeRoomCode(action.roomId);
      return createLobbyState(normalized || undefined);
    }
    case "ADD_PLAYER": {
      if (state.phase !== "lobby") {
        return state;
      }
      if (state.players.length >= MAX_PLAYERS) {
        return state;
      }
      const name = action.name.trim();
      if (!name) {
        return state;
      }
      const player: Player = {
        id: createId(),
        name,
        color: PLAYER_COLORS[state.players.length % PLAYER_COLORS.length],
        avatarId: action.avatarId,
        score: 0,
        hand: [],
        pile: [],
        revealed: [],
        eliminated: false,
      };
      return {
        ...state,
        players: [...state.players, player],
        activePlayerId: state.activePlayerId ?? player.id,
        log: addLog(state.log, `${name} joined the room.`),
      };
    }
    case "REMOVE_PLAYER": {
      if (state.phase !== "lobby") {
        return state;
      }
      const players = state.players.filter((player) => player.id !== action.id);
      return {
        ...state,
        players,
        activePlayerId: players[0]?.id ?? null,
        log: addLog(state.log, "Player removed."),
      };
    }
    case "SET_ACTIVE_PLAYER": {
      return {
        ...state,
        activePlayerId: action.id,
      };
    }
    case "START_GAME": {
      if (state.players.length < MIN_PLAYERS) {
        return state;
      }
      const players = resetPlayersForNewGame(state.players);
      const leadPlayerId = players[Math.floor(Math.random() * players.length)].id;
      const leadName =
        players.find((player) => player.id === leadPlayerId)?.name ?? "Lead";
      return {
        ...state,
        phase: "play",
        round: 1,
        players,
        roundState: createRoundState(players, leadPlayerId),
        activePlayerId: leadPlayerId,
        winnerId: null,
        log: addLog(
          state.log,
          `Hands dealt. ${leadName} leads Round 1.`
        ),
      };
    }
    case "PLACE_CARD": {
      if (state.phase !== "play" || !state.roundState) {
        return state;
      }
      if (state.roundState.phase !== "place") {
        return state;
      }
      if (action.playerId !== state.roundState.currentPlayerId) {
        return state;
      }
      const players = state.players.map((player) => {
        if (player.id !== action.playerId) {
          return player;
        }
        const cardIndex = player.hand.findIndex((card) => card === action.card);
        if (cardIndex === -1) {
          return player;
        }
        const nextHand = [...player.hand];
        const [card] = nextHand.splice(cardIndex, 1);
        return {
          ...player,
          hand: nextHand,
          pile: [...player.pile, card],
        };
      });
      const currentPlayerName =
        state.players.find((player) => player.id === action.playerId)?.name ??
        "Player";
      const nextPlayerId = getNextActivePlayerId(
        players,
        state.roundState.currentPlayerId
      );
      return {
        ...state,
        players,
        roundState: {
          ...state.roundState,
          currentPlayerId: nextPlayerId,
        },
        activePlayerId: nextPlayerId,
        log: addLog(state.log, `${currentPlayerName} placed a card.`),
      };
    }
    case "START_BID": {
      if (state.phase !== "play" || !state.roundState) {
        return state;
      }
      if (state.roundState.phase !== "place") {
        return state;
      }
      if (action.playerId !== state.roundState.currentPlayerId) {
        return state;
      }
      const totalCards = getTotalPlacedCards(state.players);
      if (totalCards === 0) {
        return state;
      }
      if (action.amount < 1 || action.amount > totalCards) {
        return state;
      }
      const bidder = state.players.find(
        (player) => player.id === action.playerId
      );
      if (!bidder || bidder.pile.length === 0) {
        return state;
      }
      if (action.amount >= totalCards) {
        return {
          ...state,
          roundState: {
            ...state.roundState,
            phase: "reveal",
            currentPlayerId: action.playerId,
            bidding: {
              active: true,
              highestBid: action.amount,
              highestBidderId: action.playerId,
              passes: [],
            },
            reveal: {
              bidderId: action.playerId,
              target: action.amount,
              revealedCount: 0,
              reveals: [],
              hitSkull: false,
            },
          },
          activePlayerId: action.playerId,
          log: addLog(
            state.log,
            `${bidder.name} bids the maximum ${action.amount} and must reveal now.`
          ),
        };
      }
      const nextPlayerId = getNextBidPlayerId(
        state.players,
        state.roundState.currentPlayerId,
        []
      );
      return {
        ...state,
        roundState: {
          ...state.roundState,
          phase: "bid",
          currentPlayerId: nextPlayerId,
          bidding: {
            active: true,
            highestBid: action.amount,
            highestBidderId: action.playerId,
            passes: [],
          },
        },
        activePlayerId: nextPlayerId,
        log: addLog(
          state.log,
          `${bidder.name} opens the bidding at ${action.amount}.`
        ),
      };
    }
    case "RAISE_BID": {
      if (state.phase !== "play" || !state.roundState) {
        return state;
      }
      if (state.roundState.phase !== "bid") {
        return state;
      }
      if (action.playerId !== state.roundState.currentPlayerId) {
        return state;
      }
      const totalCards = getTotalPlacedCards(state.players);
      if (
        action.amount <= state.roundState.bidding.highestBid ||
        action.amount > totalCards
      ) {
        return state;
      }
      const bidder = state.players.find(
        (player) => player.id === action.playerId
      );
      if (!bidder || bidder.pile.length === 0) {
        return state;
      }
      if (state.roundState.bidding.passes.includes(action.playerId)) {
        return state;
      }
      if (action.amount >= totalCards) {
        return {
          ...state,
          roundState: {
            ...state.roundState,
            phase: "reveal",
            currentPlayerId: action.playerId,
            bidding: {
              ...state.roundState.bidding,
              highestBid: action.amount,
              highestBidderId: action.playerId,
            },
            reveal: {
              bidderId: action.playerId,
              target: action.amount,
              revealedCount: 0,
              reveals: [],
              hitSkull: false,
            },
          },
          activePlayerId: action.playerId,
          log: addLog(
            state.log,
            `${bidder.name} hits the max bid at ${action.amount} and reveals now.`
          ),
        };
      }
      const nextBidderId = getNextBidPlayerId(
        state.players,
        state.roundState.currentPlayerId,
        state.roundState.bidding.passes
      );
      return {
        ...state,
        roundState: {
          ...state.roundState,
          currentPlayerId: nextBidderId,
          bidding: {
            ...state.roundState.bidding,
            highestBid: action.amount,
            highestBidderId: action.playerId,
            passes: state.roundState.bidding.passes,
          },
        },
        activePlayerId: nextBidderId,
        log: addLog(state.log, `${bidder.name} raises to ${action.amount}.`),
      };
    }
    case "PASS_BID": {
      if (state.phase !== "play" || !state.roundState) {
        return state;
      }
      if (state.roundState.phase !== "bid") {
        return state;
      }
      if (action.playerId !== state.roundState.currentPlayerId) {
        return state;
      }
      const player = state.players.find(
        (entry) => entry.id === action.playerId
      );
      if (!player) {
        return state;
      }
      if (state.roundState.bidding.passes.includes(action.playerId)) {
        return state;
      }
      const passes = Array.from(
        new Set([...state.roundState.bidding.passes, action.playerId])
      );
      const activePlayers = getActivePlayers(state.players);
      const allPassed = passes.length >= activePlayers.length - 1;
      if (allPassed) {
        const bidderId = state.roundState.bidding.highestBidderId;
        if (!bidderId) {
          return state;
        }
        return {
          ...state,
          roundState: {
            ...state.roundState,
            phase: "reveal",
            currentPlayerId: bidderId,
            reveal: {
              bidderId,
              target: state.roundState.bidding.highestBid,
              revealedCount: 0,
              reveals: [],
              hitSkull: false,
            },
          },
          activePlayerId: bidderId,
          log: addLog(
            state.log,
            `All others pass. ${getPlayerName(
              state.players,
              bidderId
            )} begins revealing.`
          ),
        };
      }
      const nextPlayerId = getNextBidPlayerId(
        state.players,
        state.roundState.currentPlayerId,
        passes
      );
      return {
        ...state,
        roundState: {
          ...state.roundState,
          currentPlayerId: nextPlayerId,
          bidding: {
            ...state.roundState.bidding,
            passes,
          },
        },
        activePlayerId: nextPlayerId,
        log: addLog(state.log, `${player.name} passes and is out of bidding.`),
      };
    }
    case "REVEAL_CARD": {
      if (state.phase !== "play" || !state.roundState) {
        return state;
      }
      if (state.roundState.phase !== "reveal") {
        return state;
      }
      if (action.playerId !== state.roundState.reveal.bidderId) {
        return state;
      }
      const bidder = state.players.find(
        (player) => player.id === action.playerId
      );
      if (!bidder) {
        return state;
      }
      if (bidder.pile.length > 0 && action.targetPlayerId !== bidder.id) {
        return state;
      }
      const targetIndex = getPlayerIndex(state.players, action.targetPlayerId);
      if (targetIndex < 0) {
        return state;
      }
      const targetPlayer = state.players[targetIndex];
      if (targetPlayer.pile.length === 0) {
        return state;
      }
      const revealedCard = targetPlayer.pile[targetPlayer.pile.length - 1];
      const players = state.players.map((player) => {
        if (player.id !== action.targetPlayerId) {
          return player;
        }
        return {
          ...player,
          pile: player.pile.slice(0, -1),
          revealed: [...player.revealed, revealedCard],
        };
      });
      const revealState = {
        ...state.roundState.reveal,
        revealedCount: state.roundState.reveal.revealedCount + 1,
        reveals: [
          ...state.roundState.reveal.reveals,
          { playerId: action.targetPlayerId, card: revealedCard },
        ],
      };
      const bidderIndex = getPlayerIndex(players, action.playerId);
      if (bidderIndex < 0) {
        return state;
      }
      let nextPlayers = players;
      let result: RoundResult | null = null;
      let nextPhase: RoundPhase = "reveal";
      let winnerId: string | null = null;
      let phase: GamePhase = state.phase;

      if (revealedCard === "skull") {
        const lossTarget = pickPenaltyTarget(players[bidderIndex]);
        nextPlayers = players.map((player, index) => {
          if (index !== bidderIndex) {
            return player;
          }
          return {
            ...player,
            hand:
              lossTarget.source === "hand"
                ? lossTarget.cards
                : player.hand,
            pile:
              lossTarget.source === "pile"
                ? lossTarget.cards
                : player.pile,
            revealed:
              lossTarget.source === "revealed"
                ? lossTarget.cards
                : player.revealed,
          };
        });
        const bidderName = nextPlayers[bidderIndex].name;
        const targetName = getPlayerName(players, action.targetPlayerId);
        result = {
          bidderId: action.playerId,
          outcome: "fail",
          message: `Busted! ${bidderName} hit ${targetName}'s skull and loses a random card.`,
        };
        nextPhase = "roundEnd";
      } else if (revealState.revealedCount >= revealState.target) {
        nextPlayers = players.map((player) => {
          if (player.id !== action.playerId) {
            return player;
          }
          return {
            ...player,
            score: player.score + 1,
          };
        });
        const bidderName =
          nextPlayers.find((player) => player.id === action.playerId)?.name ??
          "Bidder";
        result = {
          bidderId: action.playerId,
          outcome: "success",
          message: `Clean reveal! ${bidderName} clears ${revealState.target} cards and wins a point.`,
        };
        const updatedBidder = nextPlayers.find(
          (player) => player.id === action.playerId
        );
        if (updatedBidder && updatedBidder.score >= 2) {
          winnerId = updatedBidder.id;
          phase = "gameEnd";
        }
        nextPhase = "roundEnd";
      }

      const targetName = getPlayerName(state.players, action.targetPlayerId);
      const bidderName = getPlayerName(state.players, action.playerId);
      const logEntry =
        revealedCard === "skull"
          ? `BUSTED: ${bidderName} hit ${targetName}'s skull.`
          : `${bidderName} reveals a rose from ${targetName}.`;

      return {
        ...state,
        phase,
        players: nextPlayers,
        winnerId,
        roundState: {
          ...state.roundState,
          phase: nextPhase,
          reveal: revealState,
          result,
        },
        log: addLog(state.log, logEntry),
      };
    }
    case "NEXT_ROUND": {
      if (state.phase !== "play" || !state.roundState) {
        return state;
      }
      if (state.roundState.phase !== "roundEnd") {
        return state;
      }
      let players = collectRoundCards(state.players);
      players = applyEliminations(players);
      const activePlayers = getActivePlayers(players);
      if (activePlayers.length <= 1) {
        const winnerId = activePlayers[0]?.id ?? null;
        return {
          ...state,
          phase: "gameEnd",
          players,
          winnerId,
          roundState: state.roundState,
          log: addLog(state.log, "Final cards fall. The table is quiet."),
        };
      }
      const fallbackLead = activePlayers[0].id;
      const leadPlayerId =
        state.roundState.result?.bidderId &&
        !players.find((player) => player.id === state.roundState.result?.bidderId)
          ?.eliminated
          ? state.roundState.result.bidderId
          : fallbackLead;
      const leadName =
        players.find((player) => player.id === leadPlayerId)?.name ?? "Lead";
      return {
        ...state,
        round: state.round + 1,
        players,
        roundState: createRoundState(players, leadPlayerId),
        activePlayerId: leadPlayerId,
        log: addLog(
          state.log,
          `Round ${state.round + 1} begins. ${leadName} leads.`
        ),
      };
    }
    case "RESET_GAME": {
      const players = state.players.map((player) => ({
        ...player,
        score: 0,
        hand: [],
        pile: [],
        revealed: [],
        eliminated: false,
      }));
      return {
        ...state,
        phase: "lobby",
        round: 0,
        players,
        roundState: null,
        winnerId: null,
        roomId: createRoomCode(),
        activePlayerId: players[0]?.id ?? null,
        log: addLog(state.log, "Back to the lobby."),
      };
    }
    default:
      return state;
  }
};

const getPlayerName = (players: Player[], id: string) =>
  players.find((player) => player.id === id)?.name ?? "Player";

const pickPenaltyTarget = (player: Player) => {
  if (player.hand.length > 0) {
    const index = Math.floor(Math.random() * player.hand.length);
    const next = [...player.hand];
    next.splice(index, 1);
    return { source: "hand" as const, cards: next };
  }
  if (player.pile.length > 0) {
    const index = Math.floor(Math.random() * player.pile.length);
    const next = [...player.pile];
    next.splice(index, 1);
    return { source: "pile" as const, cards: next };
  }
  if (player.revealed.length > 0) {
    const index = Math.floor(Math.random() * player.revealed.length);
    const next = [...player.revealed];
    next.splice(index, 1);
    return { source: "revealed" as const, cards: next };
  }
  return { source: "hand" as const, cards: player.hand };
};

export const getGameSummary = (state: GameState) => {
  if (!state.roundState) {
    return "Lobby open.";
  }
  if (state.phase === "gameEnd") {
    const winner =
      state.players.find((player) => player.id === state.winnerId)?.name ??
      "Winner";
    return `Game over. ${winner} claims the table.`;
  }
  const currentName = getPlayerName(
    state.players,
    state.roundState.currentPlayerId
  );
  switch (state.roundState.phase) {
    case "place":
      return `${currentName} is placing a card or starting the bid.`;
    case "bid":
      return `${currentName} is choosing to raise or pass.`;
    case "reveal":
      return `${getPlayerName(
        state.players,
        state.roundState.reveal.bidderId ?? ""
      )} is revealing cards.`;
    case "roundEnd":
      return state.roundState.result?.message ?? "Round resolved.";
    default:
      return "";
  }
};

export const getMaxBid = (players: Player[]) => getTotalPlacedCards(players);

export const getMinBid = (roundState: RoundState | null) =>
  roundState?.bidding.active ? roundState.bidding.highestBid + 1 : 1;

export const hasCard = (player: Player, card: CardType) =>
  player.hand.includes(card);

export const canBid = (player: Player) => player.pile.length > 0;

export const isPlayersTurn = (roundState: RoundState | null, id: string) =>
  roundState?.currentPlayerId === id;

export const getActivePlayerOptions = (players: Player[]) =>
  players.filter((player) => !player.eliminated);
