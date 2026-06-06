const startShare = document.querySelector("#startShare");
const stopShare = document.querySelector("#stopShare");
const senderStatus = document.querySelector("#senderStatus");
const localPreview = document.querySelector("#localPreview");
const streamToken = new URL(location.href).searchParams.get("token") || "";

let peer = null;
let localStream = null;

function setStatus(text) {
  senderStatus.textContent = text;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function waitForIceComplete(connection) {
  if (connection.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 3000);
    const handleChange = () => {
      if (connection.iceGatheringState !== "complete") return;
      clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    };

    connection.addEventListener("icegatheringstatechange", handleChange);
  });
}

async function pollForAnswer(connection) {
  while (peer === connection && !connection.currentRemoteDescription) {
    const data = await post("/api/stream/read-answer", { token: streamToken });
    if (peer !== connection) return;
    if (data.answer) {
      await connection.setRemoteDescription(data.answer);
      setStatus("streaming");
      return;
    }

    await delay(700);
  }
}

async function stopStreaming({ notify = true, status = "stopped" } = {}) {
  if (localStream) {
    for (const track of localStream.getTracks()) track.stop();
    localStream = null;
  }

  if (peer) {
    peer.close();
    peer = null;
  }

  localPreview.srcObject = null;
  startShare.disabled = false;
  stopShare.disabled = true;
  setStatus(status);

  if (notify && streamToken) {
    await post("/api/stream/stop-sender", { token: streamToken }).catch(() => {});
  }
}

async function startStreaming() {
  if (!streamToken) {
    setStatus("missing token");
    return;
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStatus("screen sharing unavailable");
    return;
  }

  startShare.disabled = true;
  stopShare.disabled = false;
  setStatus("choose screen");

  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 30 },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    localPreview.srcObject = localStream;
    peer = new RTCPeerConnection({ iceServers: [] });
    peer.addEventListener("connectionstatechange", () => {
      if (!peer) return;
      setStatus(peer.connectionState);
    });

    for (const track of localStream.getTracks()) {
      track.addEventListener("ended", () => {
        void stopStreaming();
      });
      peer.addTrack(track, localStream);
    }

    setStatus("creating offer");
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceComplete(peer);
    await post("/api/stream/publish-offer", {
      token: streamToken,
      offer: peer.localDescription
    });

    setStatus("waiting for phone");
    const activePeer = peer;
    void pollForAnswer(activePeer).catch((error) => {
      if (peer !== activePeer) return;
      console.error(error);
      setStatus(error.message);
    });
  } catch (error) {
    console.error(error);
    await stopStreaming({ notify: true, status: error.message });
  }
}

startShare.addEventListener("click", () => {
  void startStreaming();
});

stopShare.addEventListener("click", () => {
  void stopStreaming();
});
