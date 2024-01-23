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

const useStyles = makeStyles({
  root: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 275,
  },
  title: {
    fontSize: 21,
    color: "black",
  },
  description: {
    fontSize: 14,
    color: "#002984",
  },
  button: {
    backgroundColor: "#3f51b5",
    color: "white",
    "&:hover": {
      backgroundColor: "#002984",
    },
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
    <Card className={classes.root}>
      <CardContent>
        <Typography
          className={classes.title}
          color="textSecondary"
          gutterBottom
        >
          {title}
        </Typography>
        <Typography
          className={classes.description}
          variant="body2"
          component="p"
        >
          {description}
        </Typography>
      </CardContent>
      <CardActions>
        {buttonLabels.map((label, index) => (
          <Button
            size="small"
            component={Link}
            to={buttonLinks[index]}
            key={index}
          >
            {label}
          </Button>
        ))}
      </CardActions>
    </Card>
  );
}

export default Home;
