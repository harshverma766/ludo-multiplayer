const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  transports: ['polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ── Game constants ──────────────────────────────────────────────────────────
const COLORS = ['red', 'blue', 'green', 'yellow'];

function buildPath() {
  const p = [];
  for (let r = 14; r >= 9; r--) p.push([6, r]);
  for (let c = 5; c >= 0; c--) p.push([c, 8]);
  for (let r = 7; r >= 6; r--) p.push([0, r]);
  for (let c = 1; c <= 5; c++) p.push([c, 6]);
  for (let r = 5; r >= 0; r--) p.push([6, r]);
  for (let c = 7; c <= 8; c++) p.push([c, 0]);
  for (let r = 1; r <= 5; r++) p.push([8, r]);
  for (let c = 9; c <= 14; c++) p.push([c, 6]);
  for (let r = 7; r <= 8; r++) p.push([14, r]);
  for (let c = 13; c >= 9; c--) p.push([c, 8]);
  for (let r = 9; r <= 14; r++) p.push([8, r]);
  return p;
}

const PATH = buildPath();
const START_IDX = { red: 0, blue: 13, green: 26, yellow: 39 };
const HOME_COLS = {
  red:    [[6,13],[6,12],[6,11],[6,10],[6,9]],
  blue:   [[1,6],[2,6],[3,6],[4,6],[5,6]],
  green:  [[8,1],[8,2],[8,3],[8,4],[8,5]],
  yellow: [[13,8],[12,8],[11,8],[10,8],[9,8]],
};
const SAFE_SET = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// ── Rooms ───────────────────────────────────────────────────────────────────
const rooms = {};

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function initGameState(players) {
  const pawns = {};
  players.forEach(p => {
    pawns[p.color] = [
      { id: 0, pos: -1 }, { id: 1, pos: -1 },
      { id: 2, pos: -1 }, { id: 3, pos: -1 },
    ];
  });
  return { players, pawns, currentIdx: 0, phase: 'roll', dice: null, winner: null, log: [] };
}

function getMovablePawns(gs, color, dice) {
  return gs.pawns[color].filter(p => {
    if (p.pos === -1 && dice === 6) return true;
    if (p.pos === -1) return false;
    if (p.pos >= 57) return false;
    if (p.pos + dice > 56) return false;
    return true;
  });
}

function applyMove(gs, color, pawnId, dice) {
  const pawn = gs.pawns[color].find(p => p.id === pawnId);
  if (!pawn) return { captured: false };
  if (pawn.pos === -1 && dice === 6) { pawn.pos = 0; }
  else { pawn.pos += dice; }
  let captured = false;
  if (pawn.pos < 52) {
    const absIdx = (START_IDX[color] + pawn.pos) % 52;
    if (!SAFE_SET.has(absIdx)) {
      Object.entries(gs.pawns).forEach(([opColor, opPawns]) => {
        if (opColor === color) return;
        opPawns.forEach(op => {
          if (op.pos < 0 || op.pos >= 52) return;
          const opAbs = (START_IDX[opColor] + op.pos) % 52;
          if (opAbs === absIdx) { op.pos = -1; captured = true; }
        });
      });
    }
  }
  return { captured };
}

function checkWinner(gs) {
  for (const [color, pawns] of Object.entries(gs.pawns)) {
    if (pawns.every(p => p.pos >= 57)) return color;
  }
  return null;
}

function addLog(gs, msg) {
  gs.log.unshift({ text: msg, ts: Date.now() });
  if (gs.log.length > 20) gs.log.pop();
}

function advanceTurn(gs) {
  gs.currentIdx = (gs.currentIdx + 1) % gs.players.length;
  addLog(gs, `${gs.players[gs.currentIdx].name}'s turn.`);
}

function finishMove(gs, current, dice) {
  const winner = checkWinner(gs);
  if (winner) {
    gs.winner = winner;
    const winPlayer = gs.players.find(p => p.color === winner);
    addLog(gs, `🏆 ${winPlayer?.name} wins!`);
    gs.phase = 'roll';
    return;
  }
  if (dice === 6) {
    gs.phase = 'roll'; gs.dice = null;
    addLog(gs, `${current.name} rolled 6 — bonus turn!`);
  } else {
    gs.phase = 'roll'; gs.dice = null;
    advanceTurn(gs);
  }
}

function sanitize(room) { return JSON.parse(JSON.stringify(room)); }

// ── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('connected:', socket.id);

  socket.on('create_room', ({ name }, cb) => {
    let code;
    do { code = makeRoomCode(); } while (rooms[code]);
    rooms[code] = {
      code, host: socket.id,
      players: [{ id: socket.id, name, color: null, ready: false }],
      state: null, started: false,
    };
    socket.join(code);
    socket.data.room = code;
    socket.data.name = name;
    cb({ ok: true, code });
    io.to(code).emit('room_update', sanitize(rooms[code]));
  });

  socket.on('join_room', ({ code, name }, cb) => {
    const room = rooms[code];
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.started) return cb({ ok: false, error: 'Game already started' });
    if (room.players.length >= 4) return cb({ ok: false, error: 'Room is full' });
    if (room.players.find(p => p.id === socket.id)) return cb({ ok: false, error: 'Already in room' });
    room.players.push({ id: socket.id, name, color: null, ready: false });
    socket.join(code);
    socket.data.room = code;
    socket.data.name = name;
    cb({ ok: true, code });
    io.to(code).emit('room_update', sanitize(room));
  });

  socket.on('pick_color', ({ color }) => {
    const room = rooms[socket.data.room];
    if (!room || room.started) return;
    const taken = room.players.some(p => p.id !== socket.id && p.color === color);
    if (taken) return socket.emit('error_msg', 'Color already taken');
    const me = room.players.find(p => p.id === socket.id);
    if (me) { me.color = color; me.ready = !!color; }
    io.to(room.code).emit('room_update', sanitize(room));
  });

  socket.on('start_game', () => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 2) return socket.emit('error_msg', 'Need at least 2 players');
    const unready = room.players.filter(p => !p.ready || !p.color);
    if (unready.length) return socket.emit('error_msg', 'All players must pick a color');
    room.started = true;
    room.state = initGameState(room.players.map(p => ({ id: p.id, name: p.name, color: p.color })));
    const current = room.state.players[0];
    addLog(room.state, `Game started! ${current.name}'s turn.`);
    io.to(room.code).emit('game_start', sanitize(room));
  });

  socket.on('roll_dice', () => {
    const room = rooms[socket.data.room];
    if (!room || !room.started) return;
    const gs = room.state;
    if (gs.winner) return;
    const current = gs.players[gs.currentIdx];
    if (current.id !== socket.id) return socket.emit('error_msg', 'Not your turn');
    if (gs.phase !== 'roll') return;
    const dice = Math.floor(Math.random() * 6) + 1;
    gs.dice = dice;
    const movable = getMovablePawns(gs, current.color, dice);
    addLog(gs, `${current.name} rolled ${dice}.`);
    if (movable.length === 0) {
      addLog(gs, `${current.name} has no moves.`);
      gs.phase = 'roll'; gs.dice = null;
      if (dice !== 6) advanceTurn(gs);
      io.to(room.code).emit('state_update', sanitize(room));
    } else {
      gs.phase = 'move';
      if (movable.length === 1) {
        const { captured } = applyMove(gs, current.color, movable[0].id, dice);
        if (captured) addLog(gs, `${current.name} captured a pawn!`);
        finishMove(gs, current, dice);
        io.to(room.code).emit('state_update', sanitize(room));
      } else {
        io.to(room.code).emit('state_update', sanitize(room));
      }
    }
  });

  socket.on('move_pawn', ({ pawnId }) => {
    const room = rooms[socket.data.room];
    if (!room || !room.started) return;
    const gs = room.state;
    if (gs.winner) return;
    const current = gs.players[gs.currentIdx];
    if (current.id !== socket.id) return;
    if (gs.phase !== 'move') return;
    const { captured } = applyMove(gs, current.color, pawnId, gs.dice);
    if (captured) addLog(gs, `${current.name} captured a pawn!`);
    finishMove(gs, current, gs.dice);
    io.to(room.code).emit('state_update', sanitize(room));
  });

  socket.on('disconnect', () => {
    const code = socket.data.room;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) { delete rooms[code]; return; }
    if (room.host === socket.id) room.host = room.players[0].id;
    if (room.started && room.state) {
      room.state.players = room.state.players.filter(p => p.id !== socket.id);
      addLog(room.state, `A player disconnected.`);
      if (room.state.players.length < 2) room.state.winner = room.state.players[0]?.color || 'none';
    }
    io.to(code).emit('room_update', sanitize(room));
    if (room.started) io.to(code).emit('state_update', sanitize(room));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ludo server running on http://localhost:${PORT}`));