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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

// Database setup
const dbPath = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
  }
});

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
      console.error('❌ Error creating datasets table:', err);
    } else {
      console.log('✅ Database table initialized');
    }
  });
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req: express.Request, file: Express.Multer.File, cb: (err: Error | null, dest?: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (req: express.Request, file: Express.Multer.File, cb: (err: Error | null, filename?: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${sanitizedName}`);
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
              console.warn('CSV parsing warnings:', results.errors);
            }
            const data = results.data as any[];
            const columns = data.length > 0 ? Object.keys(data[0]) : [];
            resolve({ data, columns });
          },
          error: (error: any) => reject(error)
        });
      });
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('No sheets found in Excel file');
      }
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
    console.error('❌ Error parsing file:', error);
    throw error;
  }
};

const generatePreview = (data: any[], limit: number = 5): any[] => {
  return data.slice(0, limit);
};

const analyzeColumns = (data: any[]): any[] => {
  if (!data || data.length === 0) return [];
  
  const columns = Object.keys(data[0] || {});
  
  return columns.map(columnName => {
    const values = data.map(row => row[columnName]).filter(val => val !== null && val !== undefined && val !== '');
    const nonMissingCount = values.length;
    const missingCount = data.length - nonMissingCount;
    const uniqueValues = new Set(values);
    
    // Detect column type
    const numericValues = values.filter(val => typeof val === 'number' && !isNaN(val));
    const isNumeric = numericValues.length > values.length * 0.8;
    
    let type = 'text';
    if (isNumeric) {
      type = 'numeric';
    } else if (uniqueValues.size < values.length * 0.1 && uniqueValues.size > 1) {
      type = 'categorical';
    } else if (values.some(val => !isNaN(Date.parse(val)))) {
      type = 'date';
    }
    
    return {
      name: columnName,
      type,
      missingCount,
      uniqueCount: uniqueValues.size
    };
  });
};

// API Routes

// Health check endpoint
app.get('/health', (req: express.Request, res: express.Response): void => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

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

    console.log(`📤 Processing upload: ${originalname} (${(size / 1024 / 1024).toFixed(2)} MB)`);

    // Parse file to get basic info
    const { data, columns } = await parseFile(filePath, originalname);
    const rowCount = data.length;
    const columnCount = columns.length;

    console.log(`📊 Parsed: ${rowCount} rows, ${columnCount} columns`);

    // Analyze columns
    const analyzedColumns = analyzeColumns(data);

    // Generate preview (first 5 rows)
    const preview = generatePreview(data, 5);

    // Store metadata in database
    const metadata = JSON.stringify({
      columns: analyzedColumns,
      preview,
      originalName: originalname,
      analyzedAt: new Date().toISOString()
    });

    db.run(
      `INSERT INTO datasets (id, name, path, size, rowCount, columnCount, metadata) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [datasetId, originalname, filePath, size, rowCount, columnCount, metadata],
      function(err: Error | null): void {
        if (err) {
          console.error('❌ Database error:', err);
          res.status(500).json({ error: 'Failed to save dataset metadata' });
          return;
        }

        console.log(`✅ Dataset saved: ${datasetId}`);

        // Return response compatible with frontend
        res.json({
          id: datasetId,
          name: originalname,
          data: preview,
          columns: analyzedColumns,
          uploadedAt: new Date(),
          size,
          rowCount,
          columnCount,
          isPreview: true
        });
      }
    );

  } catch (error: unknown) {
    console.error('❌ Upload error:', error);
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
        console.error('❌ Database error:', err);
        res.status(500).json({ error: 'Failed to fetch datasets' });
        return;
      }
      res.json(rows || []);
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
        console.error('❌ Database error:', err);
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
          totalRows: row.rowCount,
          totalColumns: row.columnCount,
          missingValues: 0, // Calculate if needed
          duplicates: 0, // Calculate if needed
          memoryUsage: `${(JSON.stringify(metadata).length / 1024).toFixed(2)} KB`,
          columns: metadata.columns || []
        });
      } catch (error) {
        console.error('❌ Error parsing metadata:', error);
        res.status(500).json({ error: 'Failed to parse dataset metadata' });
      }
    }
  );
});

// GET /preview/:id - Get dataset preview
app.get('/preview/:id', async (req: express.Request, res: express.Response): Promise<void> => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit as string) || 500;

  db.get(
    `SELECT path, name, metadata FROM datasets WHERE id = ?`,
    [id],
    async (err: Error | null, row: any): Promise<void> => {
      if (err) {
        console.error('❌ Database error:', err);
        res.status(500).json({ error: 'Failed to fetch dataset' });
        return;
      }

      if (!row) {
        res.status(404).json({ error: 'Dataset not found' });
        return;
      }

      try {
        // Check if file still exists
        if (!fs.existsSync(row.path)) {
          res.status(404).json({ error: 'Dataset file not found on disk' });
          return;
        }

        // Parse the full file and return limited rows
        const { data, columns } = await parseFile(row.path, row.name);
        const preview = data.slice(0, limit);
        const analyzedColumns = analyzeColumns(data);

        res.json({
          data: preview,
          columns: analyzedColumns,
          totalRows: data.length,
          previewRows: preview.length
        });
      } catch (error) {
        console.error('❌ Error reading dataset:', error);
        res.status(500).json({ error: 'Failed to read dataset file' });
      }
    }
  );
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction): void => {
  console.error('❌ Server error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
      return;
    }
  }
  
  res.status(500).json({
    error: error?.message || 'Internal server error'
  });
});

// 404 handler
app.use((req: express.Request, res: express.Response): void => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 NIKA Backend server running on http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${uploadsDir}`);
  console.log(`🗄️  Database: ${dbPath}`);
  console.log(`🌐 CORS enabled for: ${CLIENT_ORIGIN}`);
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('\n🛑 Shutting down server...');
  
  server.close(() => {
    console.log('🔌 HTTP server closed');
    
    db.close((err: Error | null) => {
      if (err) {
        console.error('❌ Error closing database:', err);
      } else {
        console.log('🗄️  Database connection closed');
      }
      process.exit(0);
    });
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});