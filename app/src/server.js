import express from "express";
import http from "http";
import { Server } from "socket.io";
import { createWorker } from "mediasoup";
import cors from "cors";
import { instrument } from "@socket.io/admin-ui";
import multer from "multer";
import path from "path"; // path 모듈 추가
import fs from "fs"; // fs 모듈 추가
import net from "net";

//express 인스턴스 생성
const app = express();
const port = 8000;
//const port = process.env.PORT || 8000;

// 파일을 저장할 디렉토리 설정
const uploadDirectory = path.join(__dirname, "uploads"); // 파일 위치를 현재 디렉토리의 uploads로 설정
// multer 설정 (파일 저장 위치 설정)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(uploadDirectory)) {
      fs.mkdirSync(uploadDirectory, { recursive: true });
    }
    cb(null, uploadDirectory);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

// 에러 처리 미들웨어 추가
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// CORS 미들웨어를 모든 라우트에 적용
app.use(
  cors({
    origin: "http://localhost:3000", // 프론트엔드 서버 주소
    credentials: true, // 인증 정보를 포함한 요청 허용
  })
);

// 여러 파일 업로드를 위한 라우트 수정
app.post("/upload", upload.array("files"), (req, res) => {
  if (req.files) {
    console.log("Files received:", req.files);
    return res.json({ message: "Files uploaded successfully." });
  }
  return res.status(400).send("No files uploaded.");
});

//http, io server 생성
const httpserver = http.createServer(app);
const wsServer = new Server(httpserver, {
  cors: {
    origin: ["https://admin.socket.io", "http://localhost:3000"],
    credentials: true,
  },
});

instrument(wsServer, {
  auth: false,
  //   auth: {
  //     type: "basic",
  //     username: process.env.ADMIN_UI_USER,
  //     password: process.env.ADMIN_UI_PASSWORD,
  //   },
});

// mediasoup 관련 설정
let worker;
let rooms = {}; // { roomName1: { Router, peers: [ socketId1, ... ] }, ...}
let peers = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,], producers = [id1, id2,], consumers = [id1, id2,], peerDetails }, ...}
let transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
let producers = []; // [ { socketId1, roomName1, producer, }, ... ]
let consumers = []; // [ { socketId1, roomName1, consumer, }, ... ]

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
  },
];

async function startMediasoup() {
  try {
    // createWorker 함수를 호출합니다.
    worker = await createWorker({
      logLevel: "warn",
      rtcMinPort: 10000,
      rtcMaxPort: 20000,
    });

    console.log(`mediasoup worker pid: ${worker.pid}`);

    worker.on("died", () => {
      console.error("mediasoup worker has died");
      setTimeout(() => process.exit(1), 2000);
    });

    rooms = {};

    // ...여기에 Transport 생성 코드 추가...
  } catch (error) {
    console.error("Error starting mediasoup", error);
  }
}

//socket 통신의 client 생성
// const client = new net.Socket();
// client.connect(12345, "127.0.0.1", function () {
//   console.log("Client connected to AIserver");
// });

