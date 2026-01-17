const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity in dev
        methods: ["GET", "POST"]
    }
});

// Game State Management
// Room structure:
// {
//   roomId: string,
//   players: [{ id, name, role, isHost }],
//   settings: { playerCount: 5, roles: [] },
//   gameState: 'LOBBY' | 'NIGHT' | 'DAY' | 'VOTE' | 'QUEST' | 'END',
//   currentQuest: 1,
//   questResults: [], // [true, false, true...]
//   ...
// }
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', ({ hostName, playerCount }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const newRoom = {
            id: roomId,
            players: [{ id: socket.id, name: hostName, isHost: true, role: null }],
            settings: { playerCount, activeRoles: [] }, // activeRoles will be decided later
            gameState: 'LOBBY'
        };
        rooms.set(roomId, newRoom);
        socket.join(roomId);

        // Send back room info
        socket.emit('room_created', { roomId, players: newRoom.players });
        console.log(`Room ${roomId} created by ${hostName}`);
    });

    socket.on('join_room', ({ roomId, playerName }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        if (room.players.length >= room.settings.playerCount) {
            socket.emit('error', 'Room is full');
            return;
        }

        if (room.gameState !== 'LOBBY') {
            socket.emit('error', 'Game already started');
            return;
        }

        const newPlayer = { id: socket.id, name: playerName, isHost: false, role: null };
        room.players.push(newPlayer);
        socket.join(roomId);

        // Notify everyone in room
        io.to(roomId).emit('player_joined', room.players);
        console.log(`${playerName} joined room ${roomId}`);
    });

    socket.on('start_game', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        // Check if enough players
        if (room.players.length < 5) { // Still keep min 5 for stability, but logic focused on 6
            // socket.emit('error', 'Not enough players');
            // return;
        }

        // Assign Roles Logic (Custom for 6 Players as requested)
        const roles = assignRoles(room.players.length);

        room.players.forEach((player, index) => {
            player.role = roles[index];
        });

        room.gameState = 'NIGHT';
        room.kingIndex = Math.floor(Math.random() * room.players.length);
        room.currentQuest = 1;
        room.questResults = [];
        room.failedVotes = 0;

        // Custom Quest Config
        const QUEST_CONFIG = {
            5: [2, 3, 2, 3, 3],
            6: [2, 3, 4, 3, 4], // User request: 2, 3, 4, 3, 4
            7: [2, 3, 3, 4, 4],
            8: [3, 4, 4, 5, 5],
            9: [3, 4, 4, 5, 5],
            10: [3, 4, 4, 5, 5]
        };
        room.questConfig = QUEST_CONFIG[Math.max(5, room.players.length)] || [2, 3, 2, 3, 3];

        // Send individual info
        room.players.forEach(player => {
            const info = getPlayerKnowledge(player, room.players);
            io.to(player.id).emit('game_started', {
                role: player.role,
                knowledge: info,
                gameState: 'NIGHT',
                questConfig: room.questConfig,
                playerCount: room.players.length
            });
        });

        io.to(roomId).emit('update_gamestate', {
            phase: 'NIGHT',
            king: room.players[room.kingIndex].id,
            currentQuest: 1,
            questResults: [],
            timestamp: Date.now() // For timer sync
        });

        // Auto transition from Night to Day after 5 seconds
        setTimeout(() => {
            startTeamSelection(roomId);
        }, 5000);
    });

    function startTeamSelection(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;

        room.gameState = 'TEAM_SELECTION';
        // Set end time for timer (3 minutes)
        const duration = 3 * 60 * 1000;
        const endTime = Date.now() + duration;

        io.to(roomId).emit('update_gamestate', {
            phase: 'TEAM_SELECTION',
            king: room.players[room.kingIndex].id,
            currentQuest: room.currentQuest,
            questResults: room.questResults,
            requiredCount: room.questConfig[room.currentQuest - 1],
            timerEnd: endTime
        });
    }

    // Handle Team Proposal
    socket.on('propose_team', ({ roomId, selectedPlayerIds }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        // Validate turn
        // TODO: Check if sender is King

        room.proposedTeam = selectedPlayerIds;
        room.gameState = 'VOTE';

        io.to(roomId).emit('update_gamestate', {
            phase: 'VOTE',
            proposedTeam: selectedPlayerIds
        });
    });

    // Handle Voting
    // Handle Voting
    socket.on('submit_vote', ({ roomId, vote }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameState !== 'VOTE') return;

        if (!room.votes) room.votes = {};
        room.votes[socket.id] = vote;

        // Check if everyone voted
        if (Object.keys(room.votes).length === room.players.length) {
            // Tally votes
            const approves = Object.values(room.votes).filter(v => v === true).length;
            const rejects = room.players.length - approves;
            const passed = approves > rejects;

            // Send vote details
            const voteDetails = room.players.map(p => ({
                name: p.name,
                vote: room.votes[p.id] ? 'APPROVE' : 'REJECT'
            }));

            io.to(roomId).emit('vote_result', {
                passed,
                votes: voteDetails,
                approves,
                rejects
            });

            // Clear votes
            room.votes = {};

            if (passed) {
                // Move to QUEST
                room.gameState = 'QUEST';
                room.questMoves = {};
                room.failedVotes = 0; // Reset failed votes
                io.to(roomId).emit('update_gamestate', {
                    phase: 'QUEST',
                    team: room.proposedTeam,
                    questResults: room.questResults
                });
            } else {
                // Failed -> Next King
                room.failedVotes++;

                if (room.failedVotes >= 5) {
                    io.to(roomId).emit('game_over', { winner: 'EVIL', reason: '5 Failed Votes' });
                    room.gameState = 'END';
                    return;
                }

                room.kingIndex = (room.kingIndex + 1) % room.players.length;

                // Slight delay to let users see the vote result
                setTimeout(() => {
                    startTeamSelection(roomId);
                }, 4000);
            }
        }
    });

    // Handle Quest Action
    socket.on('submit_quest_move', ({ roomId, move }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameState !== 'QUEST') return;

        // Move should be true (Success) or false (Fail)
        // Only people in room.proposedTeam can act
        if (!room.proposedTeam.includes(socket.id)) return;

        if (!room.questMoves) room.questMoves = {};
        // Prevent changing move? Or allow? Assuming allow for now or just overwrite
        room.questMoves[socket.id] = move;

        const teamSize = room.proposedTeam.length;
        if (Object.keys(room.questMoves).length === teamSize) {
            // All team members moved
            const moves = Object.values(room.questMoves);
            const failCount = moves.filter(m => m === false).length;

            // Determine Result (Standard: 1 fail = Fail)
            // TODO: handle 4th quest 7+ players (2 fails) - For 6 players, standard rules apply usually, 
            // but let's stick to 1 fail = fail for simplicity unless specified otherwise.
            const questFailed = failCount > 0;
            const result = !questFailed;

            room.questResults.push(result); // true = Good Win (Success), false = Evil Win (Fail)

            io.to(roomId).emit('quest_result', {
                success: result,
                failCount: failCount
            });

            room.currentQuest++;

            // Check Game End
            const goodWins = room.questResults.filter(r => r === true).length;
            const evilWins = room.questResults.filter(r => r === false).length;

            if (evilWins >= 3) {
                io.to(roomId).emit('game_over', { winner: 'EVIL', reason: '3 Quests Failed' });
                room.gameState = 'END';
            } else if (goodWins >= 3) {
                // Trigger Assassination Phase
                room.gameState = 'ASSASSINATION';
                io.to(roomId).emit('update_gamestate', {
                    phase: 'ASSASSINATION',
                    questResults: room.questResults
                });
            } else {
                // Next Round
                room.kingIndex = (room.kingIndex + 1) % room.players.length;

                // Delay for result view
                setTimeout(() => {
                    startTeamSelection(roomId);
                }, 5000);
            }
        }
    });

    socket.on('assassinate', ({ roomId, targetId }) => {
        const room = rooms.get(roomId);
        if (!room || room.gameState !== 'ASSASSINATION') return;

        // Validate sender is Evil - User requested ONLY MORDRED can choose
        const sender = room.players.find(p => p.id === socket.id);
        if (!sender || sender.role !== 'MORDRED') return;

        const target = room.players.find(p => p.id === targetId);
        if (target && target.role === 'MERLIN') {
            io.to(roomId).emit('game_over', { winner: 'EVIL', reason: 'Merlin Assassinated!' });
        } else {
            io.to(roomId).emit('game_over', { winner: 'GOOD', reason: 'Assassination Failed!' });
        }
        room.gameState = 'END';
    });

    // Helper: Assign roles
    function assignRoles(count) {
        if (count === 6) {
            // Custom request: Mordred, Minion, Merlin, 3 Servants
            let list = ['MORDRED', 'MINION', 'MERLIN', 'SERVANT', 'SERVANT', 'SERVANT'];
            return list.sort(() => Math.random() - 0.5);
        }

        // Fallback for other counts (Basic)
        const evils = Math.ceil(count / 3);
        const goods = count - evils;
        let roleList = [];
        for (let i = 0; i < evils; i++) roleList.push('EVIL');
        for (let i = 0; i < goods; i++) roleList.push('GOOD');
        return roleList.sort(() => Math.random() - 0.5);
    }

    // Helper: Get knowledge (Custom Rules)
    function getPlayerKnowledge(player, allPlayers) {
        // Merlin sees all Evil (Mordred + Minion)
        if (player.role === 'MERLIN') {
            return allPlayers.filter(p => ['MORDRED', 'MINION', 'EVIL'].includes(p.role) && p.id !== player.id).map(p => p.name);
        }
        // Mordred sees Minion
        if (player.role === 'MORDRED') {
            return allPlayers.filter(p => p.role === 'MINION').map(p => p.name);
        }
        // Minion sees NO ONE (User request: "thuộc hạ không biết Mordred là ai")
        if (player.role === 'MINION') {
            return [];
        }

        // Default for other roles (e.g., SERVANT, or generic GOOD/EVIL)
        if (player.role === 'EVIL') { // Generic evil for non-custom games
            return allPlayers.filter(p => p.role === 'EVIL' && p.id !== player.id).map(p => p.name);
        }
        return [];
    }

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Handle cleanup... remove player from room, etc.
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
