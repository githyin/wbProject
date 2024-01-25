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
  let consumerTransports = [];
  let audioProducer;
  let videoProducer;
  // let consumer;
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
  const roomNameRef = useRef(null);
  const streamRef = useRef(null);
  const audioParams = useRef(null);
  const videoParams = useRef({ params });

  // S0.Stream 페이지 처음 랜더링 시
  useEffect(() => {
    socket.current = socketIOClient(MEDIASOUP);

    // S1.소켓 연결 완료 수신
    socket.current.on("connection-success", async ({ socketId: id }) => {
      console.log(`connection-success: ${socketId}`);
      socketId.current = id;
      console.log(`SocketId is ${socketId.current}`);
    });

    return () => {
      socket.current.disconnect();
    };
  }, []);

  // P1.로컬 사용자 스트림 획득
  const goStream = () => {
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
    streamRef.current.srcObject = stream;

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
    joinRoom();
    //device === undefined ? getRtpCapabilities() : goCreateTransport();
  };

  // C2.joinRoom 서버에게 요청
  const joinRoom = () => {
    console.log(`joinRoom, roomName is ${roomNameRef.current.value}`);
    socket.current.emit(
      "joinRoom",
      { roomName: roomNameRef.current.value },
      (data) => {
        console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);

        // getRtoCapabilities
        rtpCapabilities = data.rtpCapabilities;

        createDevice();
      }
    );
    console.log("joinRoom");
  };

  // T2.Device 생성
  const createDevice = async () => {
    try {
      device = new mediasoupClient.Device();

      await device.load({
        routerRtpCapabilities: rtpCapabilities,
      });

      console.log("Device RTP Capabilities", device.rtpCapabilities);

      goCreateTransport();
    } catch (error) {
      console.log(error);
      if (error.name === "UnsupportedError")
        console.warn("browser not supported");
    }
  };

  // T3.생성자, 소비자에 맞는 Transport 생성 함수 호출
  const goCreateTransport = () => {
    isProducer ? createSendTransport() : getProducers();
  };

  // P3.SendTransport 생성 요청, 저장, 수신
  const createSendTransport = () => {
    socket.current.emit(
      "createWebRtcTransport",
      { consumer: false },
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

  const getProducers = () => {
    socket.current.emit("getProducers", (producerIds) => {
      console.log(producerIds);
      // for each of the producer create a consumer
      // producerIds.forEach(id => signalNewConsumerTransport(id))
      producerIds.forEach(signalNewConsumerTransport);
    });
  };

  // C2.RecvTransport 생성 요청, 저장, 수신
  const signalNewConsumerTransport = async (remoteProducerId) => {
    await socket.current.emit(
      "createWebRtcTransport",
      { consumer: true },
      ({ params }) => {
        // The server sends back params needed
        // to create Send Transport on the client side
        if (params.error) {
          console.log(params.error);
          return;
        }
        console.log(`PARAMS... ${params}`);

        let consumerTransport;
        try {
          consumerTransport = device.createRecvTransport(params);
        } catch (error) {
          // exceptions:
          // {InvalidStateError} if not loaded
          // {TypeError} if wrong arguments.
          console.log(error);
          return;
        }

        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-recv-connect', ...)
              await socket.current.emit("transport-recv-connect", {
                dtlsParameters,
                serverConsumerTransportId: params.id,
              });

              // Tell the transport that parameters were transmitted.
              callback();
            } catch (error) {
              // Tell the transport that something was wrong
              errback(error);
            }
          }
        );

        connectRecvTransport(consumerTransport, remoteProducerId, params.id);
      }
    );
  };

  // C3.RecvTrasport 연결
  const connectRecvTransport = async (
    consumerTransport,
    remoteProducerId,
    serverConsumerTransportId
  ) => {
    await socket.current.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
      },
      async ({ params }) => {
        if (params.error) {
          console.log("Cannot Consume");
          return;
        }

        console.log(`Consumer Params ${params}`);
        // then consume with the local consumer transport
        // which creates a consumer
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        consumerTransports = [
          ...consumerTransports,
          {
            consumerTransport,
            serverConsumerTransportId: params.id,
            producerId: remoteProducerId,
            consumer,
          },
        ];

        // create a new div element for the new consumer media
        const newElem = document.createElement("div");
        newElem.setAttribute("id", `td-${remoteProducerId}`);

        if (params.kind === "audio") {
          //append to the audio container
          newElem.innerHTML =
            '<audio id="' +
            remoteProducerId +
            '" autoplay playsInline></audio>';
        } else {
          //append to the video container
          newElem.setAttribute("class", "remoteVideo");
          newElem.innerHTML =
            '<video id="' +
            remoteProducerId +
            '" autoplay playsInline></video>';
        }

        const videoContainer = document.getElementById("videoContainer");

        videoContainer.appendChild(newElem);

        // destructure and retrieve the video track from the producer
        const { track } = consumer;

        document.getElementById(remoteProducerId).srcObject = new MediaStream([
          track,
        ]);

        socket.current.emit("consumer-resume", {
          serverConsumerId: params.serverConsumerId,
        });
      }
    );
  };

  return (
    <>
      <div id="videoContainer"></div>
      <div>
        <video ref={streamRef} autoPlay playsInline></video>
        <input ref={roomNameRef} placeholder="Enter room name" />
        <button onClick={goStream}>Publish</button>
        <button onClick={goConsume}>Consume</button>
      </div>
    </>
  );
}

export default Stream;