//io server connect
wsServer.on("connection", (socket) => {
  console.log(`Client connected ${socket.id}`);

  //----------MEDIASOUP----------
  socket.on("readyForStream", () => {
    socket.emit("readyForStream-success", {
      socketId: socket.id,
    });
  });

  socket.on("joinRoom", async ({ roomName }, callback) => {
    // create Router if it does not exist
    const router = await addPeerToRoom(roomName, socket.id);

    peers[socket.id] = {
      socket,
      roomName, // Name for the Router this Peer joined
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: "",
      },
    };

    // get Router RTP Capabilities
    const rtpCapabilities = router.rtpCapabilities;

    console.log(rtpCapabilities);

    // call callback from the client and send back the rtpCapabilities
    callback({ rtpCapabilities });
  });

  const addPeerToRoom = async (roomName, socketId) => {
    let router;
    let peers = [];
    if (rooms[roomName]) {
      router = rooms[roomName].router;
      peers = rooms[roomName].peers || [];
    } else {
      router = await worker.createRouter({ mediaCodecs });
    }

    console.log(`Router ID: ${router.id}`, peers.length);

    rooms[roomName] = {
      router: router,
      peers: [...peers, socketId],
    };

    return router;
  };

  // Client emits a request to create server side Transport
  // We need to differentiate between the producer and consumer transports
  socket.on("createWebRtcTransport", async ({ consumer }, callback) => {
    // get Room Name from Peer's properties
    const roomName = peers[socket.id].roomName;

    // get Router (Room) object this peer is in based on RoomName
    const router = rooms[roomName].router;

    createWebRtcTransport(router).then(
      (transport) => {
        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });

        // add transport to Peer's properties
        addTransport(transport, roomName, consumer);
      },
      (error) => {
        console.log(error);
      }
    );
  });

  const addTransport = (transport, roomName, consumer) => {
    transports = [
      ...transports,
      { socketId: socket.id, transport, roomName, consumer },
    ];

    peers[socket.id] = {
      ...peers[socket.id],
      transports: [...peers[socket.id].transports, transport.id],
    };
  };

  const addProducer = (producer, roomName) => {
    producers = [...producers, { socketId: socket.id, producer, roomName }];

    peers[socket.id] = {
      ...peers[socket.id],
      producers: [...peers[socket.id].producers, producer.id],
    };
  };

  const addConsumer = (consumer, roomName) => {
    // add the consumer to the consumers list
    consumers = [...consumers, { socketId: socket.id, consumer, roomName }];

    // add the consumer id to the peers list
    peers[socket.id] = {
      ...peers[socket.id],
      consumers: [...peers[socket.id].consumers, consumer.id],
    };
  };

  // see client's socket.emit('transport-produce', ...)
  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, appData }, callback) => {
      // call produce based on the prameters from the client
      const producer = await getTransport(socket.id).produce({
        kind,
        rtpParameters,
      });

      // add producer to the producers array
      const { roomName } = peers[socket.id];

      addProducer(producer, roomName);

      informConsumers(roomName, socket.id, producer.id);

      console.log("Producer ID: ", producer.id, producer.kind);

      producer.on("transportclose", () => {
        console.log("transport for this producer closed ");
        producer.close();
      });

      // Send back to the client the Producer's id
      callback({
        id: producer.id,
        producersExist: producers.length > 1 ? true : false,
      });
    }
  );

  // see client's socket.emit('transport-recv-connect', ...)
  socket.on(
    "transport-recv-connect",
    async ({ dtlsParameters, serverConsumerTransportId }) => {
      console.log(`DTLS PARAMS: ${dtlsParameters}`);
      const consumerTransport = transports.find(
        (transportData) =>
          transportData.consumer &&
          transportData.transport.id == serverConsumerTransportId
      ).transport;
      await consumerTransport.connect({ dtlsParameters });
    }
  );

  socket.on(
    "consume",
    async (
      { rtpCapabilities, remoteProducerId, serverConsumerTransportId },
      callback
    ) => {
      try {
        const { roomName } = peers[socket.id];
        const router = rooms[roomName].router;
        let consumerTransport = transports.find(
          (transportData) =>
            transportData.consumer &&
            transportData.transport.id == serverConsumerTransportId
        ).transport;

        // check if the router can consume the specified producer
        if (
          router.canConsume({
            producerId: remoteProducerId,
            rtpCapabilities,
          })
        ) {
          // transport can now consume and return a consumer
          const consumer = await consumerTransport.consume({
            producerId: remoteProducerId,
            rtpCapabilities,
            paused: true,
          });

          consumer.on("transportclose", () => {
            console.log("transport close from consumer");
          });
          consumer.on("producerclose", () => {
            console.log("producer of consumer closed");
            socket.emit("producer-closed", { remoteProducerId });

            consumerTransport.close([]);
            transports = transports.filter(
              (transportData) =>
                transportData.transport.id !== consumerTransport.id
            );
            consumer.close();
            consumers = consumers.filter(
              (consumerData) => consumerData.consumer.id !== consumer.id
            );
          });

          addConsumer(consumer, roomName);

          // from the consumer extract the following params
          // to send back to the Client
          const params = {
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
          };

          // send the parameters to the client
          callback({ params });
        }
      } catch (error) {
        console.log(error.message);
        callback({
          params: {
            error: error,
          },
        });
      }
    }
  );

  socket.on("consumer-resume", async ({ serverConsumerId }) => {
    console.log("consumer resume");
    const consumer = consumers.find(
      (consumerData) => consumerData.consumer.id === serverConsumerId
    );
    await consumer.resume();
  });

  //----------AI CHAT----------
  socket.on("join chat room", (roomName) => {
    console.log(`Client: ${socket.id} joined room ${roomName}`);
    socket.join(roomName);
  });

  socket.on("chat message", (roomName, msg) => {
    try {
      console.log(`Message received: ${msg}`);
      wsServer.to(roomName).emit("chat message", msg);
    } catch (error) {
      console.error(`Error: ${error}`);
    }
  });

  socket.on("leave chat room", (roomName) => {
    console.log(`Client: ${socket.id} left room ${roomName}`);
    socket.leave(roomName);
  });

  //----------socket.io disconnect----------
  const removeItems = (items, socketId, type) => {
    items.forEach((item) => {
      if (item.socketId === socket.id) {
        item[type].close();
      }
    });
    items = items.filter((item) => item.socketId !== socket.id);

    return items;
  };

  socket.on("disconnect", () => {
    console.log(`Client disconnected ${socket.id}`);
    // 먼저 해당 소켓 ID와 연결된 리소스가 있는지 확인합니다.
    if (peers[socket.id]) {
      // 리소스가 있는 경우에만 정리합니다.
      consumers = removeItems(consumers, socket.id, "consumer");
      producers = removeItems(producers, socket.id, "producer");
      transports = removeItems(transports, socket.id, "transport");

      const { roomName } = peers[socket.id]; // 해당 소켓 ID와 연결된 방 정보를 가져옵니다.
      delete peers[socket.id]; // 소켓 ID와 연관된 정보를 peers 객체에서 삭제합니다.

      if (rooms[roomName]) {
        rooms[roomName] = {
          router: rooms[roomName].router,
          // 방에서 해당 소켓 ID를 제거합니다.
          peers: rooms[roomName].peers.filter((peerId) => peerId !== socket.id),
        };
      }
    }
  });
});

const createWebRtcTransport = async (router) => {
  return new Promise(async (resolve, reject) => {
    try {
      // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
      const webRtcTransport_options = {
        listenIps: [
          {
            ip: "127.0.0.1",
            //ip: "0.0.0.0", // replace with relevant IP address
            //announcedIp: "127.0.0.1", //"10.0.0.115",
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      };

      // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
      let transport = await router.createWebRtcTransport(
        webRtcTransport_options
      );
      console.log(`transport id: ${transport.id}`);

      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          transport.close();
        }
      });

      transport.on("close", () => {
        console.log("transport closed");
      });

      resolve(transport);
    } catch (error) {
      reject(error);
    }
  });
};

//start mediasoup
startMediasoup()
  .then(() => {
    const handleListen = () =>
      console.log(`Listening on http://localhost:${port}`);
    //httpserver listen
    httpserver.listen(port, handleListen);
  })
  .catch((error) => {
    console.error("Error starting mediasoup", error);
  });
