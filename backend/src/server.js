import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import apiRoutes from "./routes/index.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5050);

app.use(cors());
app.use(express.json());

app.use("/api", apiRoutes);

app.listen(port, () => {
    // Keep startup log concise for local developer feedback.
    console.log(`CCSP backend listening on http://localhost:${port}`);
});
