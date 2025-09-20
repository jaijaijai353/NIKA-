# NIKA Backend

Node.js + Express + TypeScript backend for NIKA data analytics platform.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start

# Clean database and uploads
npm run clean
```

## API Endpoints

- `GET /health` - Health check
- `POST /upload` - Upload dataset file
- `GET /datasets` - List all datasets
- `GET /summary/:id` - Get dataset summary
- `GET /preview/:id` - Get dataset preview

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `PORT` - Server port (default: 5000)
- `CLIENT_ORIGIN` - Frontend URL for CORS
- `NODE_ENV` - Environment mode

## File Support

- CSV (.csv)
- Excel (.xlsx, .xls)
- JSON (.json)

## Database

Uses SQLite for metadata storage. Database file: `db.sqlite`

## Uploads

Files stored in `./uploads/` directory with unique names.