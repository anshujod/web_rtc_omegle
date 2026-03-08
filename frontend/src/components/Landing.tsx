import { useState, useRef, useEffect } from "react";
import { Room } from "./Room.tsx";

export const Landing = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState("");
  const [localAudioTrack, setLocalAudioTrack] =
    useState<MediaStreamTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] =
    useState<MediaStreamTrack | null>(null);

  const getCam = async () => {
    const stream = await window.navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    // asking cam and audio perms

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];
    setLocalAudioTrack(audioTrack);
    setLocalVideoTrack(videoTrack);

    if (!videoRef.current) {
      return;
    }
    videoRef.current.srcObject = new MediaStream([videoTrack]);
    videoRef.current.play();
  };

  useEffect(() => {
    if (videoRef && videoRef.current) {
      getCam();
    }
  }, []);

  if (!joined) {
    return (
      <div className="omegle-shell">
        <header className="omegle-header">
          <div className="brand">
            <span className="brand-mark">ome</span>
            <span className="brand-mark-alt">gle</span>
          </div>
          <div className="brand-tagline">Talk to strangers!</div>
        </header>

        <div className="landing-card">
          <div className="title">Preview and Join</div>
          <div className="video-card">
            <video autoPlay muted ref={videoRef}></video>
          </div>
          <div className="controls">
            <input
              type="text"
              placeholder="Enter your name"
              onChange={(e) => {
                setName(e.target.value);
              }}
            ></input>
            <button
              onClick={() => {
                setJoined(true);
              }}
            >
              Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Room
      name={name}
      localAudioTrack={localAudioTrack}
      localVideoTrack={localVideoTrack}
    />
  );
};
