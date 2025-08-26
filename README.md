# NIKA - AI-Powered Data Analytics Platform

A comprehensive data analytics platform with React frontend and Node.js backend for handling large datasets efficiently.

## 🚀 Quick Start

### Backend Setup
```bash
cd backend
npm install
npm start
```
Backend runs on: http://localhost:5000

### Frontend Setup
```bash
cd project
npm install
npm run dev
```
Frontend runs on: http://localhost:5173

## 📁 Project Structure

```
/
├── backend/                 # Node.js + Express + TypeScript backend
│   ├── server.ts           # Main Express server
│   ├── uploads/            # Uploaded dataset files
│   ├── db.sqlite          # SQLite database
│   ├── package.json
│   └── tsconfig.json
├── project/                # React + TypeScript frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── context/        # React context
│   │   ├── utils/          # Utility functions
│   │   └── types/          # TypeScript types
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## 🔧 Backend API Endpoints

### File Upload
- **POST** `/upload` - Upload CSV/Excel files
- **GET** `/datasets` - List all uploaded datasets
- **GET** `/summary/:id` - Get dataset summary
- **GET** `/preview/:id` - Get dataset preview (first 500 rows)
- **GET** `/health` - Health check

## 🎯 Features

### Frontend (React + TypeScript)
- **File Upload**: Drag & drop CSV/Excel files
- **Data Overview**: Interactive dashboard with charts
- **Data Cleaning**: Advanced cleaning workbench
- **Analytics**: Comprehensive statistical analysis
- **Visualizations**: Multiple chart types with customization
- **AI Insights**: Automated data insights and recommendations

### Backend (Node.js + Express)
- **File Processing**: Handle CSV, Excel, JSON files
- **Database**: SQLite for metadata storage
- **API**: RESTful endpoints for data operations
- **File Storage**: Organized upload management
- **CORS**: Configured for frontend integration

## 🔄 Data Flow

1. **Upload**: Frontend uploads file to backend `/upload`
2. **Processing**: Backend parses file, stores metadata in SQLite
3. **Preview**: Frontend receives preview data (first 5 rows)
4. **Analysis**: Components fetch additional data as needed
5. **Cleaning**: Operations work on preview, full processing on backend
6. **Visualization**: Charts use preview data for responsiveness

## 🛠️ Development

### Backend Development
```bash
cd backend
npm run dev  # Watch mode with ts-node
```

### Frontend Development
```bash
cd project
npm run dev  # Vite dev server
```

## 📊 Supported File Formats

- **CSV** (.csv)
- **Excel** (.xlsx, .xls)
- **JSON** (.json) - Array of objects

## 🔒 File Size Limits

- **Frontend**: 10MB per file
- **Backend**: 100MB per file
- **Preview**: First 500 rows for UI responsiveness

## 🎨 UI Components

- **Overview**: Dataset summary with quality metrics
- **Data Cleaning**: Interactive cleaning operations
- **Analytics**: Statistical analysis and reports
- **Visualizations**: Bar, line, pie, scatter, radar charts
- **AI Insights**: Automated pattern detection

## 🚀 Performance Features

- **Lazy Loading**: Components load data as needed
- **Preview Mode**: UI works with small data samples
- **Backend Processing**: Heavy operations on server
- **Responsive Design**: Works on all screen sizes

## 🔧 Configuration

### Backend Configuration
- Port: `5000` (configurable via `PORT` env var)
- Database: SQLite (`db.sqlite`)
- Uploads: `./uploads/` directory
- CORS: Enabled for `http://localhost:5173`

### Frontend Configuration
- Port: `5173` (Vite default)
- API Base: `http://localhost:5000`
- Build: Static files in `dist/`

## 📝 License

MIT License - Created by Jai Narula

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

**NIKA** - Transforming data into insights with AI-powered analytics.