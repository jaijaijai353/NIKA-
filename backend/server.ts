// backend/server.ts
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database setup
const dbPath = path.join(__dirname, 'db.sqlite');
// sqlite3 verbose is optional, but types will be satisfied by @types/sqlite3
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      rowCount INTEGER DEFAULT 0,
      columnCount INTEGER DEFAULT 0,
      metadata TEXT
    )
  `, (err: Error | null) => {
    if (err) {
      console.error('Error creating datasets table:', err);
    }
  });
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req: express.Request, file: Express.Multer.File, cb: (err: Error | null, dest?: string) => void) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req: express.Request, file: Express.Multer.File, cb: (err: Error | null, filename?: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, and JSON files are allowed.'));
    }
  }
});

// Utility functions
const parseFile = async (filePath: string, originalName: string): Promise<{ data: any[]; columns: string[] }> => {
  const ext = path.extname(originalName).toLowerCase();

  try {
    if (ext === '.csv') {
      const csvContent = fs.readFileSync(filePath, 'utf8');
      return new Promise((resolve, reject) => {
        Papa.parse(csvContent, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results: Papa.ParseResult<any>) => {
            if (results.errors && results.errors.length > 0) {
              reject(new Error(`CSV parsing error: ${results.errors[0].message}`));
            } else {
              const data = results.data as any[];
              const columns = data.length > 0 ? Object.keys(data[0]) : [];
              resolve({ data, columns });
            }
          },
          error: (error: any) => reject(error)
        });
      });
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet) as any[];
      const columns = data.length > 0 ? Object.keys(data[0] as any) : [];
      return { data, columns };
    } else if (ext === '.json') {
      const jsonContent = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(jsonContent);
      if (!Array.isArray(data)) {
        throw new Error('JSON must be an array of objects');
      }
      const columns = data.length > 0 ? Object.keys(data[0]) : [];
      return { data, columns };
    } else {
      throw new Error('Unsupported file format');
    }
  } catch (error) {
    console.error('Error parsing file:', error);
    throw error;
  }
};

const generatePreview = (data: any[], limit: number = 5): any[] => {
  return data.slice(0, limit);
};

// API Routes

// POST /upload - Upload and process dataset
app.post('/upload', upload.single('file'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const file = req.file as Express.Multer.File;
    const { filename, originalname, size } = file;
    const filePath = file.path;
    const datasetId = `dataset-${Date.now()}`;

    console.log(`Processing upload: ${originalname} (${size} bytes)`);

    // Parse file to get basic info
    const { data, columns } = await parseFile(filePath, originalname);
    const rowCount = data.length;
    const columnCount = columns.length;

    // Generate preview (first 5 rows)
    const preview = generatePreview(data, 5);

    // Store metadata in database
    const metadata = JSON.stringify({
      columns: columns.map(name => ({ name, type: 'text' })), // Basic column info
      preview,
      originalName: originalname
    });

    db.run(
      `INSERT INTO datasets (id, name, path, size, rowCount, columnCount, metadata) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [datasetId, originalname, filePath, size, rowCount, columnCount, metadata],
      (err: Error | null): void => {
        if (err) {
          console.error('Database error:', err);
          res.status(500).json({ error: 'Failed to save dataset metadata' });
          return;
        }

        console.log(`Dataset saved: ${datasetId} with ${rowCount} rows, ${columnCount} columns`);

        // Return response compatible with frontend
        res.json({
          id: datasetId,
          name: originalname,
          data: preview, // Frontend expects 'data' field for preview
          columns: columns.map(name => ({ name, type: 'text' })),
          uploadedAt: new Date(),
          size,
          rowCount,
          columnCount,
          isPreview: true // Flag to indicate this is preview data
        });
      }
    );

  } catch (error: unknown) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process file'
    });
  }
});

// GET /datasets - List all datasets
app.get('/datasets', (req: express.Request, res: express.Response): void => {
  db.all(
    `SELECT id, name, size, uploadedAt, rowCount, columnCount FROM datasets ORDER BY uploadedAt DESC`,
    [],
    (err: Error | null, rows: any[]): void => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Failed to fetch datasets' });
        return;
      }
      res.json(rows);
    }
  );
});

// GET /summary/:id - Get dataset summary
app.get('/summary/:id', (req: express.Request, res: express.Response): void => {
  const { id } = req.params;

  db.get(
    `SELECT rowCount, columnCount, metadata FROM datasets WHERE id = ?`,
    [id],
    (err: Error | null, row: any): void => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Failed to fetch summary' });
        return;
      }

      if (!row) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      try {
        const metadata = JSON.parse(row.metadata);
        res.json({
          rowCount: row.rowCount,
          columnCount: row.columnCount,
          columns: metadata.columns || []
        });
      } catch (error) {
        console.error('Error parsing metadata:', error);
        res.status(500).json({ error: 'Failed to parse dataset metadata' });
      }
    }
  );
});

// GET /preview/:id - Get dataset preview (first 500 rows)
app.get('/preview/:id', async (req: express.Request, res: express.Response): Promise<void> => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit as string) || 500;

  db.get(
    `SELECT path, name, metadata FROM datasets WHERE id = ?`,
    [id],
    async (err: Error | null, row: any): Promise<void> => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Failed to fetch dataset' });
        return;
      }

      if (!row) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      try {
        // Parse the full file and return limited rows
        const { data, columns } = await parseFile(row.path, row.name);
        const preview = data.slice(0, limit);

        res.json({
          data: preview,
          columns: columns.map(name => ({ name, type: 'text' })),
          totalRows: data.length,
          previewRows: preview.length
        });
      } catch (error) {
        console.error('Error reading dataset:', error);
        res.status(500).json({ error: 'Failed to read dataset file' });
      }
    }
  );
});

// Health check endpoint
app.get('/health', (req: express.Request, res: express.Response): void => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction): void => {
  console.error('Server error:', error);
  res.status(500).json({
    error: error?.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NIKA Backend server running on http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${path.join(__dirname, 'uploads')}`);
  console.log(`🗄️  Database: ${dbPath}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  db.close((err: Error | null) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});
