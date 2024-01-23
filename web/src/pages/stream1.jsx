import React, { useEffect, useState, useRef, useCallback } from "react";
import socketIOClient from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

const MEDIASOUP = "http://localhost:8000/mediasoup";

function Stream() {
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState(null);

  let device;
  let rtpCapabilities;
  let producerTransport;
  let consumerTransport;
  let audioProducer;
  let videoProducer;
  let consumer;

  let params = {
    // mediasoup params
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
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  };

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const audioParams = useRef(null);
  const videoParams = useRef({ params });

  // 4.로컬 비디오 엘리먼트에 획득한 로컬 사용자 스트림 대입
  const streamSuccess = useCallback(
    (stream) => {
      localVideoRef.current.srcObject = stream;

      audioParams.current = {
        track: stream.getAudioTracks()[0],
        ...audioParams.current,
      };
      videoParams.current = {
        track: stream.getVideoTracks()[0],
        ...videoParams.current,
      };

      // joinRoom();
    },
    [audioParams, videoParams]
  );

  // 3.로컬 사용자 스트림 획득
  const getLocalStream = useCallback(() => {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
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
      .then(streamSuccess)
      .catch((error) => {
        console.log(error.message);
      });
  }, [streamSuccess]);

  useEffect(() => {
    const socketIo = socketIOClient(MEDIASOUP);
    setSocket(socketIo);

    // 2.스트림 준비 완료 수신
    socketIo.on("connection-success", async ({ socketId }) => {
      console.log(`Connected with Socket ID: ${socketId}`);
      setSocketId(socketId);

      // 3.로컬 사용자 스트림 획득
      //getLocalStream();
    });

    return () => {
      socketIo.disconnect();
    };
  }, [getLocalStream]);

  // Device 생성
  const createDevice = async () => {
    try {
      device = new mediasoupClient.Device();

      await device.load({
        routerRtpCapabilities: rtpCapabilities,
      });

      console.log("RTP Capabilities", device.rtpCapabilities);
    } catch (error) {
      console.log(error);
      if (error.name === "UnsupportedError")
        console.warn("browser not supported");
    }
  };

  // RtpCapabilities 서버에게 요청
  const getRtpCapabilities = () => {
    socket.emit("getRtpCapabilities", (data) => {
      console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);

      rtpCapabilities = data.rtpCapabilities;
    });
  };

  const createSendTransport = () => {
    socket.emit("createWebRtcTransport", { sender: true }, ({ params }) => {
      if (params.error) {
        console.log(params.error);
        return;
      }

      console.log(params);

      producerTransport = device.createSendTransport(params);

      producerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            await socket.emit("transport-connect", {
              //transportId: producerTransport.id,
              dtlsParameters: dtlsParameters,
            });

            callback();
          } catch (error) {
            errback(error);
          }
        }
      );

      producerTransport.on("produce", async (parameters, callback, errback) => {
        console.log(parameters);

        try {
          await socket.emit(
            "transport-produce",
            {
              //   transportId: producerTransport.id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData,
            },
            ({ id }) => {
              callback({ id });
            }
          );
        } catch (error) {
          errback(error);
        }
      });
    });
  };

  const connectSendTransport = async () => {
    try {
      audioProducer = await producerTransport.produce(audioParams.current);
      videoProducer = await producerTransport.produce(videoParams.current);
      audioProducer.on("trackended", () => {
        console.log("track ended");
      });
      videoProducer.on("trackended", () => {
        console.log("track ended");
      });
    } catch (error) {
      console.error("Error producing:", error);
    }
  };

  const createRecvTransport = async () => {
    await socket.emit(
      "createWebRtcTransport",
      { sender: false },
      ({ params }) => {
        if (params.error) {
          console.log(params.error);
          return;
        }

        console.log(params);

        consumerTransport = device.createRecvTransport(params);

        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              await socket.emit("transport-recv-connect", {
                // transportId: consumerTransport.id,
                dtlsParameters,
              });

              callback();
            } catch (error) {
              errback(error);
            }
          }
        );
      }
    );
  };

  const connectRecvTransport = async () => {
    // for consumer, we need to tell the server first
    // to create a consumer based on the rtpCapabilities and consume
    // if the router can consume, it will send back a set of params as below
    await socket.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
      },
      async ({ params }) => {
        if (params.error) {
          console.log("Cannot Consume");
          return;
        }

        console.log(params);
        consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        const { track } = consumer;

        remoteVideoRef.current.srcObject = new MediaStream([track]);

        socket.emit("consumer-resume");
      }
    );
  };

  return (
    <div>
      {/* 로컬 비디오 UI */}
      <video ref={localVideoRef} autoPlay playsInline></video>
      <video ref={remoteVideoRef} autoPlay playsInline></video>
      {/* 3.로컬 사용자 스트림 획득 */}
      <button onClick={getLocalStream} id="btnPublish">
        getLocalStream
      </button>
      <button onClick={getRtpCapabilities}>getRtpCapabilities</button>
      <button onClick={createDevice}>createDevice</button>
      <button onClick={createSendTransport}>createSendTransport</button>
      <button onClick={connectSendTransport}>connectSendTransport</button>
      <button onClick={createRecvTransport}>createRecvTransport</button>
      <button onClick={connectRecvTransport}>connectRecvTransport</button>
    </div>
  );
}

export default Stream;
