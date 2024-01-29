import React, { useCallback, useState } from "react";
import {
  Card,
  CardActions,
  CardContent,
  Typography,
  makeStyles,
  Button,
} from "@material-ui/core";
import { Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import axios from "axios";

// ui
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
  subtitle: {
    fontSize: 21,
    color: "black",
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

  dropzone: {
    border: "2px dashed #eeeeee",
    borderRadius: "5px",
    padding: "30px",
    textAlign: "center",
    color: "#bdbdbd",
    cursor: "pointer",
    width: "500px", // 원하는 가로 크기
    height: "400px", // 원하는 세로 크기
  },
  leftContent: {
    flex: 2, // leftContent의 가로 크기를 2로 설정합니다.
    marginRight: 40,
  },
  rightContent: {
    flex: 1, // rightContent의 가로 크기를 1로 설정합니다.
  },
});

function Upload() {
  const classes = useStyles();
  const title = "UPLOAD";
  const description =
    "Welcome to Chairs, a pioneering platform where live video streaming meets artificial intelligence learning. We enable users to share their insights through video, which our AI learns from. Not just this, we invite everyone to participate in this AI learning process. Join us at Chairs for this unique blend of knowledge sharing and interactive AI learning.";

  const buttonLabels = ["Stream", "Upload", "Chat"];
  const buttonLinks = ["/streaming", "/upload", "/chat"];
  const [files, setFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState("");

  const onDrop = useCallback((acceptedFiles) => {
    setFiles(acceptedFiles);
    setUploadStatus(
      `${acceptedFiles.length} file(s) selected. Ready to upload.`
    );
  }, []);

  const handleUpload = async () => {
    // 파일이 선택되지 않았을 경우 경고 메시지를 설정하고 함수 실행을 중단합니다.
    if (!files.length) {
      setUploadStatus("Please select a file to upload.");
      return;
    }

    // 파일이 선택되었을 경우, 업로드 프로세스를 진행합니다.
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await axios.post(
        "http://localhost:8000/upload",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      // 업로드 성공 시 메시지를 설정합니다.
      setUploadStatus("File uploaded successfully!");
      setFiles([]); // 현재 선택된 파일 목록을 초기화합니다.
      console.log(response.data);
    } catch (error) {
      // 업로드 중 오류가 발생했을 경우 메시지를 설정합니다.
      setUploadStatus("Error during upload. Please try again.");
      console.error(
        "Error uploading file:",
        error.response ? error.response.data : error.message
      );
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    multiple: true,
  });

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
            <div {...getRootProps()} className={classes.dropzone}>
              <input {...getInputProps()} />
              <p>Drag 'n' drop some files here, or click to select files</p>
              <div>
                {files.map((file) => (
                  <div key={file.path}>
                    {file.name} ({(file.size / 1024).toFixed(2)} KB)
                  </div>
                ))}
              </div>
            </div>
            <Button
              variant="contained"
              color="secondary"
              onClick={handleUpload}
            >
              Upload
            </Button>
            <Typography color="textSecondary">{uploadStatus}</Typography>
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

export default Upload;
