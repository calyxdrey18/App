const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- State Management ---
// Store users as an object with socket.id as key
let users = {};

// --- Middleware & Routes ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Socket.IO Connection Logic ---
io.on('connection', (socket) => {
    console.log(`A user connected with id: ${socket.id}`);

    // --- Handle User Joining ---
    socket.on('join', (username) => {
        // Sanitize and validate username
        const cleanUsername = username.trim();
        if (!cleanUsername || cleanUsername.length > 15) {
            return socket.emit('join-error', { message: 'Username must be 1-15 characters long.' });
        }

        // Check for uniqueness
        const isTaken = Object.values(users).some(user => user.name.toLowerCase() === cleanUsername.toLowerCase());
        if (isTaken) {
            return socket.emit('join-error', { message: 'Username is already taken. Please choose another.' });
        }

        // Store user and send success response
        users[socket.id] = { id: socket.id, name: cleanUsername };
        socket.emit('join-success', users[socket.id]);
        
        // Broadcast to all clients that a new user has joined
        io.emit('update-users', { users: Object.values(users) });
        
        // Announce to other users that a new user has joined
        socket.broadcast.emit('chat message', {
            type: 'system',
            content: `${cleanUsername} has joined the chat.`
        });
    });

    // --- Handle Chat Messages ---
    socket.on('chat message', (msg) => {
        // Only allow joined users to send messages
        if (!users[socket.id]) return;

        const messageData = {
            type: 'user',
            content: msg,
            user: users[socket.id],
            timestamp: new Date()
        };
        io.emit('chat message', messageData);
    });

    // --- Handle Typing Indicators ---
    socket.on('typing', () => {
        if (!users[socket.id]) return;
        socket.broadcast.emit('typing-status', { user: users[socket.id], isTyping: true });
    });
    socket.on('stop-typing', () => {
        if (!users[socket.id]) return;
        socket.broadcast.emit('typing-status', { user: users[socket.id], isTyping: false });
    });

    // --- Handle Disconnection ---
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            console.log(`${user.name} disconnected`);
            delete users[socket.id];
            
            // Announce that the user has left
            io.emit('chat message', {
                type: 'system',
                content: `${user.name} has left the chat.`
            });

            // Update user list for everyone
            io.emit('update-users', { users: Object.values(users) });
            // Ensure their typing indicator is removed
            socket.broadcast.emit('typing-status', { user: {id: socket.id}, isTyping: false });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});