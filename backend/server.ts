// backend/server.ts
import express from "express";
import cors from "cors";
import multer from "multer";
import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "500mb" })); // allow big JSON payloads
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config (store uploaded files in /uploads)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

// Limit to ~200 MB
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

// ---------- ROUTES ----------

// Upload & parse dataset
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    let data: any[] = [];

    if (ext === ".csv") {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
      data = parsed.data as any[];
    } else if (ext === ".xlsx" || ext === ".xls") {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      data = sheet;
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    return res.json({
      message: "File uploaded successfully",
      fileName: req.file.originalname,
      rowCount: data.length,
      dataPreview: data.slice(0, 20), // send first 20 rows only
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process file" });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
