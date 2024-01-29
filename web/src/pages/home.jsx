import React from "react";
import {
  Button,
  Card,
  CardActions,
  CardContent,
  Typography,
  makeStyles,
} from "@material-ui/core";
import { Link } from "react-router-dom";
import image from "../images/image.jpg";

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
    justifyContent: "space-between",
    alignItems: "center",
  },
  description: {
    fontSize: 16,
    color: "black",
    marginBottom: 20,
  },
  buttonContainer: {
    display: "flex",
    justifyContent: "center", // 버튼들을 좌우로 정렬합니다.
    gap: 10,
  },
  button: {
    backgroundColor: "#f50057",
    color: "white",
    "&:hover": {
      backgroundColor: "#f20012",
    },
  },
  image: {
    width: 700,
    height: 700,
    marginBottom: 20,
  },
  leftContent: {
    flex: 2, // leftContent의 가로 크기를 2로 설정합니다.
    marginRight: 40,
  },
  rightContent: {
    flex: 1, // rightContent의 가로 크기를 1로 설정합니다.
  },
});

function Home() {
  const classes = useStyles();
  const title = "CHAIRS";
  const description =
    "Welcome to Chairs, a pioneering platform where live video streaming meets artificial intelligence learning. We enable users to share their insights through video, which our AI learns from. Not just this, we invite everyone to participate in this AI learning process. Join us at Chairs for this unique blend of knowledge sharing and interactive AI learning.";

  const buttonLabels = ["Stream", "Upload", "Chat"];
  const buttonLinks = ["/streaming", "/upload", "/chat"];

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
          <CardContent className={classes.leftContent}>
            <div className={classes.image}>
              <img className={classes.image} src={image} alt="이미지" />
            </div>
          </CardContent>
          <CardContent className={classes.rightContent}>
            <Typography
              className={classes.description}
              variant="body2"
              component="p"
            >
              {description}
            </Typography>
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

export default Home;
