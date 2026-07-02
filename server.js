const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3001;

// static files (HTML, CSS, JS) को serve करने के लिए
app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
    console.log('एक नया यूजर कनेक्ट हुआ: ' + socket.id);

    // जब कोई यूजर चैट जॉइन करे
    socket.on('new-user-joined', (username) => {
        socket.username = username;
        // बाकी सभी को बताना कि नए यूजर ने जॉइन किया है
        socket.broadcast.emit('user-connected', username);
    });

    // मैसेज रिसीव करने और सबको भेजने के लिए
    socket.on('send-message', (message) => {
        io.emit('receive-message', {
            username: socket.username,
            message: message
        });
    });

    // जब कोई यूजर डिस्कनेक्ट हो
    socket.on('disconnect', () => {
        if(socket.username) {
            socket.broadcast.emit('user-disconnected', socket.username);
        }
        console.log('यूजर डिस्कनेक्ट हो गया');
    });
    // कॉल ऑफर भेजने के लिए
    socket.on('audio-offer', (data) => {
        socket.broadcast.emit('audio-offer', {
            offer: data.offer,
            sender: socket.username
        });
    });

    // कॉल का जवाब (Answer) भेजने के लिए
    socket.on('audio-answer', (data) => {
        socket.broadcast.emit('audio-answer', data.answer);
    });

    // ICE Candidate (नेटवर्क इनफार्मेशन) शेयर करने के लिए
    socket.on('ice-candidate', (candidate) => {
        socket.broadcast.emit('ice-candidate', candidate);
    });

    // कॉल डिस्कनेक्ट करने के लिए
    socket.on('end-call', () => {
        socket.broadcast.emit('end-call');
    });
    // टाइपिंग स्टेटस रिसीव करना और दूसरों को भेजना
    socket.on('typing', (data) => {
        socket.broadcast.emit('user-typing', {
            username: socket.username,
            isTyping: data.isTyping
        });
    });
});

http.listen(PORT, () => {
    console.log(`सर्वर http://localhost:${PORT} पर चल रहा है`);
});