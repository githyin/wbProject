import React, { useState, useRef, useEffect } from "react";

function Chat({ socket }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const roomName = useRef("");

  useEffect(() => {
    if (socket) {
      roomName.current = `private_room_${socket.id}`;
      socket.emit("join chat room", roomName.current);

      // 채팅 메시지 수신 리스너 등록
      const handleNewMessage = (message) => {
        const newMessageObject = {
          sender: "AI",
          message: message,
        };
        setMessages((prevmessages) => [...prevmessages, newMessageObject]);
      };
      socket.on("chat message", handleNewMessage);

      // 언마운트 시 실행될 클린업 함수입니다.
      return () => {
        socket.emit("leave chat room", roomName.current);
        socket.off("chat message", handleNewMessage);
      };
    } else return;
  }, [socket]);

  const sendMessage = (event) => {
    event.preventDefault();

    if (socket && message.trim()) {
      // 메시지를 UI에 추가
      const newMessageObject = {
        sender: "User",
        message: message,
      };
      setMessages((prevmessages) => [...prevmessages, newMessageObject]);

      // 서버로 메시지 전송
      socket.emit("chat message", roomName.current, message);
      setMessage("");
    } else return;
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      sendMessage(e);
    }
  };

  return (
    <div>
      <ul>
        {messages.map((msg, index) => (
          <li
            key={index}
            className={msg.sender === "me" ? "my-message" : "their-message"}
          >
            {msg.message}
          </li>
        ))}
      </ul>
      <div />
      <form onSubmit={sendMessage}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default Chat;
