'use strict';

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Room management
const rooms = new Map(); // roomCode -> Room object
const socketToRoom = new Map(); // socketId -> roomCode

class Room {
	constructor(code) {
		this.code = code;
		this.players = new Map(); // socketId -> player data
		this.hostId = null;
		this.gameStarted = false;
		this.gameState = null;
		this.maxPlayers = 9;
		this.createdAt = Date.now();
		this.lastActivity = Date.now();
		this.aiCount = 0;
	}

	addPlayer(socketId, playerData) {
		if (this.players.size >= this.maxPlayers) return false;
		if (!this.hostId && !playerData.isAI) this.hostId = socketId;
		this.players.set(socketId, {
			id: socketId,
			name: playerData.name,
			color: playerData.color,
			ready: playerData.isAI || false,
			connected: true,
			isAI: playerData.isAI || false
		});
		this.lastActivity = Date.now();
		return true;
	}

	removePlayer(socketId) {
		this.players.delete(socketId);
		if (this.hostId === socketId && this.players.size > 0) {
			this.hostId = Array.from(this.players.keys())[0];
		}
		this.lastActivity = Date.now();
	}

	setPlayerReady(socketId, ready) {
		const player = this.players.get(socketId);
		if (player) {
			player.ready = ready;
			this.lastActivity = Date.now();
		}
	}

	canStart() {
		if (this.players.size < 3) return false;
		for (const player of this.players.values()) {
			if (!player.ready && player.id !== this.hostId && !player.isAI) return false;
		}
		return true;
	}

	getPlayersArray() {
		return Array.from(this.players.values());
	}

	updateGameState(state) {
		this.gameState = state;
		this.lastActivity = Date.now();
	}
}

// Generate random room code
function generateRoomCode() {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let code;
	do {
		code = '';
		for (let i = 0; i < 4; i++) {
			code += chars[Math.floor(Math.random() * chars.length)];
		}
	} while (rooms.has(code));
	return code;
}

// Clean up old rooms (> 2 hours inactive)
setInterval(() => {
	const now = Date.now();
	for (const [code, room] of rooms.entries()) {
		if (now - room.lastActivity > 2 * 60 * 60 * 1000) {
			rooms.delete(code);
		}
	}
}, 10 * 60 * 1000); // Check every 10 minutes

