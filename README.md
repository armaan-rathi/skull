# Skull & Roses - Online Table

A cinematic web version of the bluffing game Skull (also known as Skulls and Roses). This app supports 3 to 8 players and includes the full bidding and reveal rules, round scoring, and elimination.

## Features
- Lobby with room code and player management
- Full round flow: placement, bidding, reveal, resolution
- Score to 2 points to win, or last player standing
- Animated table UI, card flips, and themed styling
- Hotseat mode for local play with friends on one device

## Tech
- Next.js (App Router) + TypeScript
- Tailwind CSS

## Getting Started

### 1) Install dependencies
```bash
npm install
```

### 2) Run the dev server
```bash
npm run dev
```

Open the app at `http://localhost:3000`.

### 3) Lint
```bash
npm run lint
```

### 4) Production build
```bash
npm run build
npm run start
```

## How to Play (In This App)
1. Add 3 to 8 players in the lobby.
2. Start the game and pick who you are controlling using the "Control As" selector.
3. On your turn, place a card or start the bidding.
4. The highest bidder reveals cards until they reach their bid or flip a skull.
5. Win two successful bids to win the game.

## Skull Rules (Classic)

### Objective
Be the first player to win two successful bids, or be the last remaining player after others are eliminated.

### Setup
- Each player starts with 4 cards: 3 roses and 1 skull.
- Everyone has a personal face-down pile in front of them.

### Round Flow
1. **Placement phase**
   - Starting with the lead player and moving clockwise, each player places one card face down on their pile.
   - Players may continue placing additional cards on future turns, or instead choose to start bidding.

2. **Bidding phase**
   - The player who starts bidding sets a number of cards they believe they can reveal without hitting a skull.
   - Other players either raise the bid or pass.
   - When all but one player have passed, the highest bidder must reveal.

3. **Reveal phase**
   - The bidder flips cards one by one.
   - They must flip all cards from their own pile first, then may choose which piles to reveal from.
   - If they reveal a skull, the bid fails immediately.
   - If they reveal enough cards to meet the bid without a skull, the bid succeeds.

4. **Resolution**
   - **Successful bid:** the bidder gains 1 point.
   - **Failed bid:** the bidder loses one random card from their hand.
   - A player with no cards is eliminated.

### Winning
- The first player to reach 2 points wins.
- If only one player remains, they also win.

## Notes
- This version is currently hotseat (local) play. Multiplayer networking is the next step.
- Room codes are displayed, but online sync is not enabled yet.

## Deploy to Vercel
1. Push this repo to GitHub.
2. Create a new project in Vercel and import the repo.
3. Use the defaults (Next.js). Build command should be `npm run build`.
4. Deploy.

If you want real-time multiplayer later, we can add a free backend (Supabase or Firebase) and connect it to this UI.
