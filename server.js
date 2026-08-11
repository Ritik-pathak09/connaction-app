const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let chatHistory = [];

io.on('connection', (socket) => {
    // Purani chat bhejain naye user ko
    socket.emit('load_history', chatHistory);

    // Jab koi naya message aaye
    socket.on('send_message', (data) => {
        chatHistory.push(data);
        if (chatHistory.length > 100) chatHistory.shift(); // limit to 100 msgs
        io.emit('receive_message', data);
    });

    // Clear history
    socket.on('clear_history', () => {
        chatHistory = [];
        io.emit('history_cleared');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
