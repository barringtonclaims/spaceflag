/* Space Capture the Flag - Online Multiplayer
	Enhanced with AI opponents, mobile support, and move animations
*/

(function(){
	'use strict';

	// ---------- Utility ----------
	const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
	const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
	const choice = arr => arr[Math.floor(Math.random() * arr.length)];
	const key = (x, y) => `${x},${y}`;
	const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

	// ---------- DOM ----------
	const $ = sel => document.querySelector(sel);
	const $$ = sel => document.querySelectorAll(sel);
	
	// Game elements
	const boardEl = $('#board');
	const turnInfoEl = $('#turnInfo');
	const rollBtn = $('#btnRoll');
	const endBtn = $('#btnEnd');
	const rollResultEl = $('#rollResult');
	const scoreboardEl = $('#scoreboard');
	const rulesModal = $('#rulesModal');
	const rulesBody = $('#rulesBody');
	const btnHow = $('#btnHow');
	const btnCloseRules = $('#btnCloseRules');
	const btnLeave = $('#btnLeave');
	const roomDisplay = $('#roomDisplay');
	
	// Lobby elements
	const lobbyModal = $('#lobbyModal');
	const lobbyChoice = $('#lobbyChoice');
	const roomLobby = $('#roomLobby');
	const joinForm = $('#joinForm');
	const createForm = $('#createForm');
	const joinCode = $('#joinCode');
	const joinName = $('#joinName');
	const joinColor = $('#joinColor');
	const createName = $('#createName');
	const createColor = $('#createColor');
	const roomCodeEl = $('#roomCode');
	const playersList = $('#playersList');
	const btnAddAI = $('#btnAddAI');
	const btnReady = $('#btnReady');
	const btnStart = $('#btnStart');
	const btnLeaveRoom = $('#btnLeaveRoom');
	const lobbyStatus = $('#lobbyStatus');
	const errorMessage = $('#errorMessage');

	// ---------- Canvas ----------
	const ctx = boardEl.getContext('2d');
	let deviceScale = window.devicePixelRatio || 1;
	let moveAnimations = []; // Store active move animations

	function resizeCanvas() {
		const container = boardEl.parentElement;
		const cssWidth = (container && container.clientWidth) ? container.clientWidth : (boardEl.clientWidth || 1200);
		const cssHeight = (container && container.clientHeight) ? container.clientHeight : (boardEl.clientHeight || 800);
		boardEl.width = Math.floor(cssWidth * deviceScale);
		boardEl.height = Math.floor(cssHeight * deviceScale);
		ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
		
		// Adjust for mobile
		if (window.innerWidth <= 768) {
			state.mobileView = true;
		} else {
			state.mobileView = false;
		}
		
		render();
	}
	window.addEventListener('resize', resizeCanvas);
	
	// Touch support for mobile
	let touchStartX = 0;
	let touchStartY = 0;
	
	boardEl.addEventListener('touchstart', ev => {
		const touch = ev.touches[0];
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
		ev.preventDefault();
	}, { passive: false });
	
	boardEl.addEventListener('touchend', ev => {
		const touch = ev.changedTouches[0];
		const deltaX = Math.abs(touch.clientX - touchStartX);
		const deltaY = Math.abs(touch.clientY - touchStartY);
		
		// Only register as tap if minimal movement
		if (deltaX < 10 && deltaY < 10) {
			const rect = boardEl.getBoundingClientRect();
			handleBoardClick(touch.clientX - rect.left, touch.clientY - rect.top);
		}
		ev.preventDefault();
	}, { passive: false });

	// ---------- Game Data ----------
	const COLOR_POOL = [
		'#ff5757', '#3aa3ff', '#49d46c', '#b67eff',
		'#ff9f40', '#ffd644', '#28e0e0', '#ff7ab6', '#18c09a'
	];

	const TILE = { EMPTY: 0, ASTEROID: 1, BOOST: 2, WORMHOLE: 3, BASE: 4, FLAG: 5 };

	const state = {
		// Game state
		cols: 20,
		rows: 14,
		cellSize: 40,
		grid: [],
		wormholePairs: new Map(),
		players: [],
		flags: new Map(),
		turnIndex: 0,
		phase: 'awaitRoll',
		stepsRemaining: 0,
		highlights: new Set(),
		lastMove: null, // Track last move for animation
		
		// Online state
		roomCode: null,
		selfId: null,
		isHost: false,
		inGame: false,
		playerReady: false,
		mobileView: false,
		
		// AI state
		aiPlayers: new Set()
	};

	// Initialize empty grid to prevent render errors
	function newGrid(cols, rows, fill = { type: TILE.EMPTY }) {
		const g = new Array(rows);
		for (let y = 0; y < rows; y++) {
			g[y] = new Array(cols);
			for (let x = 0; x < cols; x++) g[y][x] = { ...fill };
		}
		return g;
	}
	state.grid = newGrid(state.cols, state.rows);

	// ---------- Socket.IO Connection ----------
	let socket = null;

	function connectSocket() {
		// Try to connect to same origin first, fallback to localhost:3000
		const serverUrl = location.port === '3000' ? '' : getServerUrl();
		
		// eslint-disable-next-line no-undef
		if (!window.io) {
			// Try to load Socket.IO from CDN if not available
			const script = document.createElement('script');
			script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
			script.onload = () => {
				// eslint-disable-next-line no-undef
				socket = window.io(serverUrl);
				setupSocketHandlers();
			};
			script.onerror = () => {
				showError('Failed to load network library');
			};
			document.head.appendChild(script);
		} else {
			// eslint-disable-next-line no-undef
			socket = window.io(serverUrl);
			setupSocketHandlers();
		}
	}

	function getServerUrl() {
		if (location.protocol === 'https:') return ''; // Use same origin for HTTPS
		const host = location.hostname || 'localhost';
		return `http://${host}:3000`;
	}

	function setupSocketHandlers() {
		socket.on('connect', () => {
			console.log('Connected to server');
			hideError();
		});

		socket.on('disconnect', () => {
			console.log('Disconnected from server');
			if (state.inGame) {
				showError('Connection lost. Please refresh to reconnect.');
			}
		});

		// Room creation/joining
		socket.on('room:created', ({ code, isHost, selfId, players }) => {
			state.roomCode = code;
			state.isHost = isHost;
			state.selfId = selfId;
			showRoomLobby(players);
		});

		socket.on('room:joined', ({ code, isHost, selfId, players }) => {
			state.roomCode = code;
			state.isHost = isHost;
			state.selfId = selfId;
			showRoomLobby(players);
		});

		socket.on('room:error', ({ message }) => {
			showError(message);
		});

		socket.on('room:playerJoined', ({ player }) => {
			// Update player list when someone joins
			updatePlayersList();
		});

		socket.on('room:playerLeft', ({ playerId, players, newHostId }) => {
			if (newHostId === state.selfId) {
				state.isHost = true;
			}
			updatePlayersList(players);
		});

		socket.on('room:playerDisconnected', ({ playerId, players }) => {
			updatePlayersList(players);
		});

		socket.on('room:playerUpdate', ({ players, canStart }) => {
			updatePlayersList(players);
			if (state.isHost) {
				btnStart.disabled = !canStart;
				lobbyStatus.textContent = canStart ? 'All players ready!' : 'Waiting for players to ready up...';
			}
		});

		socket.on('room:kicked', () => {
			showError('You have been kicked from the room');
			returnToMainLobby();
		});

		// Game start
		socket.on('game:started', ({ players }) => {
			state.inGame = true;
			lobbyModal.classList.add('hidden');
			roomDisplay.textContent = `Room: ${state.roomCode}`;
			roomDisplay.classList.remove('hidden');
			btnLeave.classList.remove('hidden');
			
			// Track AI players
			state.aiPlayers.clear();
			players.forEach(p => {
				if (p.socketId && p.socketId.startsWith('AI_')) {
					state.aiPlayers.add(p.socketId);
				}
			});
			
			// Initialize game with received players
			const gamePlayers = players.map(p => ({
				id: p.id,
				name: p.name,
				color: p.color,
				flagsLeft: 3,
				active: true,
				score: 0,
				base: { x: 0, y: 0 },
				pos: { x: 0, y: 0 },
				carryingFlagOf: null,
				socketId: p.socketId,
				isAI: p.socketId && p.socketId.startsWith('AI_')
			}));
			
			if (state.isHost) {
				startGame(gamePlayers);
			}
		});

		// Game state sync
		socket.on('game:state', ({ state: remoteState }) => {
			if (!state.isHost && remoteState) {
				applyRemoteState(remoteState);
			}
		});

		// Return to lobby
		socket.on('game:returnedToLobby', ({ players }) => {
			state.inGame = false;
			state.playerReady = false;
			btnReady.textContent = 'Ready';
			btnReady.classList.remove('ready');
			showRoomLobby(players);
		});

		// Action forwarding for host
		socket.on('action:roll', ({ fromId }) => {
			if (state.isHost && state.phase === 'awaitRoll') {
				const cur = currentPlayer();
				if (cur && cur.socketId === fromId) {
					performRoll();
				}
			}
		});

		socket.on('action:move', ({ fromId, x, y }) => {
			if (state.isHost) {
				const cur = currentPlayer();
				if (cur && cur.socketId === fromId) {
					tryMoveTo(x, y);
				}
			}
		});

		socket.on('action:end', ({ fromId }) => {
			if (state.isHost) {
				const cur = currentPlayer();
				if (cur && cur.socketId === fromId) {
					nextTurn();
				}
			}
		});
	}

	// ---------- Lobby Functions ----------
	function showError(message) {
		errorMessage.textContent = message;
		errorMessage.classList.remove('hidden');
		setTimeout(() => hideError(), 5000);
	}

	function hideError() {
		errorMessage.classList.add('hidden');
	}

	function showRoomLobby(players) {
		lobbyChoice.classList.add('hidden');
		roomLobby.classList.remove('hidden');
		roomCodeEl.textContent = state.roomCode;
		
		updatePlayersList(players);
		
		if (state.isHost) {
			btnAddAI.classList.remove('hidden');
			btnStart.classList.remove('hidden');
			btnReady.classList.add('hidden');
		} else {
			btnAddAI.classList.add('hidden');
			btnStart.classList.add('hidden');
			btnReady.classList.remove('hidden');
		}
		
		lobbyStatus.textContent = state.isHost ? 
			'Waiting for players to ready up...' : 
			'Waiting for host to start the game...';
	}

	function updatePlayersList(players) {
		// If no players provided, request update from server
		if (!players) return;
		
		playersList.innerHTML = '';
		players.forEach(player => {
			const li = document.createElement('li');
			if (player.id === state.selfId) li.classList.add('self');
			if (player.ready) li.classList.add('ready');
			
			const colorDiv = document.createElement('div');
			colorDiv.className = 'player-color';
			colorDiv.style.background = player.color;
			
			const nameSpan = document.createElement('span');
			const isAI = player.isAI || (player.id && player.id.startsWith('AI_'));
			nameSpan.textContent = player.name + 
				(player.id === state.selfId ? ' (You)' : '') +
				(isAI ? ' 🤖' : '');
			
			const statusDiv = document.createElement('div');
			if (player.id === state.selfId && state.isHost) {
				const badge = document.createElement('span');
				badge.className = 'player-badge host';
				badge.textContent = 'HOST';
				statusDiv.appendChild(badge);
			} else if (player.ready) {
				const badge = document.createElement('span');
				badge.className = 'player-badge ready';
				badge.textContent = 'READY';
				statusDiv.appendChild(badge);
			}
			
			// Host can kick other players (including AI)
			if (state.isHost && player.id !== state.selfId) {
				const kickBtn = document.createElement('button');
				kickBtn.className = 'secondary small';
				kickBtn.textContent = isAI ? 'Remove' : 'Kick';
				kickBtn.onclick = () => {
					if (isAI) {
						socket.emit('ai:remove', { aiId: player.id });
					} else {
						socket.emit('player:kick', { playerId: player.id });
					}
				};
				statusDiv.appendChild(kickBtn);
			}
			
			li.appendChild(colorDiv);
			li.appendChild(nameSpan);
			li.appendChild(statusDiv);
			li.appendChild(document.createElement('div')); // Empty cell for grid layout
			
			playersList.appendChild(li);
		});
		
		// Update AI button state
		if (state.isHost) {
			const aiCount = players.filter(p => p.id && p.id.startsWith('AI_')).length;
			const totalPlayers = players.length;
			btnAddAI.disabled = totalPlayers >= 9;
			btnAddAI.textContent = `Add AI Player (${aiCount} AI)`;
		}
	}

	function returnToMainLobby() {
		state.roomCode = null;
		state.selfId = null;
		state.isHost = false;
		state.playerReady = false;
		state.inGame = false;
		state.aiPlayers.clear();
		
		lobbyChoice.classList.remove('hidden');
		roomLobby.classList.add('hidden');
		roomDisplay.classList.add('hidden');
		btnLeave.classList.add('hidden');
		
		// Reset forms
		joinForm.reset();
		createForm.reset();
		joinColor.value = choice(COLOR_POOL);
		createColor.value = choice(COLOR_POOL);
	}

	// ---------- AI Logic ----------
	class AIPlayer {
		static async makeMove(player, gameState) {
			// AI decision making
			await sleep(1000); // Simulate thinking
			
			const targets = AIPlayer.evaluateTargets(player, gameState);
			if (targets.length === 0) return null;
			
			// Pick best target based on strategy
			const target = targets[0];
			return { x: target.x, y: target.y };
		}
		
		static evaluateTargets(player, gameState) {
			const reachable = computeReachable(player.pos, gameState.stepsRemaining);
			const targets = [];
			
			for (const [posKey, distance] of reachable) {
				const [x, y] = posKey.split(',').map(Number);
				let score = 0;
				
				// Check for enemy flags at bases
				for (const [ownerId, flag] of gameState.flags) {
					if (ownerId !== player.id && flag.state === 'base' && 
						flag.pos.x === x && flag.pos.y === y) {
						score += 100; // High priority to capture flags
					}
				}
				
				// Check for dropped flags
				for (const [ownerId, flag] of gameState.flags) {
					if (flag.state === 'dropped' && 
						flag.pos.x === x && flag.pos.y === y) {
						score += 80; // Good to pick up dropped flags
					}
				}
				
				// If carrying a flag, prioritize returning to base
				if (player.carryingFlagOf) {
					const distToBase = Math.abs(x - player.base.x) + Math.abs(y - player.base.y);
					score += (20 - distToBase) * 5;
					
					// Huge bonus for reaching base
					if (x === player.base.x && y === player.base.y) {
						score += 500;
					}
				}
				
				// Check for enemy players to tag
				for (const enemy of gameState.players) {
					if (enemy.id !== player.id && enemy.pos.x === x && enemy.pos.y === y) {
						if (enemy.carryingFlagOf) {
							score += 60; // Tag carriers
						} else {
							score += 20; // Tag enemies
						}
					}
				}
				
				// Boost pads are nice
				const tile = gameState.grid[y][x];
				if (tile.type === TILE.BOOST) {
					score += 10;
				}
				
				// Add some randomness for variety
				score += randInt(0, 5);
				
				if (score > 0) {
					targets.push({ x, y, score, distance });
				}
			}
			
			// Sort by score (higher is better), then by distance (closer is better)
			targets.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return a.distance - b.distance;
			});
			
			// If no good targets, move randomly from reachable
			if (targets.length === 0 && reachable.size > 1) {
				const keys = Array.from(reachable.keys()).filter(k => k !== key(player.pos.x, player.pos.y));
				if (keys.length > 0) {
					const randomKey = choice(keys);
					const [x, y] = randomKey.split(',').map(Number);
					targets.push({ x, y, score: 1, distance: reachable.get(randomKey) });
				}
			}
			
			return targets;
		}
	}

	async function handleAITurn() {
		const cur = currentPlayer();
		if (!cur || !cur.isAI || !state.isHost) return;
		
		// AI rolls
		await sleep(800);
		performRoll();
		
		// AI moves
		await sleep(1500);
		const move = await AIPlayer.makeMove(cur, state);
		if (move) {
			tryMoveTo(move.x, move.y);
		} else {
			// No good moves, end turn
			nextTurn();
		}
	}

	// ---------- Board Generation (unchanged from original) ----------
	const inBounds = (x, y) => x >= 0 && y >= 0 && x < state.cols && y < state.rows;
	
	function isWalkable(x, y) {
		if (!inBounds(x, y)) return false;
		const t = state.grid[y][x];
		if (t.type === TILE.ASTEROID) return false;
		return true;
	}

	function generateBoard(numPlayers) {
		state.cols = 14 + 2 * (numPlayers - 3);
		state.rows = 10 + 2 * (numPlayers - 3);
		state.cols = clamp(state.cols, 14, 22);
		state.rows = clamp(state.rows, 10, 18);
		state.grid = newGrid(state.cols, state.rows);
		state.wormholePairs = new Map();

		const innerMinX = 1, innerMinY = 1, innerMaxX = state.cols - 2, innerMaxY = state.rows - 2;
		const area = (state.cols - 2) * (state.rows - 2);
		const numAsteroids = Math.floor(area * 0.08);
		for (let i = 0; i < numAsteroids; i++) {
			const x = randInt(innerMinX, innerMaxX);
			const y = randInt(innerMinY, innerMaxY);
			state.grid[y][x] = { type: TILE.ASTEROID };
		}

		const numBoosts = clamp(Math.floor(numPlayers * 1.5) + 2, 4, 10);
		let placed = 0;
		while (placed < numBoosts) {
			const x = randInt(innerMinX, innerMaxX);
			const y = randInt(innerMinY, innerMaxY);
			if (state.grid[y][x].type === TILE.EMPTY) {
				state.grid[y][x] = { type: TILE.BOOST };
				placed++;
			}
		}

		const pairs = numPlayers <= 5 ? 1 : 2;
		for (let id = 1; id <= pairs; id++) {
			let a, b;
			while (!a) {
				const x = randInt(innerMinX, innerMaxX);
				const y = randInt(innerMinY, innerMaxY);
				if (state.grid[y][x].type === TILE.EMPTY) {
					state.grid[y][x] = { type: TILE.WORMHOLE, portalId: id };
					a = { x, y };
				}
			}
			while (!b) {
				const x = randInt(innerMinX, innerMaxX);
				const y = randInt(innerMinY, innerMaxY);
				if (state.grid[y][x].type === TILE.EMPTY) {
					state.grid[y][x] = { type: TILE.WORMHOLE, portalId: id };
					b = { x, y };
				}
			}
			state.wormholePairs.set(id, { a, b });
		}
	}

	function perimeterPositions() {
		const positions = [];
		for (let x = 0; x < state.cols; x++) positions.push({ x, y: 0 });
		for (let y = 1; y < state.rows; y++) positions.push({ x: state.cols - 1, y });
		for (let x = state.cols - 2; x >= 0; x--) positions.push({ x, y: state.rows - 1 });
		for (let y = state.rows - 2; y >= 1; y--) positions.push({ x: 0, y });
		return positions;
	}

	function placeBasesAndFlags(players) {
		const ring = perimeterPositions();
		const step = Math.floor(ring.length / players.length);
		for (let i = 0; i < players.length; i++) {
			const p = players[i];
			const basePos = ring[(i * step) % ring.length];
			state.grid[basePos.y][basePos.x] = { type: TILE.BASE, ownerId: p.id };
			p.base = { ...basePos };
			p.pos = { ...basePos };
			state.flags.set(p.id, { state: 'base', pos: { ...basePos } });
		}
	}

	// ---------- Game Logic ----------
	const currentPlayer = () => state.players[state.turnIndex];
	const countActive = () => state.players.filter(p => p.active).length;
	const playerById = id => state.players.find(p => p.id === id);

	function nextTurn() {
		if (countActive() <= 1) {
			const winner = state.players.find(p => p.active);
			state.phase = 'gameOver';
			if (winner) {
				announce(`${winner.name} wins!`);
			} else {
				announce('All flags exhausted.');
			}
			updateHud();
			render();
			return;
		}
		
		let safety = 0;
		do {
			state.turnIndex = (state.turnIndex + 1) % state.players.length;
			safety++;
		} while (!state.players[state.turnIndex].active && safety < 100);
		
		state.phase = 'awaitRoll';
		state.stepsRemaining = 0;
		state.highlights.clear();
		rollResultEl.textContent = '-';
		render();
		updateHud();
		
		if (state.isHost) {
			emitGameState();
			
			// Check if it's an AI's turn
			const cur = currentPlayer();
			if (cur && cur.isAI) {
				handleAITurn();
			}
		}
	}

	function neighborsOf(x, y) {
		return [
			{ x: x + 1, y },
			{ x: x - 1, y },
			{ x, y: y + 1 },
			{ x, y: y - 1 }
		];
	}

	function computeReachable(from, steps) {
		const visited = new Map();
		const q = [{ x: from.x, y: from.y, d: 0 }];
		visited.set(key(from.x, from.y), 0);
		
		while (q.length) {
			const cur = q.shift();
			for (const n of neighborsOf(cur.x, cur.y)) {
				if (!inBounds(n.x, n.y)) continue;
				const t = state.grid[n.y][n.x];
				if (!isWalkable(n.x, n.y)) continue;
				
				const nd = cur.d + 1;
				if (nd > steps) continue;
				
				let occupied = false;
				for (const p of state.players) {
					if (p.pos.x === n.x && p.pos.y === n.y) occupied = true;
				}
				
				const k = key(n.x, n.y);
				if (!visited.has(k) || visited.get(k) > nd) visited.set(k, nd);
				if (occupied) continue;
				
				if (t.type === TILE.WORMHOLE) {
					const pair = state.wormholePairs.get(t.portalId);
					const exit = (pair.a.x === n.x && pair.a.y === n.y) ? pair.b : pair.a;
					if (inBounds(exit.x, exit.y) && isWalkable(exit.x, exit.y)) {
						const ek = key(exit.x, exit.y);
						if (!visited.has(ek) || visited.get(ek) > nd) {
							visited.set(ek, nd);
							q.push({ x: exit.x, y: exit.y, d: nd });
						}
					}
					continue;
				}
				
				if (!visited.has(k) || visited.get(k) >= nd) {
					q.push({ x: n.x, y: n.y, d: nd });
				}
			}
		}
		return visited;
	}

	function highlightReachable() {
		state.highlights.clear();
		const player = currentPlayer();
		const dist = computeReachable(player.pos, state.stepsRemaining);
		for (const k of dist.keys()) {
			if (k !== key(player.pos.x, player.pos.y)) {
				state.highlights.add(k);
			}
		}
		render();
		boardEl.style.cursor = state.highlights.size ? 'pointer' : 'default';
	}

	function tryMoveTo(x, y) {
		if (state.phase !== 'awaitMove') return;
		if (!state.highlights.has(key(x, y))) return;
		
		const me = currentPlayer();
		const oldPos = { ...me.pos };
		const distMap = computeReachable(me.pos, state.stepsRemaining);
		const used = distMap.get(key(x, y));
		if (used == null) return;
		
		state.stepsRemaining = Math.max(0, state.stepsRemaining - used);
		me.pos = { x, y };
		
		// Store move for animation
		state.lastMove = {
			playerId: me.id,
			from: oldPos,
			to: { x, y },
			path: reconstructPath(oldPos, { x, y }, distMap)
		};
		
		// Handle tagging
		for (const p of state.players) {
			if (p.id !== me.id && p.pos.x === x && p.pos.y === y) {
				if (p.carryingFlagOf != null) {
					const ownerId = p.carryingFlagOf;
					state.flags.set(ownerId, { state: 'dropped', pos: { x, y } });
					p.carryingFlagOf = null;
				}
				p.pos = { ...p.base };
			}
		}
		
		const tile = state.grid[y][x];
		
		// Pick up flags
		for (const [ownerId, flag] of state.flags) {
			if (ownerId !== me.id) {
				const owner = playerById(ownerId);
				if (flag.state === 'base' && owner.flagsLeft > 0 && flag.pos.x === x && flag.pos.y === y) {
					me.carryingFlagOf = ownerId;
					state.flags.set(ownerId, { state: 'carried', carriedBy: me.id });
				}
				if (flag.state === 'dropped' && flag.pos.x === x && flag.pos.y === y) {
					me.carryingFlagOf = ownerId;
					state.flags.set(ownerId, { state: 'carried', carriedBy: me.id });
				}
			}
		}
		
		// Boost pad
		if (tile.type === TILE.BOOST) state.stepsRemaining += 2;
		
		// Wormhole
		if (tile.type === TILE.WORMHOLE) {
			const pair = state.wormholePairs.get(tile.portalId);
			const exit = (pair.a.x === x && pair.a.y === y) ? pair.b : pair.a;
			me.pos = { ...exit };
		}
		
		// Capture flag
		if (me.carryingFlagOf != null && me.pos.x === me.base.x && me.pos.y === me.base.y) {
			const victimId = me.carryingFlagOf;
			const victim = playerById(victimId);
			victim.flagsLeft = Math.max(0, (victim.flagsLeft || 0) - 1);
			me.carryingFlagOf = null;
			
			if (victim.flagsLeft > 0) {
				state.flags.set(victimId, { state: 'base', pos: { ...victim.base } });
			} else {
				state.flags.set(victimId, { state: 'exhausted' });
				victim.active = false;
				announce(`${victim.name} is out!`);
			}
		}
		
		if (state.phase !== 'gameOver') {
			if (state.stepsRemaining > 0) {
				state.phase = 'awaitMove';
				highlightReachable();
			} else {
				state.phase = 'awaitRoll';
				state.highlights.clear();
				rollResultEl.textContent = '-';
				nextTurn();
				return;
			}
		}
		
		render();
		updateHud();
		
		if (state.isHost) {
			emitGameState();
		}
	}

	function reconstructPath(from, to, distMap) {
		// Simple path reconstruction for animation
		const path = [];
		let current = to;
		
		while (current.x !== from.x || current.y !== from.y) {
			path.unshift(current);
			
			// Find neighbor with lower distance
			let found = false;
			for (const n of neighborsOf(current.x, current.y)) {
				const dist = distMap.get(key(n.x, n.y));
				const currentDist = distMap.get(key(current.x, current.y));
				if (dist !== undefined && dist < currentDist) {
					current = n;
					found = true;
					break;
				}
			}
			
			if (!found) break; // Safety
		}
		
		return path;
	}

	// ---------- Rendering ----------
	function render() {
		if (!ctx) return;
		
		const W = boardEl.width / deviceScale;
		const H = boardEl.height / deviceScale;
		ctx.clearRect(0, 0, W, H);
		
		// Adjust cell size for mobile
		let cellW = Math.floor(Math.min(W / state.cols, H / state.rows));
		if (state.mobileView && cellW < 30) {
			cellW = Math.max(25, cellW); // Minimum size for touch
		}
		state.cellSize = cellW;
		
		const ox = Math.floor((W - cellW * state.cols) / 2);
		const oy = Math.floor((H - cellW * state.rows) / 2);
		
		// Background
		ctx.fillStyle = '#070a12';
		ctx.fillRect(ox, oy, cellW * state.cols, cellW * state.rows);
		
		// Grid lines
		ctx.strokeStyle = 'rgba(255,255,255,0.06)';
		ctx.lineWidth = 1;
		for (let y = 0; y <= state.rows; y++) {
			const py = oy + y * cellW + 0.5;
			ctx.beginPath();
			ctx.moveTo(ox + 0.5, py);
			ctx.lineTo(ox + cellW * state.cols - 0.5, py);
			ctx.stroke();
		}
		for (let x = 0; x <= state.cols; x++) {
			const px = ox + x * cellW + 0.5;
			ctx.beginPath();
			ctx.moveTo(px, oy + 0.5);
			ctx.lineTo(px, oy + cellW * state.rows - 0.5);
			ctx.stroke();
		}
		
		// Draw move trail animation
		if (state.lastMove && state.lastMove.path) {
			ctx.strokeStyle = 'rgba(255, 214, 68, 0.6)';
			ctx.lineWidth = 3;
			ctx.setLineDash([5, 5]);
			ctx.beginPath();
			
			// Draw path
			let first = true;
			for (const point of state.lastMove.path) {
				const px = ox + point.x * cellW + cellW / 2;
				const py = oy + point.y * cellW + cellW / 2;
				if (first) {
					ctx.moveTo(px, py);
					first = false;
				} else {
					ctx.lineTo(px, py);
				}
			}
			ctx.stroke();
			ctx.setLineDash([]);
			
			// Fade out animation
			setTimeout(() => {
				state.lastMove = null;
				render();
			}, 2000);
		}
		
		// Tiles
		for (let y = 0; y < state.rows; y++) {
			for (let x = 0; x < state.cols; x++) {
				const row = state.grid[y] || [];
				const t = row[x] || { type: TILE.EMPTY };
				const px = ox + x * cellW;
				const py = oy + y * cellW;
				
				switch (t.type) {
					case TILE.ASTEROID:
						ctx.fillStyle = '#3a3f50';
						ctx.fillRect(px + 3, py + 3, cellW - 6, cellW - 6);
						break;
					case TILE.BOOST:
						ctx.fillStyle = 'rgba(255,214,68,0.18)';
						ctx.fillRect(px + 3, py + 3, cellW - 6, cellW - 6);
						ctx.fillStyle = '#ffd644';
						ctx.beginPath();
						ctx.moveTo(px + cellW * 0.25, py + cellW * 0.7);
						ctx.lineTo(px + cellW * 0.6, py + cellW * 0.5);
						ctx.lineTo(px + cellW * 0.25, py + cellW * 0.3);
						ctx.closePath();
						ctx.fill();
						break;
					case TILE.WORMHOLE:
						ctx.strokeStyle = '#b67eff';
						ctx.lineWidth = 3;
						ctx.beginPath();
						ctx.arc(px + cellW / 2, py + cellW / 2, cellW * 0.32, 0, Math.PI * 2);
						ctx.stroke();
						break;
					case TILE.BASE:
						ctx.strokeStyle = 'rgba(255,255,255,0.9)';
						ctx.lineWidth = 2;
						ctx.strokeRect(px + 3, py + 3, cellW - 6, cellW - 6);
						break;
				}
			}
		}
		
		// Flags
		for (const [ownerId, flag] of state.flags) {
			if (flag.state === 'base' || flag.state === 'dropped') {
				const pos = flag.pos;
				const px = ox + pos.x * cellW;
				const py = oy + pos.y * cellW;
				const owner = playerById(ownerId);
				if (owner) drawFlag(px, py, cellW, owner.color);
			}
		}
		
		// Highlights
		for (const k of state.highlights) {
			const [x, y] = k.split(',').map(Number);
			const px = ox + x * cellW;
			const py = oy + y * cellW;
			ctx.fillStyle = 'rgba(255,214,68,0.28)';
			ctx.fillRect(px + 3, py + 3, cellW - 6, cellW - 6);
		}
		
		// Players
		for (const p of state.players) {
			const px = ox + p.pos.x * cellW;
			const py = oy + p.pos.y * cellW;
			ctx.fillStyle = p.color;
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = (currentPlayer() && currentPlayer().id === p.id) ? 3 : 1.5;
			ctx.fillRect(px + 6, py + 6, cellW - 12, cellW - 12);
			ctx.strokeRect(px + 6, py + 6, cellW - 12, cellW - 12);
			
			// Draw AI indicator
			if (p.isAI) {
				ctx.fillStyle = '#ffffff';
				ctx.font = `${Math.floor(cellW * 0.4)}px Arial`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('🤖', px + cellW / 2, py + cellW / 2);
			}
			
			if (p.carryingFlagOf != null) {
				const victim = playerById(p.carryingFlagOf);
				if (victim) drawFlag(px, py, cellW, victim.color, true);
			}
		}
		
		function drawFlag(px, py, cell, color, small = false) {
			const m = small ? 10 : 6;
			ctx.fillStyle = color;
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(px + m + 2, py + m);
			ctx.lineTo(px + m + 2, py + cell - m);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(px + m + 2, py + m + 2);
			ctx.lineTo(px + cell * 0.55, py + m + cell * 0.18);
			ctx.lineTo(px + m + 2, py + m + cell * 0.34);
			ctx.closePath();
			ctx.fill();
		}
	}

	function updateHud() {
		if (!state.inGame) {
			turnInfoEl.textContent = 'Waiting for game to start...';
			rollBtn.disabled = true;
			endBtn.disabled = true;
			return;
		}
		
		if (state.phase === 'gameOver') {
			turnInfoEl.textContent = 'Game over';
		} else {
			const p = currentPlayer();
			if (p) {
				const isMyTurn = p.socketId === state.selfId;
				const aiIndicator = p.isAI ? ' 🤖' : '';
				turnInfoEl.innerHTML = `<div><strong style="color:${p.color}">${p.name}${aiIndicator}</strong>'s turn${isMyTurn ? ' (You)' : ''}</div>`;
			}
		}
		
		// Only enable controls for the current player
		const isMyTurn = currentPlayer() && currentPlayer().socketId === state.selfId;
		rollBtn.disabled = !(state.phase === 'awaitRoll' && isMyTurn);
		endBtn.disabled = !(state.phase !== 'gameOver' && isMyTurn);
		rollBtn.classList.add('large');
		
		// Update scoreboard
		scoreboardEl.innerHTML = '';
		state.players.forEach((p, idx) => {
			const li = document.createElement('li');
			if (idx === state.turnIndex && p.active) li.classList.add('active');
			
			const sw = document.createElement('span');
			sw.className = 'score-swatch';
			sw.style.background = p.color;
			
			const name = document.createElement('span');
			name.textContent = p.name + 
				(p.socketId === state.selfId ? ' (You)' : '') +
				(p.isAI ? ' 🤖' : '');
			
			const sc = document.createElement('strong');
			sc.textContent = p.active ? `${p.flagsLeft} flags` : 'OUT';
			
			li.appendChild(sw);
			li.appendChild(name);
			li.appendChild(sc);
			scoreboardEl.appendChild(li);
		});
	}

	function announce(text) {
		console.log(text);
		// Could add visual announcements here
	}

	// ---------- Game Control ----------
	function startGame(players) {
		state.players = players;
		state.turnIndex = 0;
		while (!state.players[state.turnIndex].active) {
			state.turnIndex = (state.turnIndex + 1) % state.players.length;
		}
		state.phase = 'awaitRoll';
		state.stepsRemaining = 0;
		state.highlights.clear();
		state.flags = new Map();
		state.lastMove = null;
		
		const n = players.length;
		generateBoard(n);
		placeBasesAndFlags(players);
		resizeCanvas();
		updateHud();
		
		if (state.isHost) {
			emitGameState();
			
			// Check if first player is AI
			const cur = currentPlayer();
			if (cur && cur.isAI) {
				handleAITurn();
			}
		}
	}

	function performRoll() {
		if (state.phase !== 'awaitRoll') return;
		
		rollResultEl.classList.remove('rolling');
		void rollResultEl.offsetWidth;
		rollResultEl.classList.add('rolling');
		
		const roll = randInt(1, 6);
		setTimeout(() => {
			rollResultEl.textContent = String(roll);
			rollResultEl.classList.remove('rolling');
			rollResultEl.classList.remove('bump');
			void rollResultEl.offsetWidth;
			rollResultEl.classList.add('bump');
		}, 650);
		
		state.stepsRemaining = roll;
		state.phase = 'awaitMove';
		highlightReachable();
		
		if (state.isHost) {
			emitGameState();
			
			// If AI, continue with move
			const cur = currentPlayer();
			if (cur && cur.isAI) {
				setTimeout(async () => {
					const move = await AIPlayer.makeMove(cur, state);
					if (move) {
						tryMoveTo(move.x, move.y);
					} else {
						nextTurn();
					}
				}, 1500);
			}
		}
	}

	// ---------- Network Sync ----------
	function emitGameState() {
		if (socket && state.isHost) {
			socket.emit('game:state', { state: exportState() });
		}
	}

	function exportState() {
		return {
			cols: state.cols,
			rows: state.rows,
			grid: state.grid,
			wormholePairs: Array.from(state.wormholePairs.entries()),
			players: state.players,
			flags: Array.from(state.flags.entries()),
			turnIndex: state.turnIndex,
			phase: state.phase,
			stepsRemaining: state.stepsRemaining,
			lastMove: state.lastMove
		};
	}

	function applyRemoteState(remote) {
		state.cols = remote.cols;
		state.rows = remote.rows;
		state.grid = remote.grid;
		state.wormholePairs = new Map(remote.wormholePairs);
		state.players = remote.players;
		state.flags = new Map(remote.flags);
		state.turnIndex = remote.turnIndex;
		state.phase = remote.phase;
		state.stepsRemaining = remote.stepsRemaining;
		state.lastMove = remote.lastMove;
		state.highlights.clear();
		
		// Track AI players
		state.aiPlayers.clear();
		state.players.forEach(p => {
			if (p.isAI || (p.socketId && p.socketId.startsWith('AI_'))) {
				state.aiPlayers.add(p.socketId);
			}
		});
		
		// Re-highlight if it's our turn and we're in move phase
		if (state.phase === 'awaitMove') {
			const cur = currentPlayer();
			if (cur && cur.socketId === state.selfId) {
				highlightReachable();
			}
		}
		
		resizeCanvas();
		updateHud();
	}

	// ---------- Event Handlers ----------
	function handleBoardClick(clickX, clickY) {
		if (!state.inGame || state.phase !== 'awaitMove') return;
		
		const cur = currentPlayer();
		if (!cur || cur.socketId !== state.selfId) return;
		
		const W = boardEl.width / deviceScale;
		const H = boardEl.height / deviceScale;
		const cellW = state.cellSize;
		const ox = Math.floor((W - cellW * state.cols) / 2);
		const oy = Math.floor((H - cellW * state.rows) / 2);
		const x = Math.floor((clickX - ox) / cellW);
		const y = Math.floor((clickY - oy) / cellW);
		
		if (!inBounds(x, y)) return;
		
		if (state.isHost) {
			tryMoveTo(x, y);
		} else {
			socket.emit('action:move', { x, y });
		}
	}

	rollBtn.addEventListener('click', () => {
		if (state.phase !== 'awaitRoll') return;
		
		const cur = currentPlayer();
		if (!cur || cur.socketId !== state.selfId) return;
		
		if (state.isHost) {
			performRoll();
		} else {
			socket.emit('action:roll');
		}
	});

	endBtn.addEventListener('click', () => {
		if (state.phase === 'gameOver') return;
		
		const cur = currentPlayer();
		if (!cur || cur.socketId !== state.selfId) return;
		
		if (state.isHost) {
			nextTurn();
		} else {
			socket.emit('action:end');
		}
	});

	boardEl.addEventListener('click', ev => {
		const rect = boardEl.getBoundingClientRect();
		handleBoardClick(ev.clientX - rect.left, ev.clientY - rect.top);
	});

	// Lobby form handlers
	joinForm.addEventListener('submit', ev => {
		ev.preventDefault();
		const code = joinCode.value.trim().toUpperCase();
		const name = joinName.value.trim();
		const color = joinColor.value;
		
		if (!code || !name) return;
		
		socket.emit('room:join', { code, name, color });
	});

	createForm.addEventListener('submit', ev => {
		ev.preventDefault();
		const name = createName.value.trim();
		const color = createColor.value;
		
		if (!name) return;
		
		socket.emit('room:create', { name, color });
	});

	btnAddAI.addEventListener('click', () => {
		if (!state.isHost) return;
		socket.emit('ai:add');
	});

	btnReady.addEventListener('click', () => {
		state.playerReady = !state.playerReady;
		btnReady.textContent = state.playerReady ? 'Not Ready' : 'Ready';
		btnReady.classList.toggle('ready', state.playerReady);
		socket.emit('player:ready', { ready: state.playerReady });
	});

	btnStart.addEventListener('click', () => {
		if (!state.isHost) return;
		socket.emit('game:start');
	});

	btnLeaveRoom.addEventListener('click', () => {
		if (socket) socket.disconnect();
		returnToMainLobby();
		connectSocket();
	});

	btnLeave.addEventListener('click', () => {
		if (state.isHost && state.inGame) {
			socket.emit('game:returnToLobby');
		} else {
			if (socket) socket.disconnect();
			returnToMainLobby();
			connectSocket();
		}
	});

	// Rules modal
	const RULES_HTML = `
		<div class="rules-copy">
			<p><strong>Goal</strong>: Capture opponents' flags. Each player starts with <strong>3 flags</strong>. You're eliminated when all of your flags have been captured. Last player with flags remaining wins.</p>
			<ul>
				<li><strong>Players</strong>: 3–9 players online (can add AI opponents).</li>
				<li><strong>Board</strong>: Bases on the rim, asteroids (blocked), boost pads (+2 on landing), paired wormholes (teleport on landing).</li>
				<li><strong>Turn</strong>: Roll 1–6; move orthogonally. You can't move through asteroids or other players.</li>
				<li><strong>Tagging</strong>: Finish on a tile with another player to tag them back to base. If they carry a flag, it drops.</li>
				<li><strong>Flags</strong>: Step onto an opponent's base to take one of their remaining flags. If you reach your base while carrying, that opponent loses one flag. Their next flag respawns at their base until they're out.</li>
				<li><strong>AI Players</strong>: The host can add AI opponents that play strategically. They're marked with 🤖.</li>
			</ul>
		</div>
	`;

	btnHow.addEventListener('click', () => {
		rulesModal.classList.remove('hidden');
	});

	btnCloseRules.addEventListener('click', () => {
		rulesModal.classList.add('hidden');
	});

	rulesBody.innerHTML = RULES_HTML;

	// ---------- Initialization ----------
	// Set initial colors
	joinColor.value = choice(COLOR_POOL);
	createColor.value = choice(COLOR_POOL);
	
	// Initialize canvas
	resizeCanvas();
	
	// Connect to server
	connectSocket();

})();