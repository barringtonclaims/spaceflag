# Space Capture the Flag (hotseat + online demo)

A light, in-browser board game for 3–9 players.

- Local hotseat: open `index.html` or run a static server
- Online demo: run the provided Node server (Socket.IO) and share your URL

## Quick start

### Local hotseat

- Open `index.html` directly in a browser, or start a static server:
    - macOS/Linux: `python3 -m http.server` inside the project folder and open `http://localhost:8000`
- Click New Game, choose 3–9 players, names, and colors.
- Take turns rolling and moving. First to the target captures wins.

### Online demo (Socket.IO)

1) Install Node 18+ and pnpm or npm
2) From the project folder, run:

```
pnpm add -D nodemon && pnpm add express socket.io
node server.js
```

Or with npm:

```
npm install express socket.io
node server.js
```

3) Open `http://localhost:3000`. Click Online, enter a username and select a color, then join. Share the same URL with friends.

Hosting notes:
- The first user to join becomes host and can start the game. The host’s client is authoritative and broadcasts game state after each action.
- This is a simple demo; there is no persistence, authentication, or cheating prevention.

## Rules (condensed)

- Goal: Capture enemy flags and bring them back to your base.
- Turn: Roll 1–6; move that many orthogonal steps. You can’t move through asteroids, other players, or into someone else’s base.
- Tagging: Finish on a tile with another player to tag them; they return to their base. If they carried a flag, it drops there.
- Flags: Finish on another player’s flag to pick it up. Finish on your base while carrying to capture.
- Boost pads: If you finish a move on one, immediately gain +2 steps.
- Wormholes: Finish on a wormhole to teleport to its paired exit.
- Win: For 3–5 players capture 1 flag. For 6–9 players capture 2 flags.
