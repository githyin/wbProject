import React, { useEffect, useRef } from "react";
import socketIOClient from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

const MEDIASOUP = "http://localhost:8000/mediasoup";

function Stream() {
  // socket 관련
  const socket = useRef();
  const socketId = useRef();

  // mediasoup 관련
  let device;
  let rtpCapabilities;
  let producerTransport;
  let consumerTransport;
  let audioProducer;
  let videoProducer;
  let consumer;
  let isProducer = false;

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

  // stream 관련
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const audioParams = useRef(null);
  const videoParams = useRef({ params });

  // S0.Stream 페이지 처음 랜더링 시
  useEffect(() => {
    socket.current = socketIOClient(MEDIASOUP);

    // S1.소켓 연결 완료 수신
    socket.current.on(
      "connection-success",
      async ({ socketId: id, existsProducer }) => {
        console.log(`connection-success: ${socketId}, ${existsProducer}`);
        socketId.current = id;
        console.log(`SocketId is ${socketId.current}`);
      }
    );

    return () => {
      socket.current.disconnect();
    };
  }, []);

  // P1.로컬 사용자 스트림 획득
  const getLocalStream = () => {
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
  };

  // P2.로컬 비디오 엘리먼트에 획득한 로컬 사용자 스트림 대입
  const streamSuccess = (stream) => {
    localVideoRef.current.srcObject = stream;

    audioParams.current = {
      track: stream.getAudioTracks()[0],
      ...audioParams.current,
    };
    videoParams.current = {
      track: stream.getVideoTracks()[0],
      ...videoParams.current,
    };

    goConnect(true);
  };

  // C1.소비자인 상태로 goConnect 호출
  const goConsume = () => {
    goConnect(false);
  };

  // T1.생산자인지 소비자인지 판단
  const goConnect = (producerOrConsumer) => {
    isProducer = producerOrConsumer;
    device === undefined ? getRtpCapabilities() : goCreateTransport();
  };

  // T2.RtpCapabilities 서버에게 요청
  const getRtpCapabilities = () => {
    socket.current.emit("createRoom", (data) => {
      console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);

      rtpCapabilities = data.rtpCapabilities;

      createDevice();
    });
    console.log("getRtpCapabilities");
  };

  // T3.Device 생성
  const createDevice = async () => {
    try {
      device = new mediasoupClient.Device();

      await device.load({
        routerRtpCapabilities: rtpCapabilities,
      });

      console.log("RTP Capabilities", device.rtpCapabilities);

      goCreateTransport();
    } catch (error) {
      console.log(error);
      if (error.name === "UnsupportedError")
        console.warn("browser not supported");
    }
  };

  // T4.생성자, 소비자에 맞는 Transport 생성 함수 호출
  const goCreateTransport = () => {
    isProducer ? createSendTransport() : createRecvTransport();
  };

  // P3.SendTransport 생성 요청, 저장, 수신
  const createSendTransport = () => {
    socket.current.emit(
      "createWebRtcTransport",
      { sender: true },
      ({ params }) => {
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
              await socket.current.emit("transport-connect", {
                //transportId: producerTransport.id,
                dtlsParameters: dtlsParameters,
              });

              callback();
            } catch (error) {
              errback(error);
            }
          }
        );

        producerTransport.on(
          "produce",
          async (parameters, callback, errback) => {
            console.log(parameters);

            try {
              await socket.current.emit(
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
          }
        );

        connectSendTransport();
      }
    );
  };

  // P4.SendTrasport 연결
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

  // C2.RecvTransport 생성 요청, 저장, 수신
  const createRecvTransport = async () => {
    await socket.current.emit(
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
              await socket.current.emit("transport-recv-connect", {
                // transportId: consumerTransport.id,
                dtlsParameters,
              });

              callback();
            } catch (error) {
              errback(error);
            }
          }
        );

        connectRecvTransport();
      }
    );
  };

  // C3.RecvTrasport 연결
  const connectRecvTransport = async () => {
    await socket.current.emit(
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

        socket.current.emit("consumer-resume");
      }
    );
  };

  return (
    <div>
      {/* 로컬 비디오 UI */}
      <video ref={localVideoRef} autoPlay playsInline></video>
      <video ref={remoteVideoRef} autoPlay playsInline></video>
      {/* 스트림 관련 */}
      <button onClick={getLocalStream}>Publish</button>
      <button onClick={goConsume}>Consume</button>
    </div>
  );
}

export default Stream;
