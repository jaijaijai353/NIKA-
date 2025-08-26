import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { parse as csvParse } from 'fast-csv';
import { chain } from 'stream-chain';
import { parser as jsonParser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import ExcelJS from 'exceljs';

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- DB setup (metadata only) ---
const dbPath = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(dbPath);

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
  `);
});

// --- Multer config (disk) ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB limit (tune as needed)
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.csv', '.xlsx', '.xls', '.json'];
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only .csv, .xlsx, .xls, .json allowed'));
  }
});

// --- Helpers: parse streams and provide (preview + counts + columns) ---
// Parse CSV via fast-csv streaming
const parseCSVStream = (filePath: string, previewLimit = 5) => {
  return new Promise<{ preview: any[]; total: number; columns: string[] }>((resolve, reject) => {
    const preview: any[] = [];
    let total = 0;
    let columns: string[] = [];
    const stream = fs.createReadStream(filePath);

    const parser = csvParse({ headers: true, ignoreEmpty: true, trim: true })
      .on('error', (err) => reject(err))
      .on('data', (row) => {
        if (total === 0) columns = Object.keys(row);
        if (preview.length < previewLimit) preview.push(row);
        total++;
      })
      .on('end', () => resolve({ preview, total, columns }));

    stream.pipe(parser);
  });
};

// Parse large JSON (expects array of objects) via stream-json
const parseJSONStream = (filePath: string, previewLimit = 5) => {
  return new Promise<{ preview: any[]; total: number; columns: string[] }>((resolve, reject) => {
    const preview: any[] = [];
    let total = 0;
    let columns: string[] = [];
    const fileStream = fs.createReadStream(filePath);

    const pipeline = chain([
      fileStream,
      jsonParser(),
      streamArray()
    ]);

    pipeline.on('data', ({ value }) => {
      if (typeof value === 'object' && value !== null) {
        if (total === 0) columns = Object.keys(value);
        if (preview.length < previewLimit) preview.push(value);
        total++;
      }
    });

    pipeline.on('end', () => resolve({ preview, total, columns }));
    pipeline.on('error', (err) => reject(err));
  });
};

// Parse Excel via exceljs streaming reader
const parseXLSXStream = async (filePath: string, previewLimit = 5) => {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath);
  let preview: any[] = [];
  let total = 0;
  let columns: string[] = [];

  return new Promise<{ preview: any[]; total: number; columns: string[] }>((resolve, reject) => {
    workbookReader.on('worksheet', (worksheet) => {
      const headerRowPromise = new Promise<void>((hdrResolve) => {
        let isHeaderCaptured = false;

        worksheet.on('row', (row) => {
          const values = row.values as any[]; // exceljs row.values is 1-based
          // Convert row.values to 0-based array of cells
          const rowArr = values.slice(1);
          if (!isHeaderCaptured) {
            columns = rowArr.map((c) => (c === null || c === undefined ? '' : String(c)));
            isHeaderCaptured = true;
            hdrResolve();
            return; // header row captured; skip counting as data
          } else {
            const obj: any = {};
            columns.forEach((colName, i) => {
              obj[colName || `column_${i}`] = rowArr[i] ?? null;
            });
            if (preview.length < previewLimit) preview.push(obj);
            total++;
          }
        });

        worksheet.on('finished', () => {
          // When worksheet finishes reading
        });
      });

      headerRowPromise.catch(() => {});
    });

    workbookReader.on('end', () => {
      resolve({ preview, total, columns });
    });

    workbookReader.on('error', (err) => reject(err));
  });
};

// Unified parse wrapper
const parseFileStream = async (filePath: string, originalName: string, previewLimit = 5) => {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.csv') return parseCSVStream(filePath, previewLimit);
  if (ext === '.json') return parseJSONStream(filePath, previewLimit);
  if (ext === '.xlsx' || ext === '.xls') return parseXLSXStream(filePath, previewLimit);
  throw new Error('Unsupported format for streaming parse');
};

// --- Routes ---

// POST /upload - stream-parse to collect preview + metadata; store metadata only
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { path: filePath, originalname, size } = req.file;
    const datasetId = `dataset-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    console.log(`Upload received: ${originalname} (${size} bytes) -> ${filePath}`);

    // Stream-parse to get preview + totals (does not load full file into memory)
    const { preview, total, columns } = await parseFileStream(filePath, originalname, 5);

    const metadataObj = {
      columns: columns.map((name) => ({ name, type: 'text' })), // you can enhance by type detection later
      preview,
      originalName: originalname
    };
    const metadata = JSON.stringify(metadataObj);

    // Save metadata to sqlite
    db.run(
      `INSERT INTO datasets (id, name, path, size, rowCount, columnCount, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [datasetId, originalname, filePath, size, total, columns.length, metadata],
      function (err) {
        if (err) {
          console.error('DB insert error', err);
          return res.status(500).json({ error: 'Failed to save dataset metadata' });
        }

        res.json({
          id: datasetId,
          name: originalname,
          uploadedAt: new Date().toISOString(),
          size,
          rowCount: total,
          columnCount: columns.length,
          data: preview,
          columns: columns.map((name) => ({ name, type: 'text' })),
          isPreview: true
        });
      }
    );
  } catch (err: any) {
    console.error('Upload processing error', err);
    res.status(500).json({ error: err.message || 'Failed to process upload' });
  }
});

// GET /datasets - list metadata
app.get('/datasets', (req, res) => {
  db.all(`SELECT id, name, size, uploadedAt, rowCount, columnCount FROM datasets ORDER BY uploadedAt DESC`, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch datasets' });
    }
    res.json(rows);
  });
});

// GET /preview/:id?limit=500 - stream-limited preview (does not parse full file into memory)
app.get('/preview/:id', (req, res) => {
  const { id } = req.params;
  const limit = parseInt((req.query.limit as string) || '500', 10);

  db.get(`SELECT path, name, metadata FROM datasets WHERE id = ?`, [id], async (err, row: any) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!row) return res.status(404).json({ error: 'Dataset not found' });

    try {
      const { preview, total, columns } = await parseFileStream(row.path, row.name, limit);
      res.json({
        data: preview,
        columns: columns.map((name) => ({ name, type: 'text' })),
        totalRows: total,
        previewRows: preview.length
      });
    } catch (err: any) {
      console.error('Preview read error', err);
      res.status(500).json({ error: 'Failed to read dataset preview' });
    }
  });
});

// GET /summary/:id - return metadata stored in DB
app.get('/summary/:id', (req, res) => {
  const { id } = req.params;
  db.get(`SELECT rowCount, columnCount, metadata FROM datasets WHERE id = ?`, [id], (err, row: any) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!row) return res.status(404).json({ error: 'Dataset not found' });

    try {
      const metadata = JSON.parse(row.metadata || '{}');
      res.json({
        rowCount: row.rowCount,
        columnCount: row.columnCount,
        columns: metadata.columns || []
      });
    } catch (parseErr) {
      console.error(parseErr);
      res.status(500).json({ error: 'Failed to parse metadata' });
    }
  });
});

/**
 * POST /import-to-sqlite/:id
 * - Imports (streams) dataset rows into a new table in SQLite.
 * - Request body: { tableName?: string, batchSize?: number (default 500) }
 * - NOTE: importing millions of rows into SQLite on a single machine is limited by disk/IO.
 *   But this endpoint imports in transactions and with prepared statements to minimize overhead.
 */
app.post('/import-to-sqlite/:id', express.json(), (req, res) => {
  const { id } = req.params;
  const tableName = (req.body.tableName as string) || `import_${Date.now()}`;
  const batchSize = parseInt(String(req.body.batchSize || 500), 10);

  db.get(`SELECT path, name, metadata FROM datasets WHERE id = ?`, [id], async (err, row: any) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!row) return res.status(404).json({ error: 'Dataset not found' });

    try {
      const meta = JSON.parse(row.metadata || '{}');
      const columnsMeta = meta.columns || [];
      const columns = columnsMeta.length > 0 ? columnsMeta.map((c: any) => c.name) : null;

      // If columns not available in metadata, we will read first row to infer columns
      let inferredColumns: string[] = columns || [];

      // Helper to sanitize column names for SQL
      const sanitize = (s: string) =>
        s
          .replace(/[^\w]/g, '_')
          .replace(/^_+/, '')
          .replace(/_+$/, '')
          .substring(0, 50) || 'col';

      // Begin stream parse and insert in batches
      const ext = path.extname(row.name).toLowerCase();

      // Promise for the import pipeline
      const importPromise = new Promise<{ inserted: number }>(async (resolve, reject) => {
        let inserted = 0;
        let buffer: any[] = [];
        let preparedStmt: sqlite3.Statement | null = null;

        const flushBuffer = (txCallback: (done?: () => void) => void) => {
          if (buffer.length === 0) return;
          const rowsToInsert = buffer.splice(0, buffer.length);
          db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            try {
              for (const r of rowsToInsert) {
                const cols = Object.keys(r).map(sanitize);
                const placeholders = cols.map(() => '?').join(',');
                const values = cols.map((c) => (r[c] === undefined ? null : r[c]));
                // Prepare statement dynamically
                const sql = `INSERT INTO ${tableName} (${cols.join(',')}) VALUES (${placeholders})`;
                db.run(sql, values);
                inserted++;
              }
              db.run('COMMIT');
              txCallback();
            } catch (e) {
              db.run('ROLLBACK');
              txCallback();
            }
          });
        };

        // Create table based on inferredColumns (if available). If not, we'll create lazily after first row.
        const createTable = (cols: string[]) => {
          const colsDecl = cols.map((c) => `"${sanitize(c)}" TEXT`).join(', ');
          db.run(`CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${colsDecl})`);
        };

        // A small function to handle each row (object)
        const handleRow = (obj: any) => {
          // On first row, if columns not known, infer and create table
          if (inferredColumns.length === 0) {
            inferredColumns = Object.keys(obj);
            createTable(inferredColumns);
          }
          // Normalize object keys to sanitized column names
          const normalized: any = {};
          for (const k of Object.keys(obj)) {
            normalized[sanitize(k)] = obj[k];
          }
          buffer.push(normalized);

          if (buffer.length >= batchSize) {
            // flush synchronously (but non-blocking to Node event loop)
            flushBuffer(() => {});
          }
        };

        // On stream end, flush leftover and resolve
        const finalize = () => {
          if (buffer.length > 0) {
            flushBuffer(() => {
              resolve({ inserted });
            });
          } else {
            resolve({ inserted });
          }
        };

        // Choose appropriate parser and hook into rows
        try {
          if (ext === '.csv') {
            const stream = fs.createReadStream(row.path);
            const parser = csvParse({ headers: true, ignoreEmpty: true, trim: true })
              .on('data', (r) => handleRow(r))
              .on('error', (e) => reject(e))
              .on('end', () => finalize());

            stream.pipe(parser);
          } else if (ext === '.json') {
            const fileStream = fs.createReadStream(row.path);
            const pipeline = chain([fileStream, jsonParser(), streamArray()])
              .on('data', ({ value }: any) => handleRow(value))
              .on('error', (e: any) => reject(e))
              .on('end', () => finalize());
          } else if (ext === '.xlsx' || ext === '.xls') {
            // ExcelJS streaming reader
            const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(row.path);
            workbookReader.on('worksheet', (worksheet) => {
              let header: string[] = [];
              worksheet.on('row', (r) => {
                const values = r.values ? r.values.slice(1) : []; // 1-based
                if (header.length === 0) {
                  header = values.map((v: any, i: number) => (v ? String(v) : `column_${i}`));
                  // create table
                  createTable(header);
                } else {
                  const obj: any = {};
                  for (let i = 0; i < header.length; i++) {
                    obj[header[i]] = values[i] ?? null;
                  }
                  handleRow(obj);
                }
              });
            });

            workbookReader.on('end', () => finalize());
            workbookReader.on('error', (e) => reject(e));
          } else {
            return reject(new Error('Unsupported format for import'));
          }
        } catch (e) {
          reject(e);
        }
      });

      // wait for import completion
      const { inserted } = await importPromise;
      res.json({ table: tableName, inserted });
    } catch (e: any) {
      console.error('Import error', e);
      res.status(500).json({ error: e.message || 'Import failed' });
    }
  });
});

// --- Health ---
app.get('/health', (_req, res) => res.json({ status: 'OK', ts: new Date().toISOString() }));

// --- Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// --- Start
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
  console.log(`Uploads dir: ${uploadDir}`);
  console.log(`DB path: ${dbPath}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close((err) => {
    if (err) console.error('Error closing DB', err);
    process.exit(0);
  });
});
