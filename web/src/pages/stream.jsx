import React, { useEffect, useState, useRef } from "react";
import mediasoupClient from "mediasoup-client";

const Stream = ({ socket }) => {
  const [device, setDevice] = useState(null);
  const [producerTransport, setProducerTransport] = useState(null);
  const [audioProducer, setAudioProducer] = useState(null);
  const [videoProducer, setVideoProducer] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [rtpCapabilities, setRtpCapabilities] = useState(null);
  const [roomName, setRoomName] = useState("aaa");

  const videoContainer = useRef(null);
  const consumerTransports = useRef([]);

  useEffect(() => {
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
      codecOptions: {
        videoGoogleStartBitrate: 1000,
      },
    };
    // 소켓 이벤트 리스너 설정
    socket.emit("readyForStream");

    socket.on("readyForStream-success", async ({ socketId }) => {
      console.log(`Connected with Socket ID: ${socketId}`);
      setSocketId(socketId);
      getLocalStream();
    });

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

    let audioParams;
    let videoParams = { params };
    let consumingTransports = [];

    // Create a video element for local video
    const localVideo = document.createElement("video");
    localVideo.setAttribute("id", socketId);
    localVideo.setAttribute("autoPlay", true);
    localVideo.setAttribute("className", "localVideo");
    videoContainer.current.appendChild(localVideo);

    const streamSuccess = (stream) => {
      localVideo.srcObject = stream;

      audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
      videoParams = { track: stream.getVideoTracks()[0], ...videoParams };

      joinRoom();
    };

    const joinRoom = () => {
      socket.emit("joinRoom", { roomName }, (data) => {
        console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
        // we assign to local variable and will be used when
        // loading the client Device (see createDevice above)
        setRtpCapabilities(data.rtpCapabilities);

        // once we have rtpCapabilities from the Router, create Device
        createDevice();
      });
    };

    const createDevice = async () => {
      try {
        setDevice(mediasoupClient.Device());

        // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
        // Loads the device with RTP capabilities of the Router (server side)
        await device.load({
          // see getRtpCapabilities() below
          routerRtpCapabilities: rtpCapabilities,
        });

        console.log("Device RTP Capabilities", device.rtpCapabilities);

        // once the device loads, create transport
        createSendTransport();
      } catch (error) {
        console.log(error);
        if (error.name === "UnsupportedError")
          console.warn("browser not supported");
      }
    };

    const createSendTransport = () => {
      socket.emit(
        "createWebRtcTransport",
        { consumer: false },
        ({ params }) => {
          // The server sends back params needed
          // to create Send Transport on the client side
          if (params.error) {
            console.log(params.error);
            return;
          }

          console.log(params);

          // creates a new WebRTC Transport to send media
          // based on the server's producer transport params
          // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
          setProducerTransport(device.createSendTransport(params));

          // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
          // this event is raised when a first call to transport.produce() is made
          // see connectSendTransport() below
          producerTransport.on(
            "connect",
            async ({ dtlsParameters }, callback, errback) => {
              try {
                // Signal local DTLS parameters to the server side transport
                // see server's socket.on('transport-connect', ...)
                await socket.emit("transport-connect", {
                  dtlsParameters,
                });

                // Tell the transport that parameters were transmitted.
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
                // tell the server to create a Producer
                // with the following parameters and produce
                // and expect back a server side producer id
                // see server's socket.on('transport-produce', ...)
                await socket.emit(
                  "transport-produce",
                  {
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    appData: parameters.appData,
                  },
                  ({ id, producersExist }) => {
                    // Tell the transport that parameters were transmitted and provide it with the
                    // server side producer's id.
                    callback({ id });

                    // if producers exist, then join room
                    if (producersExist) getProducers();
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

    const connectSendTransport = async () => {
      // we now call produce() to instruct the producer transport
      // to send media to the Router
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
      // this action will trigger the 'connect' and 'produce' events above

      setAudioProducer(await producerTransport.produce(audioParams));
      setVideoProducer(await producerTransport.produce(videoParams));

      audioProducer.on("trackended", () => {
        console.log("audio track ended");

        // close audio track
      });

      audioProducer.on("transportclose", () => {
        console.log("audio transport ended");

        // close audio track
      });

      videoProducer.on("trackended", () => {
        console.log("video track ended");

        // close video track
      });

      videoProducer.on("transportclose", () => {
        console.log("video transport ended");

        // close video track
      });
    };

    // server informs the client of a new producer just joined
    socket.on("new-producer", ({ producerId }) =>
      signalNewConsumerTransport(producerId)
    );

    const getProducers = () => {
      socket.emit("getProducers", (producerIds) => {
        console.log("중요해.. producerIds...", producerIds);
        // for each of the producer create a consumer
        producerIds.forEach((id) => {
          console.log("얍!", id);
          signalNewConsumerTransport(id[0], id[1]);
        }); //아래 코드랑 똑같은 의미!
        // producerIds.forEach(signalNewConsumerTransport)
      });
    };

    const signalNewConsumerTransport = async (remoteProducerId) => {
      //check if we are already consuming the remoteProducerId
      if (consumingTransports.includes(remoteProducerId)) return;
      consumingTransports.push(remoteProducerId);

      await socket.emit(
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
                await socket.emit("transport-recv-connect", {
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

    const connectRecvTransport = async (
      consumerTransport,
      remoteProducerId,
      serverConsumerTransportId
    ) => {
      // for consumer, we need to tell the server first
      // to create a consumer based on the rtpCapabilities and consume
      // if the router can consume, it will send back a set of params as below
      await socket.emit(
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

          consumerTransports.current = [
            ...consumerTransports.current,
            {
              consumerTransport,
              serverConsumerTransportId: params.id,
              producerId: remoteProducerId,
              consumer,
            },
          ];

          // create a new div element for the new consumer media
          // create a new div element for the new consumer media
          const newElem = document.createElement("div");
          newElem.setAttribute("id", `td-${remoteProducerId}`);

          if (params.kind === "audio") {
            // You can customize audio UI if needed
            // newElem.innerHTML = '<audio id="' + remoteProducerId + '" autoplay></audio>';
          } else {
            // Append to the video container
            newElem.setAttribute("class", "remoteVideo");
            newElem.innerHTML = `<video id="${remoteProducerId}" autoplay class="video"></video>`;
          }

          videoContainer.current.appendChild(newElem);

          // destructure and retrieve the video track from the producer
          const { track } = consumer;

          document.getElementById(remoteProducerId).srcObject = new MediaStream(
            [track]
          );

          // the server consumer started with media paused
          // so we need to inform the server to resume
          socket.emit("consumer-resume", {
            serverConsumerId: params.serverConsumerId,
          });
        }
      );
    };

    socket.on("producer-closed", ({ remoteProducerId }) => {
      // server notification is received when a producer is closed
      // we need to close the client-side consumer and associated transport
      const producerToClose = consumerTransports.find(
        (transportData) => transportData.producerId === remoteProducerId
      );
      producerToClose.consumerTransport.close();
      producerToClose.consumer.close();

      // remove the consumer transport from the list
      consumerTransports.current = consumerTransports.filter(
        (transportData) => transportData.producerId !== remoteProducerId
      );

      // remove the video div element
      videoContainer.removeChild(
        document.getElementById(`td-${remoteProducerId}`)
      );
    });

    // 컴포넌트 언마운트 시 이벤트 리스너 해제
    return () => {
      socket.off("readyForStream-success");
    };
  }, []);

  // TODO: Implement other methods as needed

  return (
    <div>
      {/* Render your stream components here */}
      <div ref={videoContainer}></div>
    </div>
  );
};

export default Stream;