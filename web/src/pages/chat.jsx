import React, { useState, useRef, useEffect } from "react";
import {
  Button,
  Card,
  CardActions,
  CardContent,
  Typography,
  makeStyles,
} from "@material-ui/core";
import { Link } from "react-router-dom";

const useStyles = makeStyles({
  root: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
    height: "100vh",
  },
  header: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  body: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#f50057",
  },
  card: {
    width: 1200,
    height: 700,
    padding: 20,
    textAlign: "center",
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  description: {
    fontSize: 16,
    color: "black",
    marginBottom: 20,
  },
  buttonContainer: {
    display: "flex",
    justifyContent: "center",
    gap: 10, // 간격을 조정해주세요
  },
  button: {
    backgroundColor: "#f50057",
    color: "white",
    "&:hover": {
      backgroundColor: "#f20012",
    },
  },
  leftContent: {
    flex: 2, // leftContent의 가로 크기를 2로 설정합니다.
    marginRight: 40,
  },
  rightContent: {
    flex: 1, // rightContent의 가로 크기를 1로 설정합니다.
  },
});

function Chat({ socket }) {
  const classes = useStyles();
  const title = "QUESTION";
  const description =
    "Welcome to Chairs, a pioneering platform where live video streaming meets artificial intelligence learning. We enable users to share their insights through video, which our AI learns from. Not just this, we invite everyone to participate in this AI learning process. Join us at Chairs for this unique blend of knowledge sharing and interactive AI learning.";

  const buttonLabels = ["Stream", "Upload", "Chat"];
  const buttonLinks = ["/streaming", "/upload", "/chat"];
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
    <div className={classes.root}>
      <div className={classes.header}>
        <Typography
          className={classes.title}
          color="textSecondary"
          gutterBottom
        >
          {title}
        </Typography>
      </div>
      <div className={classes.body}>
        <Card className={classes.card}>
          <CardContent>
            <ul>
              {messages.map((msg, index) => (
                <li
                  key={index}
                  className={
                    msg.sender === "me" ? "my-message" : "their-message"
                  }
                >
                  {msg.message}
                </li>
              ))}
            </ul>
            <form onSubmit={sendMessage}>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
              />
              <button type="submit">Send</button>
            </form>
          </CardContent>
          <CardContent>
            <CardActions className={classes.buttonContainer}>
              {/* 버튼들을 좌우로 정렬합니다. */}
              {buttonLabels.map((label, index) => (
                <Button
                  className={classes.button}
                  size="small"
                  component={Link}
                  to={buttonLinks[index]}
                  key={index}
                >
                  {label}
                </Button>
              ))}
            </CardActions>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Chat;
