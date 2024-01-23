import React, { useCallback, useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  makeStyles,
  Button,
} from "@material-ui/core";
import { useDropzone } from "react-dropzone";
import axios from "axios";

const useStyles = makeStyles({
  root: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 600,
  },
  title: {
    fontSize: 21,
    color: "black",
  },
  dropzone: {
    border: "2px dashed #eeeeee",
    borderRadius: "5px",
    padding: "30px",
    textAlign: "center",
    color: "#bdbdbd",
    cursor: "pointer",
  },
});

function Upload() {
  const classes = useStyles();
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
    <Card className={classes.root}>
      <CardContent>
        <Typography
          className={classes.title}
          color="textSecondary"
          gutterBottom
        >
          Upload Video
        </Typography>
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
        <Button variant="contained" color="secondary" onClick={handleUpload}>
          Upload
        </Button>
        <Typography color="textSecondary">{uploadStatus}</Typography>
      </CardContent>
    </Card>
  );
}

export default Upload;
