const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- State Management ---
let users = {};
let messageHistory = [];

// --- Ensure upload directory exists ---
const uploadDir = 'public/uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// --- File Upload Setup (using Multer) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const safeFilename = file.originalname.replace(/[^a-zA-Z0-9-._]/g, '');
        cb(null, Date.now() + '-' + safeFilename);
    }
});
const upload = multer({ storage: storage });

// --- Middleware to serve static files (like uploads and socket.io client) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }
    res.json({ filePath: `/uploads/${req.file.filename}` });
});

// --- Socket.IO Connection Logic ---
io.on('connection', (socket) => {
    const userId = socket.id;
    users[userId] = { id: userId, name: `User-${Math.floor(Math.random() * 1000)}` };
    console.log(`${users[userId].name} connected`);

    socket.emit('history', messageHistory);
    io.emit('update-users', { users, count: Object.keys(users).length });

    socket.on('chat message', (msg) => {
        const messageData = { ...msg, id: Date.now(), user: users[userId], timestamp: new Date() };
        messageHistory.push(messageData);
        if (messageHistory.length > 100) messageHistory.shift();
        io.emit('chat message', messageData);
    });

    socket.on('typing', () => socket.broadcast.emit('typing-status', { user: users[userId], isTyping: true }));
    socket.on('stop-typing', () => socket.broadcast.emit('typing-status', { user: users[userId], isTyping: false }));

    socket.on('disconnect', () => {
        if (!users[userId]) return;
        console.log(`${users[userId].name} disconnected`);
        io.emit('typing-status', { user: { id: userId }, isTyping: false });
        delete users[userId];
        io.emit('update-users', { users, count: Object.keys(users).length });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));