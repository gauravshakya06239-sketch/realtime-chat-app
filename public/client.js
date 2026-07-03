const muteBtn = document.getElementById('muteBtn');
let isMuted = false; // ट्रैक करने के लिए कि माइक म्यूट है या नहीं
const typingStatus = document.getElementById('typingStatus');
let typingTimeout;
const socket = io();

const messageArea = document.getElementById('messageArea');
const sendForm = document.getElementById('sendForm');
const messageInput = document.getElementById('messageInput');

// यूजर से उसका नाम पूछना
let username;
do {
    username = prompt('Enter your name..');
} while(!username);

// सर्वर को बताना कि नया यूजर आया है
socket.emit('new-user-joined', username);

// फॉर्म सबमिट होने पर मैसेज भेजना
sendForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if(msg) {
        // 1. खुद का मैसेज तुरंत स्क्रीन पर दिखाओ (outgoing)
        appendMessage({ username: username, message: msg }, 'outgoing');
        
        // 2. सर्वर को मैसेज भेजो
        socket.emit('send-message', msg);
        
        messageInput.value = ''; // इनपुट बॉक्स खाली करना
    }
});

// मैसेज को स्क्रीन पर दिखाने का फंक्शन
function appendMessage(data, type) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('msg', type);

    // वर्तमान समय (Time) निकालना
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if(type === 'incoming') {
        msgDiv.innerHTML = `<span class="username-tag">${data.username}</span>${data.message}<span class="msg-time">${currentTime}</span>`;
    } else if(type === 'outgoing') {
        msgDiv.innerHTML = `${data.message}<span class="msg-time">${currentTime}</span>`;
    } else {
        msgDiv.innerText = data.message; // सिस्टम मैसेजेस
    }

    messageArea.appendChild(msgDiv);
    messageArea.scrollTop = messageArea.scrollHeight; // ऑटो-स्क्रॉल
}
socket.on('load-old-messages', (messages) => {
    messages.forEach(data => {
        // डेटाबेस से आए यूजरनेम और मैसेज को जोड़कर स्क्रीन पर दिखाना
        const msgData = {
            username: data.username,
            message: `${data.username}: ${data.message}`
        };
        appendMessage(msgData, 'incoming');
    });
});
socket.on('receive-message', (data) => {
    // अगर मैसेज किसी और का है, तभी incoming की तरह दिखाओ
    if(data.username !== username) {
        appendMessage(data, 'incoming');
    }
});

// जब कोई नया यूजर जुड़ता है
socket.on('user-connected', (user) => {
    appendMessage({ message: `🟢 ${user} Added to the chat` }, 'system-msg');
});

socket.on('user-disconnected', (user) => {
    appendMessage({ message: `🔴 ${user} left the chat` }, 'system-msg');
});
// --- ऑडियो कॉल वेरिएबल्स ---
const callBtn = document.getElementById('callBtn');
const hangupBtn = document.getElementById('hangupBtn');
const callStatus = document.getElementById('callStatus');
const remoteAudio = document.getElementById('remoteAudio');

let localStream;
let peerConnection;

// फ्री STUN सर्वर्स (यह दोनों डिवाइसेज के पब्लिक IP ढूंढने में मदद करते हैं)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// 1. माइक का एक्सेस लेना और Peer Connection सेटअप करना
async function setupAudio() {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    
    peerConnection = new RTCPeerConnection(iceServers);
    
    // अपनी ऑडियो स्ट्रीम को कनेक्शन में जोड़ना
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // जब दूसरे यूजर की ऑडियो स्ट्रीम मिले
    peerConnection.ontrack = (event) => {
        remoteAudio.srcObject = event.streams[0];
    };

    // नेटवर्क कैंडिडेट्स को सर्वर के ज़रिए भेजना
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };
}

// 2. कॉल शुरू करना (Call Button Click)
callBtn.addEventListener('click', async () => {
    callStatus.innerText = "📞 Calling";
    callBtn.style.display = 'none';
    hangupBtn.style.display = 'inline-block';
    muteBtn.style.display = 'inline-block'; // यहाँ जोड़ें
    await setupAudio();

    // Offer बनाना
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // सर्वर को ऑफर भेजना
    socket.emit('audio-offer', { offer: offer });
});

// 3. सामने वाले के पास कॉल ऑफर आना
socket.on('audio-offer', async (data) => {
    const accept = confirm(`${data.sender} Rcived a call. Accept?`);
    
    if (accept) {
        callBtn.style.display = 'none';
        hangupBtn.style.display = 'inline-block';
        callStatus.innerText = "🗣️ Call in running";
        muteBtn.style.display = 'inline-block'; // यहाँ जोड़ें 
        await setupAudio();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Answer बनाना
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // सर्ver को Answer भेजना
        socket.emit('audio-answer', { answer: answer });
    }
});

// 4. कॉल का जवाब मिलना
socket.on('audio-answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    callStatus.innerText = "🗣️ Call in progress";
});

// 5. ICE Candidate को रिसीव करना
socket.on('ice-candidate', async (candidate) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

// 6. कॉल काटना (Hangup)
hangupBtn.addEventListener('click', () => {
    stopCall();
    socket.emit('end-call');
});

socket.on('end-call', () => {
    stopCall();
});

function stopCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    callStatus.innerText = "❌ Call Ended";
    callBtn.style.display = 'inline-block';
    hangupBtn.style.display = 'none';
    function stopCall() {
    // ... पुराना कोड जो पहले से था ...
    
    // यह लाइन नीचे जोड़ें
    muteBtn.style.display = 'none';
    muteBtn.innerText = "🎙️ Mute";
    muteBtn.style.background = "#f1c40f";
    isMuted = false;
}
}
// इनपुट बॉक्स पर टाइपिंग इवेंट लगाना
messageInput.addEventListener('input', () => {
    socket.emit('typing', { isTyping: true });

    // अगर यूजर टाइप करना बंद कर दे, तो स्टेटस हटाओ
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', { isTyping: false });
    }, 1000); // 1 सेकंड का डिले
});

// सर्वर से दूसरों का टाइपिंग स्टेटस रिसीव करना
socket.on('user-typing', (data) => {
    if (data.isTyping) {
        typingStatus.innerText = `✍️ ${data.username} Typing`;
    } else {
        typingStatus.innerText = ''; // खाली कर दें
    }
});
// म्यूट/अनम्यूट बटन का इवेंट
muteBtn.addEventListener('click', () => {
    if (localStream) {
        // माइक के ऑडियो ट्रैक को ढूंढना
        const audioTrack = localStream.getAudioTracks()[0];
        
        if (audioTrack) {
            if (!isMuted) {
                audioTrack.enabled = false; // माइक बंद (Mute)
                muteBtn.innerText = "🔇 Unmute";
                muteBtn.style.background = "#299938"; // लाल रंग
                muteBtn.style.color = "white";
                isMuted = true;
            } else {
                audioTrack.enabled = true; // माइक चालू (Unmute)
                muteBtn.innerText = "🎙️ Mute";
                muteBtn.style.background = "#035880"; // पीला रंग
                muteBtn.style.color = "#333";
                isMuted = false;
            }
        }
    }
});