const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3001;

const dbURI = process.env.MONGO_URI;
mongoose.connect(dbURI)
    .then(() => console.log('MongoDB connected successfully!'))
    .catch(err => console.log('Database connection error:', err));

const chatSchema = new mongoose.Schema({
    username: String,
    message: String,
    time: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
    console.log('A new user connected: ' + socket.id);

    Chat.find().sort({ time: -1 }).limit(50)
        .then(messages => {
            socket.emit('load-old-messages', messages.reverse());
        })
        .catch(err => console.log(err));

    socket.on('new-user-joined', (username) => {
        socket.username = username;
        socket.broadcast.emit('user-connected', username);
    });

    socket.on('chat-message', async (data) => {
        const newMsg = new Chat({
            username: data.username,
            message: data.message
        });

        try {
            await newMsg.save();
            io.emit('chat-message', data);
        } catch (err) {
            console.log('Error saving message:', err);
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            socket.broadcast.emit('user-disconnected', socket.username);
        }
    });
});

http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}...`);
});