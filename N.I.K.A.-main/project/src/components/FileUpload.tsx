import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { useDataContext } from '../context/DataContext';
import {
  parseCSV,
  analyzeColumns,
  generateDataSummary,
  generateAIInsights,
} from '../utils/dataProcessor';
import * as XLSX from 'xlsx';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const FileUpload: React.FC = () => {
  const {
    setDataset,
    setDataSummary,
    setAIInsights,
    setIsLoading,
    setRawDataset,
  } = useDataContext();

  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'uploading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [datasetPreview, setDatasetPreview] = useState<any[]>([]);
  const [fileName, setFileName] = useState('');

  // Convert Excel serial to Date
  const excelSerialToDate = (serial: number): Date => {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = serial * 24 * 60 * 60 * 1000;
    return new Date(epoch + ms);
  };

  const isLikelyExcelSerial = (val: number): boolean => {
    // A common range for Excel dates (approx 1955 to 2119)
    return Number.isInteger(val) && val >= 20000 && val <= 80000;
  };

  // Normalize for working dataset (not raw)
  const normalizeDates = (rows: Record<string, any>[]): Record<string, any>[] => {
    if (!rows || rows.length === 0) return rows;
    const keys = Object.keys(rows[0] || {});
    const dateHeaderHint: Record<string, boolean> = {};
    const headerDateRegex = /(date|dob|time|timestamp|day|month|year)/i;

    keys.forEach((k) => {
      dateHeaderHint[k] = headerDateRegex.test(k);
    });

    return rows.map((row) => {
      const out: Record<string, any> = { ...row };
      keys.forEach((k) => {
        const v = out[k];
        // Handle Excel serial date numbers
        if (typeof v === 'number' && dateHeaderHint[k] && isLikelyExcelSerial(v)) {
          const d = excelSerialToDate(v);
          out[k] = d.toLocaleDateString('en-GB'); // dd/mm/yyyy
        // Handle common date strings, avoiding parsing simple numbers as dates
        } else if (typeof v === 'string' && v.length > 5 && /[/\-\s]/.test(v)) {
          const parsed = new Date(v);
          if (!isNaN(parsed.getTime())) {
            out[k] = parsed.toLocaleDateString('en-GB'); // dd/mm/yyyy
          }
        }
      });
      return out;
    });
  };

  const handleFile = async (file: File) => {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage('File is too large. Max size 10MB.');
      setUploadStatus('error');
      return;
    }

    if (!['csv', 'json', 'xlsx', 'xls'].some((ext) => file.name.endsWith(ext))) {
      setErrorMessage('Unsupported file format. Please use CSV, JSON, or Excel.');
      setUploadStatus('error');
      return;
    }

    setIsLoading(true);
    setUploadStatus('uploading');
    setErrorMessage('');
    setFileName(file.name);

    try {
      let data: Record<string, any>[] = [];

      if (file.name.endsWith('.csv')) {
        data = await parseCSV(file);
      } else if (file.name.endsWith('.json')) {
        const text = await file.text();
        data = JSON.parse(text);
        if (!Array.isArray(data))
          throw new Error('JSON must be an array of objects');
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(worksheet);
      }

      if (!data || data.length === 0) throw new Error('No data found in file');

      // Keep raw untouched dataset
      const rawDataset = {
        id: `raw-${Date.now()}`,
        name: file.name,
        data, // untouched
        uploadedAt: new Date(),
        size: file.size,
      };

      // Make a normalized copy for working dataset
      const normalizedData = normalizeDates([...data]);

      const columns = analyzeColumns(normalizedData);
      const summary = generateDataSummary(normalizedData);
      const insights = generateAIInsights(normalizedData, columns);

      const dataset = {
        id: `dataset-${Date.now()}`,
        name: file.name,
        data: normalizedData,
        columns,
        uploadedAt: new Date(),
        size: file.size,
      };

      setRawDataset(rawDataset);
      setDataset(dataset);
      setDataSummary(summary);
      setAIInsights(insights);

      // Preview normalized (cleaned) data
      setDatasetPreview(normalizedData.slice(0, 5));
      setUploadStatus('success');
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to process file'
      );
      setUploadStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0])
      handleFile(e.dataTransfer.files[0]);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  const getBorderColor = () => {
    if (dragActive) return 'border-sky-400';
    if (uploadStatus === 'success') return 'border-emerald-400';
    if (uploadStatus === 'error') return 'border-red-400';
    return 'border-gray-600 hover:border-gray-400';
  };

  const getGlowEffect = () => {
    if (dragActive) return 'shadow-2xl shadow-sky-500/20';
    if (uploadStatus === 'success') return 'shadow-2xl shadow-emerald-500/20';
    if (uploadStatus === 'error') return 'shadow-2xl shadow-red-500/20';
    return '';
  };

  return (
    <div className="relative min-h-screen bg-slate-900 flex items-center justify-center p-4 overflow-hidden bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))]">
      <motion.div
        className="w-full max-w-3xl relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="text-center mb-8">
          <h1 className="text-5xl font-extrabold text-white mb-3 bg-clip-text text-transparent bg-gradient-to-r from-sky-300 to-violet-400">
            Welcome to NIKA
          </h1>
          <p className="text-gray-400 text-lg">
            Upload your dataset to unlock advanced analytics
          </p>
        </div>

        {/* Upload Card */}
        <motion.div
          className={`relative border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-all duration-300 backdrop-blur-md bg-black/30 ${getBorderColor()} ${getGlowEffect()}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          whileHover={{ scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <input
            type="file"
            id="file-upload"
            accept=".csv,.json,.xlsx,.xls"
            onChange={handleChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={uploadStatus === 'uploading'}
          />

          <AnimatePresence mode="wait">
            {uploadStatus === 'uploading' && (
              <motion.div
                key="uploading"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-sky-400 flex flex-col items-center"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="mb-4"
                >
                  <Upload className="h-14 w-14" />
                </motion.div>
                <p className="text-lg font-medium text-white">Processing...</p>
                <p className="text-sm text-gray-400">{fileName}</p>
              </motion.div>
            )}

            {uploadStatus === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-emerald-400"
              >
                <CheckCircle className="h-14 w-14 mx-auto mb-4" />
                <p className="text-lg font-medium text-white">
                  Analysis Complete!
                </p>
                <p className="text-sm text-gray-400 mb-4">{fileName}</p>

                {datasetPreview.length > 0 && (
                  <div className="mt-4 text-left bg-black/30 p-4 rounded-lg max-h-60 overflow-auto border border-gray-700">
                    <h3 className="text-white font-semibold mb-2 text-sm">
                      Data Preview:
                    </h3>
                    <table className="w-full text-xs text-gray-300 border-collapse table-auto">
                      <thead>
                        <tr className="bg-white/5">
                          {Object.keys(datasetPreview[0]).map((col) => (
                            <th
                              key={col}
                              className="border-b border-gray-700 px-3 py-2 text-left font-medium text-gray-400 uppercase tracking-wider"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {datasetPreview.map((row, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                            {Object.keys(row).map((col) => (
                              <td
                                key={col}
                                className="border-b border-gray-800 px-3 py-2 whitespace-nowrap"
                              >
                                {String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}

            {uploadStatus === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-red-400"
              >
                <AlertCircle className="h-14 w-14 mx-auto mb-4" />
                <p className="text-lg font-medium text-white">Upload Failed</p>
                <p className="text-sm text-gray-300 mt-1">{errorMessage}</p>
              </motion.div>
            )}

            {uploadStatus === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-gray-400"
              >
                <FileText className="h-14 w-14 mx-auto mb-4 text-gray-500" />
                <p className="text-lg font-medium text-white mb-2">
                  <span className="font-semibold text-sky-400">
                    Click to upload
                  </span>{' '}
                  or drag and drop
                </p>
                <p className="text-sm">CSV, JSON, or Excel (Max 10MB)</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default FileUpload;
