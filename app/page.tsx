"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  canBid,
  createLobbyState,
  gameReducer,
  getActivePlayerOptions,
  getGameSummary,
  getMaxBid,
  getMinBid,
  hasCard,
  isPlayersTurn,
  normalizeRoomCode,
} from "./game/engine";
import type { Action, CardType, GameState, Player, RoundState } from "./game/engine";
import { AVATARS, DEFAULT_AVATAR_ID, getAvatarById } from "./game/avatars";
import { FlipCard, RoseIcon, ScorePip, SkullIcon } from "./game/ui";
import { getSupabaseClient } from "./lib/supabaseClient";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

type SyncStatus = "offline" | "connecting" | "online" | "error";

type RoomRow = {
  room_code: string;
  state: GameState;
  version: number;
  updated_at: string;
};

export default function Home() {
  const [state, setState] = useState<GameState>(() => createLobbyState());
  const [roomVersion, setRoomVersion] = useState(0);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("offline");
  const [roomError, setRoomError] = useState<string | null>(null);
  const [presenceIds, setPresenceIds] = useState<string[]>([]);
  const [view, setView] = useState<"entry" | "lobby">("entry");
  const [playerName, setPlayerName] = useState("");
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [bidAmount, setBidAmount] = useState(1);

  const supabase = useMemo(() => getSupabaseClient(), []);
  const onlineEnabled = Boolean(supabase);

  const [clientId] = useState(() => {
    if (typeof window === "undefined") {
      return `local-${Math.random().toString(36).slice(2, 10)}`;
    }
    const stored = window.localStorage.getItem("skull-client-id");
    if (stored) {
      return stored;
    }
    const generated =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);
    window.localStorage.setItem("skull-client-id", generated);
    return generated;
  });

  const stateRef = useRef(state);
  const versionRef = useRef(roomVersion);
  const roomCodeRef = useRef(roomCode);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    versionRef.current = roomVersion;
  }, [roomVersion]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  useEffect(() => {
    if (!supabase || !roomCode) {
      return;
    }
    const channel = supabase
      .channel(`room:${roomCode}`, {
        config: { presence: { key: clientId } },
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const next = payload.new as RoomRow;
          if (!next?.version || next.version <= versionRef.current) {
            return;
          }
          setState(next.state);
          setRoomVersion(next.version);
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPresenceIds(Object.keys(state));
      })
      .on("presence", { event: "join" }, () => {
        const state = channel.presenceState();
        setPresenceIds(Object.keys(state));
      })
      .on("presence", { event: "leave" }, () => {
        const state = channel.presenceState();
        setPresenceIds(Object.keys(state));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSyncStatus("online");
          void channel.track({ playerId: clientId });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, roomCode, clientId]);

  const syncRoomState = async (action: Action, nextState: GameState) => {
    if (!supabase || !roomCodeRef.current) {
      return;
    }
    const tryUpdate = async (state: GameState, version: number) =>
      supabase
        .from("rooms")
        .update({
          state,
          version: version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("room_code", roomCodeRef.current)
        .eq("version", version)
        .select("version")
        .single();

    const currentVersion = versionRef.current;
    const { data, error } = await tryUpdate(nextState, currentVersion);

    if (!error && data) {
      setRoomVersion(currentVersion + 1);
      setSyncStatus("online");
      setRoomError(null);
      return;
    }

    const { data: latest, error: latestError } = await supabase
      .from("rooms")
      .select("state, version")
      .eq("room_code", roomCodeRef.current)
      .single();
    if (latestError || !latest) {
      setSyncStatus("error");
      setRoomError("Sync failed. Check your connection.");
      return;
    }

    const latestState = latest.state as GameState;
    const recomputed = gameReducer(latestState, action);
    if (recomputed !== latestState) {
      const { data: retryData, error: retryError } = await tryUpdate(
        recomputed,
        latest.version
      );
      if (!retryError && retryData) {
        setState(recomputed);
        setRoomVersion(latest.version + 1);
        setSyncStatus("online");
        setRoomError(null);
        return;
      }
    }

    setState(latestState);
    setRoomVersion(latest.version);
    setSyncStatus("error");
    setRoomError("Sync conflict. Please try again.");
  };

  const dispatchAction = (action: Action) => {
    setRoomError(null);
    if (!supabase || !roomCodeRef.current) {
      setState((prev) => gameReducer(prev, action));
      return;
    }
    const current = stateRef.current;
    const nextState = gameReducer(current, action);
    if (nextState === current) {
      return;
    }
    setState(nextState);
    void syncRoomState(action, nextState);
  };

  const roundState = state.roundState;
  const localPlayerId =
    onlineEnabled && roomCode ? clientId : state.activePlayerId;
  const activePlayer = state.players.find(
    (player) => player.id === localPlayerId
  );
  const currentPlayer = state.players.find(
    (player) => player.id === roundState?.currentPlayerId
  );

  const totalPlaced = useMemo(
    () => getMaxBid(state.players),
    [state.players]
  );
  const minBid = useMemo(() => getMinBid(roundState), [roundState]);
  const maxBid = Math.max(minBid, totalPlaced);

  const canAct =
    !!activePlayer && isPlayersTurn(roundState, activePlayer.id ?? "");
  const canRaise = canAct && minBid <= totalPlaced;
  const canPlace = state.phase === "play" && roundState?.phase === "place" && canAct;

  const phaseLabel = useMemo(() => {
    if (!roundState) return "Lobby";
    if (state.phase === "gameEnd") return "Finale";
    return roundState.phase === "place"
      ? "Placement"
      : roundState.phase === "bid"
      ? "Bidding"
      : roundState.phase === "reveal"
      ? "Reveal"
      : "Resolution";
  }, [roundState, state.phase]);

  const bidLeader = roundState?.bidding.highestBidderId
    ? state.players.find(
        (player) => player.id === roundState.bidding.highestBidderId
      )
    : null;

  const revealBidder = roundState?.reveal.bidderId
    ? state.players.find((player) => player.id === roundState.reveal.bidderId)
    : null;

  const statusMessage = useMemo(() => {
    if (!roundState) {
      return "Lobby open.";
    }
    if (state.phase === "gameEnd") {
      return getGameSummary(state);
    }
    if (roundState.phase === "place") {
      return `${currentPlayer?.name ?? "Player"} is placing a card or starting the bid.`;
    }
    if (roundState.phase === "bid") {
      return `Bidding is live. Highest bid ${roundState.bidding.highestBid} by ${
        bidLeader?.name ?? "unknown"
      }. Waiting on ${currentPlayer?.name ?? "player"}.`;
    }
    if (roundState.phase === "reveal") {
      return `${revealBidder?.name ?? "Bidder"} is revealing ${
        roundState.reveal.revealedCount
      }/${roundState.reveal.target}. Reveal your own pile first.`;
    }
    return roundState.result?.message ?? "Round resolved.";
  }, [
    bidLeader?.name,
    currentPlayer?.name,
    revealBidder?.name,
    roundState,
    state,
  ]);

  const syncLabel = !onlineEnabled
    ? "Local only"
    : !roomCode
    ? "Online ready"
    : syncStatus === "online"
    ? "Online sync live"
    : syncStatus === "connecting"
    ? "Connecting..."
    : syncStatus === "error"
    ? "Sync error"
    : "Offline";

  const syncTone =
    syncStatus === "online"
      ? "text-[var(--success)]"
      : syncStatus === "error"
      ? "text-[var(--danger)]"
      : "text-[var(--muted)]";

  const onlinePlayerIds = useMemo(
    () => new Set(presenceIds),
    [presenceIds]
  );

  const trimmedName = playerName.trim();
  const normalizedRoom = normalizeRoomCode(roomCodeInput);
  const canSubmitName = trimmedName.length > 0;
  const canJoinRoom = canSubmitName && normalizedRoom.length === 4;

  const handleCreateRoom = async () => {
    if (!canSubmitName) {
      return;
    }
    setRoomError(null);
    if (!supabase) {
      const localRoom = createLobbyState();
      const nextState = gameReducer(localRoom, {
        type: "ADD_PLAYER",
        name: trimmedName,
        avatarId,
        id: clientId,
      });
      setState(nextState);
      setRoomCode(null);
      setRoomVersion(0);
      setView("lobby");
      setPlayerName("");
      setRoomCodeInput("");
      return;
    }

    setSyncStatus("connecting");
    let createdRoom: GameState | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = createLobbyState();
      const { error } = await supabase.from("rooms").insert({
        room_code: candidate.roomId,
        state: candidate,
        version: 1,
      });
      if (!error) {
        createdRoom = candidate;
        break;
      }
    }

    if (!createdRoom) {
      setRoomError("Could not create a room. Try again.");
      setSyncStatus("error");
      return;
    }

    setRoomCode(createdRoom.roomId);
    setRoomVersion(1);
    setState(createdRoom);
    setView("lobby");
    setSyncStatus("online");

    const withPlayer = gameReducer(createdRoom, {
      type: "ADD_PLAYER",
      name: trimmedName,
      avatarId,
      id: clientId,
    });
    if (withPlayer !== createdRoom) {
      const { error } = await supabase
        .from("rooms")
        .update({
          state: withPlayer,
          version: 2,
          updated_at: new Date().toISOString(),
        })
        .eq("room_code", createdRoom.roomId)
        .eq("version", 1);
      if (!error) {
        setState(withPlayer);
        setRoomVersion(2);
      }
    }
    setPlayerName("");
    setRoomCodeInput("");
  };

  const handleJoinRoom = async () => {
    if (!canJoinRoom) {
      return;
    }
    setRoomError(null);
    if (!supabase) {
      const localRoom = createLobbyState(normalizedRoom);
      const nextState = gameReducer(localRoom, {
        type: "ADD_PLAYER",
        name: trimmedName,
        avatarId,
        id: clientId,
      });
      setState(nextState);
      setRoomCode(null);
      setRoomVersion(0);
      setView("lobby");
      setPlayerName("");
      return;
    }

    setSyncStatus("connecting");
    const { data, error } = await supabase
      .from("rooms")
      .select("state, version")
      .eq("room_code", normalizedRoom)
      .single();

    if (error || !data) {
      setRoomError("Room not found. Check the code and try again.");
      setSyncStatus("error");
      return;
    }

    const roomState = data.state as GameState;
    if (roomState.phase !== "lobby") {
      setState(roomState);
      setRoomCode(normalizedRoom);
      setRoomVersion(data.version);
      setView("lobby");
      setSyncStatus("online");
      if (roomState.players.some((player) => player.id === clientId)) {
        setPlayerName("");
        setRoomError(null);
        return;
      }
      setRoomError("That game already started. You can spectate for now.");
      return;
    }

    setState(roomState);
    setRoomCode(normalizedRoom);
    setRoomVersion(data.version);
    setView("lobby");
    setSyncStatus("online");

    if (roomState.players.some((player) => player.id === clientId)) {
      setPlayerName("");
      return;
    }

    const withPlayer = gameReducer(roomState, {
      type: "ADD_PLAYER",
      name: trimmedName,
      avatarId,
      id: clientId,
    });
    if (withPlayer !== roomState) {
      const { error: updateError } = await supabase
        .from("rooms")
        .update({
          state: withPlayer,
          version: data.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("room_code", normalizedRoom)
        .eq("version", data.version);
      if (!updateError) {
        setState(withPlayer);
        setRoomVersion(data.version + 1);
      }
    }
    setPlayerName("");
  };

  const handleAddPlayer = () => {
    if (!canSubmitName) {
      return;
    }
    dispatchAction({
      type: "ADD_PLAYER",
      name: trimmedName,
      avatarId,
    });
    setPlayerName("");
  };

  const handleLeaveGame = () => {
    if (supabase && roomCodeRef.current) {
      const current = stateRef.current;
      if (current.phase === "lobby") {
        const nextState = gameReducer(current, {
          type: "REMOVE_PLAYER",
          id: clientId,
        });
        if (nextState !== current) {
          void syncRoomState(
            { type: "REMOVE_PLAYER", id: clientId },
            nextState
          );
          setState(nextState);
        }
      }
    }
    setRoomCode(null);
    setRoomVersion(0);
    setSyncStatus("offline");
    setPresenceIds([]);
    setState(createLobbyState());
    setView("entry");
    setPlayerName("");
    setRoomCodeInput("");
    setRoomError(null);
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-6 py-10 lg:px-12">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(216,178,110,0.35),transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 translate-y-1/3 rounded-full bg-[radial-gradient(circle,rgba(182,58,72,0.25),transparent_70%)] blur-3xl" />

      <header className="relative z-10 mb-10 flex flex-col gap-4 text-center lg:text-left">
        <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent-2)]">
          Bluff - Bid - Reveal
        </p>
        <h1 className="font-display text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">
          Skull & Roses
        </h1>
        <p className="max-w-2xl text-sm text-[var(--muted)] sm:text-base">
          A cinematic table for the classic Skull (Skulls and Roses). Gather up
          to eight players, place your cards, and try to reveal without hitting
          a skull.
        </p>
      </header>

      {state.phase === "lobby" && view === "entry" && (
        <section className="relative z-10 grid gap-6">
          <div className="panel animate-float rounded-3xl p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--muted)]">
                  Choose Identity
                </p>
                <p className="font-display text-2xl text-[var(--ink)]">
                  Pick a name and avatar
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-[var(--muted)]">
                Room codes are 4 characters ·{" "}
                <span className={syncTone}>{syncLabel}</span>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="Your name"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <AvatarPicker value={avatarId} onChange={setAvatarId} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="panel animate-float rounded-3xl p-8">
              <h2 className="font-display text-2xl text-[var(--ink)]">
                Create Room
              </h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Generate a fresh room code and become the host.
              </p>
              <button
                onClick={handleCreateRoom}
                disabled={!canSubmitName}
                className="mt-6 rounded-full bg-[var(--accent-2)] px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-black/30 transition hover:scale-[1.01] disabled:opacity-50"
              >
                Create Room
              </button>
            </div>

            <div className="panel animate-float rounded-3xl p-8">
              <h2 className="font-display text-2xl text-[var(--ink)]">
                Join Room
              </h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Enter a 4-character code to join a table.
              </p>
              <input
                value={roomCodeInput}
                onChange={(event) =>
                  setRoomCodeInput(normalizeRoomCode(event.target.value))
                }
                placeholder="ABCD"
                maxLength={4}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm uppercase tracking-[0.3em] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <button
                onClick={handleJoinRoom}
                disabled={!canJoinRoom}
                className="mt-4 rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                Join Room
              </button>
              {roomError && (
                <p className="mt-3 text-xs text-[var(--danger)]">
                  {roomError}
                </p>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-[var(--muted)]">
            {onlineEnabled
              ? "Realtime multiplayer is enabled."
              : "Add Supabase keys to enable realtime multiplayer."}
          </p>
        </section>
      )}

      {state.phase === "lobby" && view === "lobby" && (
        <section className="relative z-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel animate-float rounded-3xl p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--muted)]">
                  Room Code
                </p>
                <p className="font-display text-3xl text-[var(--accent-2)]">
                  {state.roomId}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-[var(--muted)]">
                  <span className={syncTone}>{syncLabel}</span>
                </div>
                <button
                  onClick={handleLeaveGame}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white"
                >
                  Leave Game
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-3">
              <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Add Player
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="Name"
                  className="flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <button
                  onClick={handleAddPlayer}
                  disabled={
                    !canSubmitName || state.players.length >= MAX_PLAYERS
                  }
                  className="rounded-2xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/30 transition hover:scale-[1.01] disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <AvatarPicker value={avatarId} onChange={setAvatarId} compact />
              <p className="text-xs text-[var(--muted)]">
                Minimum {MIN_PLAYERS} players, maximum {MAX_PLAYERS}.
              </p>
            </div>

            <div className="mt-8 grid gap-3">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Players
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {state.players.map((player) => (
                  <div
                    key={player.id}
                    className="panel-soft flex items-center justify-between rounded-2xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarBadge
                        avatarId={player.avatarId}
                        ringColor={player.color}
                        size="sm"
                      />
                      <span className="text-sm font-semibold">
                        {player.name}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        dispatchAction({ type: "REMOVE_PLAYER", id: player.id })
                      }
                      className="text-xs uppercase tracking-[0.2em] text-[var(--muted)] hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={() => dispatchAction({ type: "START_GAME" })}
                disabled={state.players.length < MIN_PLAYERS}
                className="rounded-full bg-[var(--accent-2)] px-8 py-3 text-sm font-semibold text-black shadow-lg shadow-black/30 transition hover:scale-[1.01] disabled:opacity-50"
              >
                Start Game
              </button>
              <span className="text-xs text-[var(--muted)]">
                Ready when you are. The table shuffles fresh hands.
              </span>
            </div>
          </div>

          <div className="panel animate-float rounded-3xl p-8">
            <h2 className="font-display text-2xl text-[var(--ink)]">
              How a Round Plays
            </h2>
            <div className="mt-6 grid gap-4 text-sm text-[var(--muted)]">
              <div className="flex items-start gap-3">
                <RoseIcon className="h-6 w-6 text-[var(--accent-2)]" />
                <p>
                  Everyone places a card face down. On your turn, place another
                  or start the bidding.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <SkullIcon className="h-6 w-6 text-[var(--accent)]" />
                <p>
                  Bidders raise the number of cards they can reveal. The highest
                  bid must reveal without hitting a skull.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full border border-white/20" />
                <p>
                  Succeed twice to win. Reveal a skull and you lose a random card.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {state.phase !== "lobby" && (
        <section className="relative z-10 flex flex-col gap-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:grid-rows-[minmax(0,1fr)_auto]">
            <main className="panel animate-float flex flex-col rounded-3xl p-6 xl:col-start-1 xl:row-start-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Round {state.round}
                  </p>
                  <p className="font-display text-2xl text-[var(--ink)]">
                    {phaseLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--muted)]">
                    {getGameSummary(state)}
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--muted)]">
                    Total down: {totalPlaced}
                  </span>
                  <span
                    className={`rounded-full border border-white/10 px-3 py-1 text-xs ${syncTone}`}
                  >
                    {syncLabel}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--muted)]">
                <span className="font-semibold text-white">Status:</span>{" "}
                {statusMessage}
              </div>
              {roomError && (
                <div className="mt-3 rounded-2xl border border-[var(--danger)]/40 bg-black/40 px-4 py-2 text-xs text-[var(--danger)]">
                  {roomError}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1">
                  Turn:{" "}
                  <span className="font-semibold text-white">
                    {currentPlayer?.name ?? "Waiting"}
                  </span>
                </span>
                {activePlayer && (
                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1">
                    You:{" "}
                    <span className="font-semibold text-white">
                      {activePlayer.name}
                    </span>{" "}
                    · {canAct ? "Your move" : "Waiting"}
                  </span>
                )}
              </div>

              {state.phase === "gameEnd" && (
                <div className="mt-4 rounded-2xl border border-[var(--accent-2)]/30 bg-black/30 p-4 text-sm text-[var(--muted)]">
                  <p className="font-display text-lg text-[var(--accent-2)]">
                    {state.winnerId
                      ? `${state.players.find((p) => p.id === state.winnerId)?.name ?? "Winner"} wins the table.`
                      : "Last player standing."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => dispatchAction({ type: "START_GAME" })}
                      className="rounded-full bg-[var(--accent-2)] px-5 py-2 text-xs font-semibold text-black"
                    >
                      Restart
                    </button>
                    <button
                      onClick={() => dispatchAction({ type: "RESET_GAME" })}
                      className="rounded-full border border-white/10 px-5 py-2 text-xs font-semibold text-white/80"
                    >
                      Back to Lobby
                    </button>
                    <button
                      onClick={handleLeaveGame}
                      className="rounded-full border border-white/10 px-5 py-2 text-xs font-semibold text-white/80"
                    >
                      Leave Game
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-1 items-center justify-center">
                <RoundTable
                  players={state.players}
                  roundState={roundState}
                  activePlayerId={activePlayer?.id ?? null}
                  canPlace={canPlace}
                  canReveal={
                    roundState?.phase === "reveal" &&
                    roundState.reveal.bidderId === activePlayer?.id
                  }
                  onReveal={(targetPlayerId) =>
                    dispatchAction({
                      type: "REVEAL_CARD",
                      playerId: roundState?.reveal.bidderId ?? "",
                      targetPlayerId,
                    })
                  }
                  onDropCard={(card) => {
                    if (!activePlayer || !canPlace) {
                      return;
                    }
                    dispatchAction({
                      type: "PLACE_CARD",
                      playerId: activePlayer.id,
                      card,
                    });
                  }}
                />
              </div>
            </main>

            {activePlayer && state.phase === "play" && (
              <div className="panel animate-float rounded-3xl px-6 py-4 xl:col-start-1 xl:row-start-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                      Your Hand
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Drag a card to your pile or click to play it.
                    </p>
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {activePlayer.hand.length} cards
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                  {activePlayer.hand.map((card, index) => (
                    <HandCard
                      key={`${card}-${index}`}
                      card={card}
                      index={index}
                      total={activePlayer.hand.length}
                      disabled={!canAct || roundState?.phase !== "place"}
                      onPlay={() =>
                        dispatchAction({
                          type: "PLACE_CARD",
                          playerId: activePlayer.id,
                          card,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <aside className="panel animate-float flex flex-col gap-4 rounded-3xl p-6 xl:col-start-2 xl:row-start-1 xl:row-span-2">
              {state.phase === "play" && roundState && (
                <div className="space-y-4">
                  {roundState.phase === "place" && activePlayer && (
                    <ActionCard title="Placement">
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          disabled={!canAct || !hasCard(activePlayer, "rose")}
                          onClick={() =>
                            dispatchAction({
                              type: "PLACE_CARD",
                              playerId: activePlayer.id,
                              card: "rose",
                            })
                          }
                        >
                          Place Rose
                        </ActionButton>
                        <ActionButton
                          disabled={!canAct || !hasCard(activePlayer, "skull")}
                          onClick={() =>
                            dispatchAction({
                              type: "PLACE_CARD",
                              playerId: activePlayer.id,
                              card: "skull",
                            })
                          }
                        >
                          Place Skull
                        </ActionButton>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                          Start Bid
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min={1}
                            max={Math.max(1, totalPlaced)}
                            value={bidAmount}
                            onChange={(event) =>
                              setBidAmount(Number(event.target.value))
                            }
                            className="w-20 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                          />
                          <ActionButton
                            disabled={!canAct || !canBid(activePlayer)}
                            onClick={() =>
                              dispatchAction({
                                type: "START_BID",
                                playerId: activePlayer.id,
                                amount: clamp(
                                  bidAmount,
                                  1,
                                  totalPlaced > 0 ? totalPlaced : 1
                                ),
                              })
                            }
                          >
                            Bid {bidAmount}
                          </ActionButton>
                        </div>
                      </div>
                    </ActionCard>
                  )}

                  {roundState.phase === "bid" && activePlayer && (
                    <ActionCard title="Bidding">
                      <p className="text-xs text-[var(--muted)]">
                        Highest bid:{" "}
                        <span className="font-semibold text-white">
                          {roundState.bidding.highestBid}
                        </span>{" "}
                        {bidLeader ? `by ${bidLeader.name}` : ""}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={minBid}
                          max={maxBid}
                          value={bidAmount}
                          onChange={(event) =>
                            setBidAmount(Number(event.target.value))
                          }
                          className="w-20 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                        <ActionButton
                          disabled={!canRaise}
                          onClick={() =>
                            dispatchAction({
                              type: "RAISE_BID",
                              playerId: activePlayer.id,
                              amount: clamp(bidAmount, minBid, maxBid),
                            })
                          }
                        >
                          Raise
                        </ActionButton>
                        <ActionButton
                          disabled={!canAct}
                          onClick={() =>
                            dispatchAction({
                              type: "PASS_BID",
                              playerId: activePlayer.id,
                            })
                          }
                        >
                          Pass
                        </ActionButton>
                      </div>
                    </ActionCard>
                  )}

                  {roundState.phase === "reveal" && (
                    <ActionCard title="Reveal">
                      <p className="text-sm text-[var(--muted)]">
                        {revealBidder
                          ? `${revealBidder.name} must reveal ${roundState.reveal.target} cards.`
                          : "Reveal in progress."}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Revealed so far: {roundState.reveal.revealedCount}
                      </p>
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {activePlayer?.id === roundState.reveal.bidderId
                          ? "Click your own pile first, then choose other piles to flip."
                          : "Waiting for the bidder to reveal."}
                      </p>
                    </ActionCard>
                  )}

                  {roundState.phase === "roundEnd" && (
                    <ActionCard title="Round Result">
                      <p className="text-sm text-[var(--muted)]">
                        {roundState.result?.message ??
                          "The round has resolved."}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <ActionButton
                          onClick={() => dispatchAction({ type: "NEXT_ROUND" })}
                        >
                          Next Round
                        </ActionButton>
                        <ActionButton
                          onClick={() => dispatchAction({ type: "RESET_GAME" })}
                        >
                          Back to Lobby
                        </ActionButton>
                      </div>
                    </ActionCard>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Players
                  </p>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                    Online {state.players.filter((player) => onlinePlayerIds.has(player.id)).length}/{state.players.length}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {state.players.map((player) => (
                    <div
                      key={player.id}
                      className="panel-soft rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AvatarBadge
                            avatarId={player.avatarId}
                            ringColor={player.color}
                            size="sm"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-white">
                                {player.name}
                              </p>
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  onlinePlayerIds.has(player.id)
                                    ? "bg-[var(--success)]"
                                    : "bg-white/20"
                                }`}
                                title={
                                  onlinePlayerIds.has(player.id)
                                    ? "Online"
                                    : "Offline"
                                }
                              />
                            </div>
                            <p className="text-xs text-[var(--muted)]">
                              {player.eliminated
                                ? "Eliminated"
                                : `${player.hand.length} cards in hand`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <ScorePip filled={player.score >= 1} />
                          <ScorePip filled={player.score >= 2} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {!onlineEnabled && (
                <div>
                  <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Control As
                  </label>
                  <select
                    value={state.activePlayerId ?? ""}
                    onChange={(event) =>
                      dispatchAction({
                        type: "SET_ACTIVE_PLAYER",
                        id: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"
                  >
                    {getActivePlayerOptions(state.players).map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <details className="panel-soft rounded-2xl px-4 py-3">
                <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Table Log
                </summary>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto text-xs text-[var(--muted)]">
                  {state.log
                    .slice()
                    .reverse()
                    .map((entry, index) => (
                      <p key={`${entry}-${index}`}>{entry}</p>
                    ))}
                </div>
              </details>

              <button
                onClick={handleLeaveGame}
                className="mt-auto w-full rounded-2xl border border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/70 hover:text-white"
              >
                Leave Game
              </button>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}

function ActionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="panel-soft rounded-2xl px-4 py-4">
      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
        {title}
      </p>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/20 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function AvatarBadge({
  avatarId,
  size = "md",
  ringColor,
}: {
  avatarId: string;
  size?: "xs" | "sm" | "md";
  ringColor?: string;
}) {
  const avatar = getAvatarById(avatarId);
  const sizeClass =
    size === "xs"
      ? "h-7 w-7 text-[10px]"
      : size === "sm"
      ? "h-9 w-9 text-xs"
      : "h-11 w-11 text-sm";
  return (
    <div
      className={`flex items-center justify-center rounded-full border border-white/10 text-base ${sizeClass}`}
      style={{
        backgroundColor: avatar.bg,
        color: avatar.fg,
        boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : undefined,
      }}
      title={avatar.label}
    >
      {avatar.emoji}
    </div>
  );
}

function AvatarPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 ${
        compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4"
      }`}
    >
      {AVATARS.map((avatar) => {
        const isSelected = avatar.id === value;
        return (
          <button
            key={avatar.id}
            onClick={() => onChange(avatar.id)}
            className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-3 text-left transition ${
              isSelected
                ? "border-[var(--accent-2)]/60 bg-white/10"
                : "border-white/10 bg-black/20 hover:bg-white/10"
            }`}
            type="button"
          >
            <AvatarBadge avatarId={avatar.id} />
            {!compact && (
              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                {avatar.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function RoundTable({
  players,
  roundState,
  activePlayerId,
  canPlace,
  canReveal,
  onReveal,
  onDropCard,
}: {
  players: Player[];
  roundState: RoundState | null;
  activePlayerId: string | null;
  canPlace: boolean;
  canReveal: boolean;
  onReveal: (targetPlayerId: string) => void;
  onDropCard: (card: CardType) => void;
}) {
  const orderedPlayers = useMemo(() => {
    if (!activePlayerId) {
      return players;
    }
    const activeIndex = players.findIndex(
      (player) => player.id === activePlayerId
    );
    if (activeIndex === -1) {
      return players;
    }
    return [
      players[activeIndex],
      ...players.slice(activeIndex + 1),
      ...players.slice(0, activeIndex),
    ];
  }, [players, activePlayerId]);

  const radius = Math.min(
    220,
    130 + Math.max(0, orderedPlayers.length - 4) * 18
  );
  const positions = useMemo(
    () =>
      orderedPlayers.map((_, index) => {
        const angle =
          (Math.PI * 2 * index) / orderedPlayers.length + Math.PI / 2;
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        };
      }),
    [orderedPlayers, radius]
  );
  const bidderId = roundState?.reveal.bidderId ?? null;
  const bidderHasPile =
    bidderId !== null
      ? players.find((player) => player.id === bidderId)?.pile.length ?? 0
      : 0;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[360px] sm:max-w-[440px] lg:max-w-[520px]">
      <div className="absolute inset-0 scale-95 origin-center sm:scale-100">
        <div className="relative h-full w-full">
          <div className="absolute inset-[18%] rounded-full border border-white/10 bg-black/25 shadow-[inset_0_0_80px_rgba(0,0,0,0.6)]" />
          <div className="absolute inset-[26%] rounded-full border border-white/5 bg-black/30" />

          {orderedPlayers.map((player, index) => {
            const position = positions[index];
            const isCurrent = player.id === roundState?.currentPlayerId;
            const isBidLeader =
              roundState?.phase === "bid" &&
              roundState.bidding.highestBidderId === player.id;
            const isRevealer =
              roundState?.phase === "reveal" &&
              roundState.reveal.bidderId === player.id;
            const dropEnabled =
              roundState?.phase === "place" &&
              canPlace &&
              activePlayerId === player.id;
            const revealEnabled =
              canReveal && (!bidderHasPile || player.id === bidderId);

            return (
              <PlayerSeat
                key={player.id}
                player={player}
                position={position}
                highlight={isCurrent}
                bidAmount={
                  isBidLeader ? roundState?.bidding.highestBid ?? 0 : null
                }
                isRevealer={isRevealer}
                canReveal={revealEnabled}
                onReveal={onReveal}
                dropEnabled={dropEnabled}
                onDropCard={onDropCard}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlayerSeat({
  player,
  position,
  highlight,
  bidAmount,
  isRevealer,
  canReveal,
  onReveal,
  dropEnabled,
  onDropCard,
}: {
  player: Player;
  position: { x: number; y: number };
  highlight?: boolean;
  bidAmount: number | null;
  isRevealer?: boolean;
  canReveal: boolean;
  onReveal: (targetPlayerId: string) => void;
  dropEnabled: boolean;
  onDropCard: (card: CardType) => void;
}) {
  return (
    <div
      className="absolute w-32 -translate-x-1/2 -translate-y-1/2 sm:w-36 lg:w-40"
      style={{
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)`,
      }}
    >
      <div
        className={`flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black/35 px-3 py-3 text-center ${
          highlight ? "glow-ring" : ""
        }`}
      >
        {(bidAmount || isRevealer) && (
          <div className="flex flex-col items-center gap-1">
            {bidAmount ? (
              <span className="rounded-full bg-[var(--accent-2)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-black">
                Bid {bidAmount}
              </span>
            ) : null}
            {isRevealer ? (
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80">
                Revealing
              </span>
            ) : null}
          </div>
        )}

        <AvatarBadge avatarId={player.avatarId} ringColor={player.color} />
        <p className="text-xs font-semibold text-white">{player.name}</p>

        <button
          type="button"
          onClick={() => {
            if (canReveal) {
              onReveal(player.id);
            }
          }}
          onDragOver={(event) => {
            if (dropEnabled) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            if (!dropEnabled) {
              return;
            }
            event.preventDefault();
            const payload = event.dataTransfer.getData("text/plain");
            if (payload === "rose" || payload === "skull") {
              onDropCard(payload);
            }
          }}
          disabled={!canReveal && !dropEnabled}
          className={`group relative flex flex-col items-center gap-2 ${
            dropEnabled || canReveal ? "cursor-pointer" : "cursor-default"
          }`}
        >
          <div className="stack scale-75">
            {player.pile.length === 0 ? (
              <span className="stack-card stack-card-empty" />
            ) : (
              Array.from({ length: Math.min(player.pile.length, 4) }).map(
                (_, index) => <span key={index} className="stack-card" />
              )
            )}
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            {player.pile.length} down
          </span>
          {dropEnabled ? (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent-2)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-black opacity-0 transition group-hover:opacity-100">
              Drop card
            </span>
          ) : null}
          {!dropEnabled && canReveal && player.pile.length > 0 ? (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent-2)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-black opacity-0 transition group-hover:opacity-100">
              Reveal
            </span>
          ) : null}
        </button>

        <div className="flex flex-wrap justify-center gap-2">
          {player.revealed.length === 0 ? (
            <span className="text-[10px] text-[var(--muted)]">No reveals</span>
          ) : (
            player.revealed.map((card, index) => (
              <FlipCard
                key={`${player.id}-${card}-${index}`}
                card={card}
                revealed
                className="scale-75"
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function HandCard({
  card,
  index,
  total,
  disabled,
  onPlay,
}: {
  card: CardType;
  index: number;
  total: number;
  disabled?: boolean;
  onPlay: () => void;
}) {
  const center = (total - 1) / 2;
  const rotation = (index - center) * 6;
  const lift = Math.abs(index - center) * 2;
  return (
    <button
      type="button"
      disabled={disabled}
      draggable={!disabled}
      onDragStart={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/plain", card);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => {
        if (!disabled) {
          onPlay();
        }
      }}
      className="group relative shrink-0 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 transition-shadow hover:shadow-lg disabled:opacity-50"
      style={{
        transform: `rotate(${rotation}deg) translateY(${lift * -1}px)`,
      }}
    >
      <FlipCard card={card} revealed className="scale-90" />
    </button>
  );
}