io.on('connection', (socket) => {
	console.log(`Socket connected: ${socket.id}`);

	// Create a new room
	socket.on('room:create', ({ name, color }) => {
		const code = generateRoomCode();
		const room = new Room(code);
		room.addPlayer(socket.id, { name, color });
		rooms.set(code, room);
		socketToRoom.set(socket.id, code);
		socket.join(code);
		
		socket.emit('room:created', {
			code,
			isHost: true,
			selfId: socket.id,
			players: room.getPlayersArray()
		});
		console.log(`Room ${code} created by ${name}`);
	});

	// Join existing room
	socket.on('room:join', ({ code, name, color }) => {
		const roomCode = code.toUpperCase();
		const room = rooms.get(roomCode);
		
		if (!room) {
			socket.emit('room:error', { message: 'Room not found' });
			return;
		}
		
		if (room.gameStarted) {
			socket.emit('room:error', { message: 'Game already in progress' });
			return;
		}
		
		if (!room.addPlayer(socket.id, { name, color })) {
			socket.emit('room:error', { message: 'Room is full' });
			return;
		}
		
		socketToRoom.set(socket.id, roomCode);
		socket.join(roomCode);
		
		socket.emit('room:joined', {
			code: roomCode,
			isHost: room.hostId === socket.id,
			selfId: socket.id,
			players: room.getPlayersArray()
		});
		
		// Notify others in room
		socket.to(roomCode).emit('room:playerJoined', {
			player: room.players.get(socket.id)
		});
		console.log(`${name} joined room ${roomCode}`);
	});

	// Toggle ready state
	socket.on('player:ready', ({ ready }) => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room) return;
		
		room.setPlayerReady(socket.id, ready);
		io.to(roomCode).emit('room:playerUpdate', {
			players: room.getPlayersArray(),
			canStart: room.canStart()
		});
	});

	// Host kicks a player
	socket.on('player:kick', ({ playerId }) => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || room.hostId !== socket.id) return;
		
		const targetSocket = io.sockets.sockets.get(playerId);
		if (targetSocket) {
			targetSocket.emit('room:kicked');
			targetSocket.leave(roomCode);
		}
		
		room.removePlayer(playerId);
		socketToRoom.delete(playerId);
		
		io.to(roomCode).emit('room:playerLeft', {
			playerId,
			players: room.getPlayersArray(),
			newHostId: room.hostId
		});
	});

	// Start game (host only)
	socket.on('game:start', () => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || room.hostId !== socket.id) return;
		
		if (!room.canStart()) {
			socket.emit('room:error', { message: 'Not all players are ready' });
			return;
		}
		
		room.gameStarted = true;
		const players = room.getPlayersArray().map((p, idx) => ({
			id: idx + 1,
			name: p.name,
			color: p.color,
			socketId: p.id
		}));
		
		io.to(roomCode).emit('game:started', { players });
		console.log(`Game started in room ${roomCode}`);
	});

	// Game state sync (host broadcasts)
	socket.on('game:state', ({ state }) => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || room.hostId !== socket.id) return;
		
		room.updateGameState(state);
		socket.to(roomCode).emit('game:state', { state });
	});

	// Forward player actions to host
	socket.on('action:roll', () => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || !room.hostId) return;
		
		io.to(room.hostId).emit('action:roll', { fromId: socket.id });
	});

	socket.on('action:move', ({ x, y }) => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || !room.hostId) return;
		
		io.to(room.hostId).emit('action:move', { fromId: socket.id, x, y });
	});

	socket.on('action:end', () => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || !room.hostId) return;
		
		io.to(room.hostId).emit('action:end', { fromId: socket.id });
	});

	// Return to lobby
	socket.on('game:returnToLobby', () => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || room.hostId !== socket.id) return;
		
		room.gameStarted = false;
		room.gameState = null;
		// Reset all players to not ready
		for (const player of room.players.values()) {
			player.ready = false;
		}
		
		io.to(roomCode).emit('game:returnedToLobby', {
			players: room.getPlayersArray()
		});
	});

	// Add AI player
	socket.on('ai:add', () => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || room.hostId !== socket.id) return;
		
		if (room.players.size >= room.maxPlayers) {
			socket.emit('room:error', { message: 'Room is full' });
			return;
		}
		
		if (room.gameStarted) {
			socket.emit('room:error', { message: 'Cannot add AI during game' });
			return;
		}
		
		room.aiCount++;
		const aiId = `AI_${roomCode}_${room.aiCount}`;
		const aiNames = ['HAL', 'GLaDOS', 'JARVIS', 'Cortana', 'EDI', 'TARS', 'Friday', 'Vision', 'Ultron'];
		const aiColors = ['#ff5757', '#3aa3ff', '#49d46c', '#b67eff', '#ff9f40', '#ffd644', '#28e0e0', '#ff7ab6', '#18c09a'];
		
		// Pick unused name and color
		const usedNames = Array.from(room.players.values()).map(p => p.name);
		const usedColors = Array.from(room.players.values()).map(p => p.color);
		const availableNames = aiNames.filter(n => !usedNames.includes(n));
		const availableColors = aiColors.filter(c => !usedColors.includes(c));
		
		const aiPlayer = {
			name: availableNames[0] || `AI ${room.aiCount}`,
			color: availableColors[0] || '#808080',
			isAI: true
		};
		
		room.addPlayer(aiId, aiPlayer);
		
		io.to(roomCode).emit('room:playerUpdate', {
			players: room.getPlayersArray(),
			canStart: room.canStart()
		});
		
		console.log(`AI player ${aiPlayer.name} added to room ${roomCode}`);
	});
	
	// Remove AI player
	socket.on('ai:remove', ({ aiId }) => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || room.hostId !== socket.id) return;
		
		if (room.players.has(aiId)) {
			room.removePlayer(aiId);
			io.to(roomCode).emit('room:playerUpdate', {
				players: room.getPlayersArray(),
				canStart: room.canStart()
			});
		}
	});
	
	// AI makes a move (host calculates and sends)
	socket.on('ai:move', ({ aiId, action, data }) => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room || room.hostId !== socket.id) return;
		
		// Broadcast AI action to all players
		if (action === 'roll') {
			io.to(roomCode).emit('action:roll', { fromId: aiId });
		} else if (action === 'move') {
			io.to(roomCode).emit('action:move', { fromId: aiId, x: data.x, y: data.y });
		} else if (action === 'end') {
			io.to(roomCode).emit('action:end', { fromId: aiId });
		}
	});
	
	// Handle disconnection
	socket.on('disconnect', () => {
		const roomCode = socketToRoom.get(socket.id);
		if (!roomCode) return;
		
		const room = rooms.get(roomCode);
		if (!room) return;
		
		// Mark as disconnected but don't remove immediately (allow reconnection)
		const player = room.players.get(socket.id);
		if (player) {
			player.connected = false;
		}
		
		// If room is empty or only has disconnected players, clean it up
		let hasConnected = false;
		for (const p of room.players.values()) {
			if (p.connected) {
				hasConnected = true;
				break;
			}
		}
		
		if (!hasConnected) {
			rooms.delete(roomCode);
			console.log(`Room ${roomCode} deleted (all players disconnected)`);
		} else {
			io.to(roomCode).emit('room:playerDisconnected', {
				playerId: socket.id,
				players: room.getPlayersArray()
			});
		}
		
		socketToRoom.delete(socket.id);
		console.log(`Socket disconnected: ${socket.id}`);
	});
});

server.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
	console.log(`Players can join from any device on the same network`);
});