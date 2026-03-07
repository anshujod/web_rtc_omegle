import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const URL = "http://localhost:3000";

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
    <div>
      <div>{lobby ? "Looking for someone to connect..." : `Connected as ${name}`}</div>
      <div style={{ display: "flex", gap: "16px", marginTop: "12px" }}>
        <video ref={localVideoRef} autoPlay muted playsInline width={320} height={240} />
        <video ref={remoteVideoRef} autoPlay playsInline width={320} height={240} />
      </div>
    </div>
  );
};
