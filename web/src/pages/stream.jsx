import React, { useEffect, useState, useRef } from "react";
import socketIOClient from "socket.io-client";
import mediasoupClient from "mediasoup-client";

const MEDIASOUP = "http://localhost:8000/mediasoup";

function App() {
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [params, setParams] = useState({
    encodings: [
      {
        rid: "r0",
        maxBitrate: 100000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r1",
        maxBitrate: 300000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r2",
        maxBitrate: 900000,
        scalabilityMode: "S1T3",
      },
    ],
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  });

  const [localVideoStream, setLocalVideoStream] = useState(null);
  const remoteVideoRef = useRef(null);
  // const deviceRef = useRef(null);

  useEffect(() => {
    const socketIo = socketIOClient(MEDIASOUP);
    setSocket(socketIo);

    socketIo.emit("readyForStream");

    socketIo.on("readyForStream-success", ({ socketId }) => {
      console.log(`Connected with Socket ID: ${socketId}`);
      setSocketId(socketId);
      getLocalStream();
    });

    return () => {
      socketIo.disconnect();
    };
  }, [socket, socketId]);

  useEffect(() => {
    if (localVideoStream) {
      const track = localVideoStream.getVideoTracks()[0];
      setParams((prevParams) => ({ ...prevParams, track }));
    }
  }, [localVideoStream]);

  const getLocalStream = () => {
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          width: {
            min: 640,
            max: 1920,
          },
          height: {
            min: 400,
            max: 1080,
          },
        },
      })
      .then((stream) => {
        setLocalVideoStream(stream);
      })
      .catch((error) => {
        console.log(error.message);
      });
  };

  // const createDevice = async () => {
  //   try {
  //     const newDevice = new mediasoupClient.Device();
  //     await newDevice.load({
  //       routerRtpCapabilities: await getRtpCapabilities(),
  //     });
  //     deviceRef.current = newDevice;
  //     console.log("RTP Capabilities", deviceRef.current.rtpCapabilities);
  //   } catch (error) {
  //     console.log(error);
  //     if (error.name === "UnsupportedError") {
  //       console.warn("browser not supported");
  //     }
  //   }
  // };

  return (
    <div>
      <div>
        <button onClick={getLocalStream}>Get Local Stream</button>
        {/* <button onClick={getRtpCapabilities}>Get RTP Capabilities</button> */}
        <button onClick={createDevice}>Create Device</button>
        {/* <button onClick={createSendTransport}>Create Send Transport</button>
        <button onClick={connectSendTransport}>Connect Send Transport</button> */}
        {/* Add other buttons and components as needed */}
      </div>
      <div ref={remoteVideoRef}></div>
    </div>
  );
}

export default App;
