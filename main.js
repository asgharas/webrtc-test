// ice
const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
    ],
    iceCandidatePoolSize: 10,
};

// generate 16 length long alpha numeric id using crypto

function toTitleCase(str) {
  return str.replace(/(?:^|\s)\w/g, function(match) {
    return match.toUpperCase();
  });
}

const generateUUID = () => {
    const crypto = window.crypto || window.Crypto;
    const buffer = new Uint16Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0].toString(16);
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;
let currentCallId = null;
const userId = generateUUID(); 

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
webcamVideo.muted = true;
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');



// 1. Setup media sources

webcamButton.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    remoteStream = new MediaStream();

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            console.log("Track added: ", track);
            
            remoteStream.addTrack(track);
        });
    };

    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
    const callId = generateUUID();
    callInput.value = callId
    currentCallId = callId;

    // Get candidates for caller, save to db
    pc.onicecandidate = (event) => {
        console.log("ICE Candidate generated: ", event.candidate);
        event.candidate && saveCandidate({ "userId": userId, "callId": callId, "type": "offer", "candidate": event.candidate.toJSON() });
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
        sdp: offerDescription.sdp,
        type: toTitleCase(offerDescription.type),
    };

    await createCall({ "callId": currentCallId, "offer": offer });

    hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
    const callId = callInput.value;
    currentCallId = callId;

    pc.onicecandidate = (event) => {
        console.log("ICE Candidate generated: ", event.candidate);
        event.candidate && saveCandidate({ "userId": userId, "callId": callId, "type": "answer", "candidate": event.candidate.toJSON() });
    };

    getCallData(callId);

};



// socket io
const socket = io('https://chatmy.ai/', {
  transports: ['websocket'],
  query: {"userId": userId}
});

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

// listen for answer
socket.on('answer', (data) => {
    console.log("Answer: ", data);
    pc.setRemoteDescription(new RTCSessionDescription(data));
});

// listen for new ice candidate
socket.on('candidate', (data) => {
    console.log("Candidate received: ", data);
    
    pc.addIceCandidate(new RTCIceCandidate(data));
});

// listen for call data

socket.on('callData', async (data) => {
    data = { "offer": { "sdp": data.offer.sdp, "type": data.offer.type.toLowerCase() } };
    console.log("Call Data: ", data);
    const offer = data.offer;
    pc.setRemoteDescription(new RTCSessionDescription(offer));

    const localDescription = await pc.createAnswer();
    pc.setLocalDescription(localDescription);

    const answer = {
        type: localDescription.type,
        sdp: localDescription.sdp,
    };

    console.log("Answer: ", answer);

    addAnswerToCall({ "callId": currentCallId, "answer": answer });
    getOfferCandidates(currentCallId);
});

socket.on('offerCandidates', (data) => {
    console.log("Offer Candidates: ", data);
    data.forEach(candidate => {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
    });
});


// api calls

// save candidate
const saveCandidate = async (candidate) => {
    if(socket.connected){
        socket.emit('createCandidate', candidate);
    }
}

// creae call
const createCall = async (call) => {
     // check if socket is connected
    if(socket.connected){
        socket.emit('createCall', call);
    }
}

// get call data
const getCallData = async (callId) => {
    if(socket.connected){
        socket.emit('getCallData', { "callId": callId });
    }
}

const getOfferCandidates = async (callId) => {
    if(socket.connected){
        socket.emit('getOfferCandidates', { "callId": callId });
    }
}

// add answer to call
const addAnswerToCall = async (answer) => {
    if(socket.connected){
        socket.emit('addAnswer', answer);
    } else {
        // show error by alert
        alert("Error answering call: Socket not connected");
    }
}
