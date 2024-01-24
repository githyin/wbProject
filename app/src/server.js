import express from "express";
import http from "http";
import { Server } from "socket.io";
//import { createWorker } from "mediasoup";
import * as mediasoup from "mediasoup";
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

//----------MEDIASOUPSETTING----------
// let worker;
// let router = {};
// let peers = {};
// let producerTransport;
// let consumerTransport;
// let transports = [];
// let producers = [];
// let consumer = [];

let worker;
let rooms = {}; // { roomName1: { Router, rooms: [ sicketId1, ... ] }, ...}
let peers = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
let transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
let producers = []; // [ { socketId1, roomName1, producer, }, ... ]
let consumers = []; // [ { socketId1, roomName1, consumer, }, ... ]

// 4-1.worker 생성 함수 생성
async function createWorker() {
  worker = await mediasoup.createWorker({
    rtcMinPort: 10000,
    rtcMaxPort: 20000,
  });
  console.log(`mediasoup worker pid: ${worker.pid}`);

  worker.on("died", () => {
    console.error("mediasoup worker has died");
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
}

// 4-2.worker 생성
worker = createWorker();

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
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

// mediasoup server
// 1.socket.io 엔드포인트로 peers 생성
const ms = wsServer.of("/mediasoup");

// 2.ms에 socket접속 시
ms.on("connection", async (socket) => {
  console.log(`mediasoup, new client connect. ${socket.id}`);
  // 3.해당 socket에게 성공 이벤트 전송
  socket.emit("connection-success", {
    socketId: socket.id,
  });

  // ?.socket 접속 해제 시
  socket.on("disconnect", () => {
    // do some cleanup
    console.log("peers disconnect");
  });

  socket.on("createRoom", async ({ roomName, socketId }, callback) => {
    // Check if the room with the given name already exists
    const existingRoom = Object.values(rooms).find(
      (room) => room.roomName === roomName
    );

    // const existingRoom = rooms[roomName];

    let router1;
    let peers = [];
    if (existingRoom) {
      callback({ error: "해당 방이 이미 존재합니다." });
    } else {
      // 5.router 생성
      router1 = await worker.createRouter({ mediaCodecs });
    }

    console.log(
      `Router ID: ${router1.id}`,
      peers ? peers.length : "Peers not defined"
    );

    peers[socket.id] = {
      socket,
      roomName,
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: "",
        isAdmin: false,
      },
    };

    rooms[roomName] = {
      router: router1,
      peers: [...peers, socketId],
    };

    const rtpCapabilities = router1.rtpCapabilities;
    console.log("[createRoom]rtp Capabilities", rtpCapabilities);

    callback({ rtpCapabilities });
  });

  socket.on("joinRoom", async ({ roomName, socketId }, callback) => {
    const existingRoom = rooms.find((room) => room.roomName === roomName);

    let peers = [];
    if (existingRoom) {
      const router1 = existingRoom.router;

      peers[socket.id] = {
        socket,
        roomName,
        transports: [],
        producers: [],
        consumers: [],
        peerDetails: {
          name: "",
          isAdmin: false,
        },
      };

      rooms[roomName] = {
        router: router1,
        peers: [...peers, socketId],
      };

      const rtpCapabilities = router1.rtpCapabilities;
      console.log("[joinRoom]rtp Capabilities", rtpCapabilities);

      callback({ rtpCapabilities });
    }
  });

  socket.on("createWebRtcTransport", async ({ sender }, callback) => {
    console.log(`Is this a sender request? ${sender}`);
    if (sender) {
      producerTransport = await createWebRtcTransport(callback);
    } else {
      consumerTransport = await createWebRtcTransport(callback);
    }
  });

  socket.on("transport-connect", async ({ dtlsParameters }) => {
    console.log(`DTLS PARMAS...  ${dtlsParameters}`);
    await producerTransport.connect({ dtlsParameters });
  });

  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, appData }, callback) => {
      producer = await producerTransport.produce({
        kind,
        rtpParameters,
      });

      console.log("Producer ID: ", producer.id, producer.kind);

      // Producer에 이벤트 리스너 추가
      producer.on("transportclose", () => {
        console.log("transport for this producer closed ");
        producer.close();
      });

      callback({
        id: producer.id,
      });
    }
  );

  socket.on("transport-recv-connect", async ({ dtlsParameters }) => {
    console.log(`DTLS PARAMS: ${dtlsParameters}`);
    await consumerTransport.connect({ dtlsParameters });
  });

  socket.on("consume", async ({ rtpCapabilities }, callback) => {
    try {
      if (
        router.canConsume({
          producerId: producer.id,
          rtpCapabilities,
        })
      ) {
        consumer = await consumerTransport.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused: true,
        });

        consumer.on("transportclose", () => {
          console.log("transport close from consumer");
        });

        consumer.on("producerclose", () => {
          console.log("producer of consumer closed");
        });

        const params = {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        };

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
  });

  socket.on("consumer-resume", async () => {
    console.log("consumer resume");
    await consumer.resume();
  });
});

const createWebRtcTransport = async (callback) => {
  try {
    const webRtcTransport_options = {
      listenIps: [
        {
          ip: "127.0.0.1",
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    };

    let transport = await router.createWebRtcTransport(webRtcTransport_options);
    console.log(`transport id: ${transport.id}`);

    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "closed") {
        transport.close();
      }
    });

    transport.on("close", () => {
      console.log("transport closed");
    });

    callback({
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    });

    return transport;
  } catch (error) {
    console.log(error);
    callback({ params: { error: error } });
  }
};

//io server connect
wsServer.on("connection", (socket) => {
  console.log(`Client connected ${socket.id}`);

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
  socket.on("disconnect", () => {
    console.log(`Client disconnected ${socket.id}`);
  });
});

const handleListen = () => console.log(`Listening on http://localhost:${port}`);
httpserver.listen(port, handleListen);
