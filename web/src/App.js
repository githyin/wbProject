// App.js
import React, { useEffect, useState } from "react";
import socketIOClient from "socket.io-client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/home";
import Stream from "./pages/stream";
import Upload from "./pages/upload";
import Chat from "./pages/chat";
const ENDPOINT = "http://localhost:8000";

function App() {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const socketIo = socketIOClient(ENDPOINT);
    setSocket(socketIo);

    return () => {
      socketIo.disconnect();
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/streaming" element={<Stream />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/chat" element={<Chat socket={socket} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
