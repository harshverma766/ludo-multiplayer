# 🎲 Ludo Online — Multiplayer

A real-time multiplayer Ludo game for 2–4 players using **Node.js + Socket.io**.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
node server.js
```

### 3. Open in browser
```
http://localhost:3000
```

---

## How to Play with Friends

1. **Host**: Open the game, enter your name, click **Create New Room**
2. **Share** the 5-letter room code (e.g. `AB3XZ`) with friends
3. **Friends**: Enter their name + the room code → click **Join Room**
4. **Everyone** picks a color (Red / Blue / Green / Yellow)
5. **Host** clicks **Start Game** (need at least 2 players)
6. Take turns rolling the dice — first to get all 4 pawns home wins!

---

## Rules

- Roll **6** to bring a pawn out of base onto the board
- Rolling **6** gives you a **bonus roll**
- Land on an opponent → they go back to base (⭐ safe squares are protected)
- Get all **4 pawns** into the home column to win

---

## Deploy Online (so anyone can join from anywhere)

### Option A — Railway (free)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Option B — Render
1. Push to GitHub
2. Go to render.com → New Web Service
3. Connect repo, set start command: `node server.js`
4. Deploy — share the public URL

### Option C — Heroku
```bash
heroku create my-ludo-game
git push heroku main
heroku open
```

---

## Project Structure
```
ludo-multiplayer/
├── server.js          ← Node.js + Socket.io backend
├── public/
│   └── index.html     ← Full game frontend
├── package.json
└── README.md
```

---

## Tech Stack
- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla HTML/CSS/JS (no framework needed)
- **Fonts**: Google Fonts (Playfair Display + DM Sans)
