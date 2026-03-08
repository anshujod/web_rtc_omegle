import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const URL = import.meta.env.VITE_SIGNALING_URL || "http://localhost:3000";

export const Room = ({
  name = "",
  localAudioTrack = null,
  localVideoTrack = null,
}: {
  name?: string;
  localAudioTrack?: MediaStreamTrack | null;
  localVideoTrack?: MediaStreamTrack | null;
}) => {
  const [lobby, setLobby] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const senderPcRef = useRef<RTCPeerConnection | null>(null);
  const receiverPcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream>(new MediaStream());
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(localAudioTrack);
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(localVideoTrack);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<string[]>([
    "You are now connected.",
    "Say hi to your stranger.",
  ]);

  useEffect(() => {
    localAudioTrackRef.current = localAudioTrack;
    localVideoTrackRef.current = localVideoTrack;

    const stream = new MediaStream();
    if (localVideoTrack) stream.addTrack(localVideoTrack);
    if (localAudioTrack) stream.addTrack(localAudioTrack);
    localStreamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      void localVideoRef.current.play();
    }
  }, [localAudioTrack, localVideoTrack]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      void remoteVideoRef.current.play();
    }
  }, []);

  useEffect(() => {
    const socket = io(URL);
    socketRef.current = socket;

    socket.on("send-offer", async ({ roomId }: { roomId: string }) => {
      setLobby(false);
      if (senderPcRef.current) return;

      const pc = new RTCPeerConnection();
      senderPcRef.current = pc;

      if (localVideoTrackRef.current) {
        pc.addTrack(localVideoTrackRef.current, localStreamRef.current);
      }
      if (localAudioTrackRef.current) {
        pc.addTrack(localAudioTrackRef.current, localStreamRef.current);
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socketRef.current?.emit("add-ice-candidate", {
          candidate: event.candidate,
          type: "sender",
          roomId,
        });
      };

      pc.ontrack = (event) => {
        if (!remoteStreamRef.current.getTracks().find((t) => t.id === event.track.id)) {
          remoteStreamRef.current.addTrack(event.track);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("offer", { roomId, sdp: offer });
    });

    socket.on(
      "offer",
      async ({ roomId, sdp }: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
        setLobby(false);
        if (receiverPcRef.current) return;

        const pc = new RTCPeerConnection();
        receiverPcRef.current = pc;

        if (localVideoTrackRef.current) {
          pc.addTrack(localVideoTrackRef.current, localStreamRef.current);
        }
        if (localAudioTrackRef.current) {
          pc.addTrack(localAudioTrackRef.current, localStreamRef.current);
        }

        pc.onicecandidate = (event) => {
          if (!event.candidate) return;
          socketRef.current?.emit("add-ice-candidate", {
            candidate: event.candidate,
            type: "receiver",
            roomId,
          });
        };

        pc.ontrack = (event) => {
          if (!remoteStreamRef.current.getTracks().find((t) => t.id === event.track.id)) {
            remoteStreamRef.current.addTrack(event.track);
          }
        };

        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit("answer", { roomId, sdp: answer });
      },
    );

    socket.on("answer", async ({ sdp }: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!senderPcRef.current) return;
      await senderPcRef.current.setRemoteDescription(sdp);
    });

    socket.on(
      "add-ice-candidate",
      async ({
        candidate,
        type,
      }: {
        candidate: RTCIceCandidateInit;
        type: "sender" | "receiver";
      }) => {
        const targetPc = type === "sender" ? receiverPcRef.current : senderPcRef.current;
        if (!targetPc) return;
        await targetPc.addIceCandidate(candidate);
      },
    );

    return () => {
      socket.disconnect();
      senderPcRef.current?.close();
      receiverPcRef.current?.close();
      senderPcRef.current = null;
      receiverPcRef.current = null;
      socketRef.current = null;
      remoteStreamRef.current = new MediaStream();
    };
  }, []);

  return (
    <div className="omegle-shell">
      <header className="omegle-header">
        <div className="brand">
          <span className="brand-mark">ome</span>
          <span className="brand-mark-alt">gle</span>
        </div>
        <div className="brand-tagline">Talk to strangers!</div>
      </header>

      <div className="omegle-main">
        <div className="video-stack">
          <div className="video-panel">
            <div className="panel-label">Stranger</div>
            <div className="video-card">
              <video ref={remoteVideoRef} autoPlay playsInline width={320} height={240} />
            </div>
          </div>
          <div className="video-panel">
            <div className="panel-label">You ({name || "Anonymous"})</div>
            <div className="video-card">
              <video ref={localVideoRef} autoPlay muted playsInline width={320} height={240} />
            </div>
          </div>
        </div>

        <aside className="chat-panel">
          <div className="chat-header">
            {lobby ? "Looking for someone to connect..." : "Connected"}
          </div>
          <div className="chat-list">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className="chat-bubble">
                {msg}
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              value={chatInput}
              placeholder="Type a message..."
              onChange={(e) => {
                setChatInput(e.target.value);
              }}
            />
            <button
              onClick={() => {
                if (!chatInput.trim()) return;
                setChatMessages((prev) => [...prev, `You: ${chatInput.trim()}`]);
                setChatInput("");
              }}
            >
              Send
            </button>
          </div>
          <div className="chat-actions">
            <button>Next Server</button>
            <button>Next</button>
          </div>
        </aside>
      </div>

      <div className="status-line">
        {lobby ? "Waiting in lobby..." : "You are chatting now"}
      </div>
    </div>
  );
};
