import { describe, expect, it } from "vitest";
import { createLobbyState, gameReducer } from "../app/game/engine";

const addPlayers = (state: ReturnType<typeof createLobbyState>, names: string[]) =>
  names.reduce(
    (current, name, index) =>
      gameReducer(current, {
        type: "ADD_PLAYER",
        name,
        avatarId: `avatar-${index}`,
      }),
    state
  );

const placeRoseForCurrent = (state: ReturnType<typeof createLobbyState>) => {
  const currentId = state.roundState?.currentPlayerId;
  if (!currentId) {
    return state;
  }
  return gameReducer(state, {
    type: "PLACE_CARD",
    playerId: currentId,
    card: "rose",
  });
};

describe("Skull engine turn order", () => {
  it("blocks placement out of turn", () => {
    let state = createLobbyState("ABCD");
    state = addPlayers(state, ["Ada", "Blake", "Cleo"]);
    state = gameReducer(state, { type: "START_GAME" });

    const currentId = state.roundState?.currentPlayerId ?? "";
    const other = state.players.find((player) => player.id !== currentId);
    expect(other).toBeTruthy();
    const beforeHand = other?.hand.length ?? 0;

    const next = gameReducer(state, {
      type: "PLACE_CARD",
      playerId: other?.id ?? "",
      card: "rose",
    });

    const afterOther = next.players.find((player) => player.id === other?.id);
    expect(afterOther?.hand.length).toBe(beforeHand);
    expect(next.roundState?.currentPlayerId).toBe(currentId);
  });

  it("does not allow a player who passed to raise", () => {
    let state = createLobbyState("BEEF");
    state = addPlayers(state, ["Ari", "Bo", "Cai"]);
    state = gameReducer(state, { type: "START_GAME" });

    state = placeRoseForCurrent(state);
    state = placeRoseForCurrent(state);
    state = placeRoseForCurrent(state);

    const bidderId = state.roundState?.currentPlayerId ?? "";
    state = gameReducer(state, {
      type: "START_BID",
      playerId: bidderId,
      amount: 1,
    });

    const passerId = state.roundState?.currentPlayerId ?? "";
    state = gameReducer(state, {
      type: "PASS_BID",
      playerId: passerId,
    });

    const snapshot = state.roundState;
    const attempt = gameReducer(state, {
      type: "RAISE_BID",
      playerId: passerId,
      amount: 2,
    });

    expect(attempt.roundState?.bidding.highestBid).toBe(
      snapshot?.bidding.highestBid
    );
    expect(attempt.roundState?.bidding.passes).toEqual(
      snapshot?.bidding.passes
    );
  });

  it("requires the bidder to reveal their own pile first", () => {
    let state = createLobbyState("BUST");
    state = addPlayers(state, ["Nova", "Oren", "Pax"]);
    state = gameReducer(state, { type: "START_GAME" });

    state = placeRoseForCurrent(state);
    state = placeRoseForCurrent(state);
    state = placeRoseForCurrent(state);

    const bidderId = state.roundState?.currentPlayerId ?? "";
    state = gameReducer(state, {
      type: "START_BID",
      playerId: bidderId,
      amount: 1,
    });

    const firstPasser = state.roundState?.currentPlayerId ?? "";
    state = gameReducer(state, { type: "PASS_BID", playerId: firstPasser });

    const secondPasser = state.roundState?.currentPlayerId ?? "";
    state = gameReducer(state, { type: "PASS_BID", playerId: secondPasser });

    const otherTarget =
      state.players.find((player) => player.id !== bidderId)?.id ?? "";
    const beforeReveals = state.roundState?.reveal.revealedCount ?? 0;

    const invalidReveal = gameReducer(state, {
      type: "REVEAL_CARD",
      playerId: bidderId,
      targetPlayerId: otherTarget,
    });

    expect(invalidReveal.roundState?.reveal.revealedCount).toBe(beforeReveals);

    const validReveal = gameReducer(invalidReveal, {
      type: "REVEAL_CARD",
      playerId: bidderId,
      targetPlayerId: bidderId,
    });

    expect(validReveal.roundState?.reveal.revealedCount).toBe(
      beforeReveals + 1
    );
  });

  it("auto-starts reveal when the bid reaches the maximum", () => {
    let state = createLobbyState("MAXX");
    state = addPlayers(state, ["Lia", "Mona", "Nils"]);
    state = gameReducer(state, { type: "START_GAME" });

    state = placeRoseForCurrent(state);
    state = placeRoseForCurrent(state);
    state = placeRoseForCurrent(state);

    const bidderId = state.roundState?.currentPlayerId ?? "";
    const totalPlaced = state.players.reduce(
      (sum, player) => sum + player.pile.length,
      0
    );

    state = gameReducer(state, {
      type: "START_BID",
      playerId: bidderId,
      amount: totalPlaced,
    });

    expect(state.roundState?.phase).toBe("reveal");
    expect(state.roundState?.reveal.bidderId).toBe(bidderId);
    expect(state.roundState?.reveal.target).toBe(totalPlaced);
  });
});
