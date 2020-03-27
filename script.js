// Generate random room name if needed
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);

const clientId = Math.floor(Math.random() * 0xFFFFFF).toString(16);
let rtcStarted = false;


const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let pc;

const socket = new WebSocket("ws://127.0.0.1:6789/");
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  // console.log(data)
  if (data.type === 'users' && !rtcStarted) {
    const isOfferer = data.count === 2;
    console.log("STARTING WEB RTC")
    startWebRTC(isOfferer);
    rtcStarted = true;
  }
});
socket.addEventListener('open', () => {
  socket.send(JSON.stringify({action: 'subscribe', room: roomHash}))
});
socket.addEventListener('close', () => {
  console.log("Websocket connection closed.")
});


function onSuccess() {};
function onError(error) {
  console.error(error);
};

function sendMessage(message) {
  socket.send(JSON.stringify({
    action: 'publish',
    room: roomHash,
    clientId: clientId,
    ...message
  }));
}

function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);

  console.log("YOLO")

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({'candidate': event.candidate});
    }
  };

  // If user is offerer let the 'negotiationneeded' event create the offer
  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
    }
  }

  // When a remote stream arrives display it in the #remoteVideo element
  pc.ontrack = event => {
    const stream = event.streams[0];
    if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
      remoteVideo.srcObject = stream;
    }
  };

  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  }).then(stream => {
    // Display your local video in #localVideo element
    localVideo.srcObject = stream;
    // Add your stream to be sent to the conneting peer
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  }, onError);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log(data)
    if (data.type === 'data') {
      if (data.clientId === clientId) {
        return;
      }

      if (data.sdp) {
        console.log("SDP")
        // This is called after receiving an offer or answer from another peer
        pc.setRemoteDescription(new RTCSessionDescription(data.sdp), () => {
          // When receiving an offer lets answer it
          if (pc.remoteDescription.type === 'offer') {
            pc.createAnswer().then(localDescCreated).catch(onError);
          }
        }, onError);
      } else if (data.candidate) {
        console.log("CANDIDATE")
        // Add the new ICE candidate to our connections remote description
        pc.addIceCandidate(
          new RTCIceCandidate(data.candidate), onSuccess, onError
        );
      }
    }
  };
}

function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pc.localDescription}),
    onError
  );
}
