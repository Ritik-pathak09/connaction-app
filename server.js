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
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ritikpathak8570_db_user:MRQnWJf1nP9EaxvZ@cluster0.vqrk1qc.mongodb.net/connection?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB Atlas successfully!'))
    .catch((err) => console.error('MongoDB connection error:', err));

// Message Schema & Model (Added 'status' field to track Read/Delivered)
const messageSchema = new mongoose.Schema({
    id: String,
    sender: String,
    text: String,
    image: String,
    time: String,
    status: { type: String, default: 'sent' }, // NAYA: Blue ticks track karne ke liye
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
        // FIX APPLIED HERE: Added .allowDiskUse(true) to prevent memory crash limit
        const chatHistory = await Message.find().sort({ timestamp: 1 }).allowDiskUse(true);
        socket.emit('load_history', chatHistory);
    } catch (err) {
        console.error('Error loading history:', err);
    }

    // Jab koi naya message aaye toh database mein save karo
    socket.on('send_message', async (data) => {
        try {
            // Fallback IST time if not passed from client
            const istTime = data.time || new Date().toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            const newMessage = new Message({
                id: data.id || Date.now().toString(),
                sender: data.sender,
                text: data.text,
                image: data.image,
                time: istTime,
                status: 'sent' // Status set to sent initially
            });
            await newMessage.save();
            io.emit('receive_message', newMessage);
        } catch (err) {
            console.error('Error saving message:', err);
        }
    });

    // Edit message event sync from database
    socket.on('edit_message', async (data) => {
        try {
            // Database mein purana message dhundho aur text update karo
            await Message.updateOne({ id: data.id }, { $set: { text: data.text } });
            
            // Sabhi connected users ko batao ki message edit ho gaya hai
            io.emit('message_edited', { id: data.id, text: data.text });
        } catch (err) {
            console.error('Error editing message:', err);
        }
    });

    // --- NAYA (NEW): Typing Indicators ---
    socket.on('typing', (name) => {
        // Jab koi type kare toh dusre ko batao
        socket.broadcast.emit('user_typing', name);
    });

    socket.on('stop_typing', () => {
        // Jab ruk jaye toh dusre ko batao
        socket.broadcast.emit('user_stopped_typing');
    });

    // --- NAYA (NEW): Mark Messages as Read (Blue Ticks) ---
    socket.on('mark_read', async (readerName) => {
        try {
            // Jo message dusre ne bheje hain aur abhi tak 'read' nahi hue hain, unko 'read' mark karo
            const result = await Message.updateMany(
                { sender: { $ne: readerName }, status: { $ne: 'read' } },
                { $set: { status: 'read' } }
            );
            // Agar koi message update hua hai toh sabko signal bhejo ticks blue karne ke liye
            if (result.modifiedCount > 0) {
                io.emit('messages_read');
            }
        } catch (err) {
            console.error('Error marking read:', err);
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
