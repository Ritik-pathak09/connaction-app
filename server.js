const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // Increased limit to allow large images and files
});

app.use(express.static('public'));

// MongoDB Connection using Environment Variable or your connection string
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ritikpathak8570_db_user:ritik123@cluster0.vqrk1qc.mongodb.net/connection?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB Atlas successfully!'))
    .catch((err) => console.error('MongoDB connection error:', err));

// Message Schema & Model
const messageSchema = new mongoose.Schema({
    id: String,
    sender: String,
    text: String,
    image: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Function to get current date in IST (Indian Standard Time)
function getISTDateString() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

let currentDayIST = getISTDateString();

// Check every minute if the day has changed in India (IST)
setInterval(async () => {
    const todayIST = getISTDateString();
    if (todayIST !== currentDayIST) {
        try {
            // Raat ke 12 baje naya din shuru hote hi MongoDB se saari chat delete kar do
            await Message.deleteMany({});
            currentDayIST = todayIST;
            io.emit('history_cleared');
            console.log('New day started in IST. MongoDB chat history reset.');
        } catch (err) {
            console.error('Error clearing chat on day change:', err);
        }
    }
}, 60000); // Check every 1 minute

io.on('connection', async (socket) => {
    try {
        // Database se purani chat load karke naye user ko bhejo
        const chatHistory = await Message.find().sort({ timestamp: 1 });
        socket.emit('load_history', chatHistory);
    } catch (err) {
        console.error('Error loading history:', err);
    }

    // Jab koi naya message aaye toh database mein save karo
    socket.on('send_message', async (data) => {
        try {
            const newMessage = new Message({
                id: data.id || Date.now().toString(),
                sender: data.sender,
                text: data.text,
                image: data.image
            });
            await newMessage.save();
            io.emit('receive_message', newMessage);
        } catch (err) {
            console.error('Error saving message:', err);
        }
    });

    // Delete message event sync from database
    socket.on('delete_message', async (msgId) => {
        try {
            await Message.deleteOne({ id: msgId });
            io.emit('delete_message', msgId);
        } catch (err) {
            console.error('Error deleting message:', err);
        }
    });

    // Clear history manually
    socket.on('clear_history', async () => {
        try {
            await Message.deleteMany({});
            io.emit('history_cleared');
        } catch (err) {
            console.error('Error clearing history:', err);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
