@@ .. @@
 import { useDataContext } from '../context/DataContext';
-import {
-  parseCSV,
-  analyzeColumns,
-  generateDataSummary,
-  generateAIInsights,
-} from '../utils/dataProcessor';
-import * as XLSX from 'xlsx';
+import { analyzeColumns, generateDataSummary, generateAIInsights } from '../utils/dataProcessor';

 const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
@@ .. @@
   const [datasetPreview, setDatasetPreview] = useState<any[]>([]);

-  // Convert Excel serial to Date
-  const excelSerialToDate = (serial: number): Date => {
-    const epoch = Date.UTC(1899, 11, 30);
-    const ms = serial * 24 * 60 * 60 * 1000;
-    return new Date(epoch + ms);
-  };
-
-  const isLikelyExcelSerial = (val: number): boolean => {
-    return Number.isInteger(val) && val >= 20000 && val <= 80000;
-  };
-
-  // Normalize for working dataset (not raw)
-  const normalizeDates = (rows: Record<string, any>[]): Record<string, any>[] => {
-    if (!rows || rows.length === 0) return rows;
-    const keys = Object.keys(rows[0] || {});
-    const dateHeaderHint: Record<string, boolean> = {};
-    const headerDateRegex = /(date|dob|time|timestamp|day|month|year)/i;
-
-    keys.forEach((k) => {
-      dateHeaderHint[k] = headerDateRegex.test(k);
-    });
-
-    return rows.map((row) => {
-      const out: Record<string, any> = { ...row };
-      keys.forEach((k) => {
-        const v = out[k];
-        if (typeof v === 'number' && dateHeaderHint[k] && isLikelyExcelSerial(v)) {
-          const d = excelSerialToDate(v);
-          out[k] = d.toLocaleDateString('en-GB'); // ✅ dd/mm/yyyy
-        } else if (typeof v === 'string') {
-          const parsed = new Date(v);
-          if (!isNaN(parsed.getTime())) {
-            out[k] = parsed.toLocaleDateString('en-GB'); // ✅ dd/mm/yyyy
-          }
-        }
-      });
-      return out;
-    });
-  };
+  // Backend API base URL
+  const API_BASE = 'http://localhost:5000';

   const handleFile = async (file: File) => {
@@ .. @@
     try {
-      let data: Record<string, any>[] = [];
-
-      if (file.name.endsWith('.csv')) {
-        data = await parseCSV(file);
-      } else if (file.name.endsWith('.json')) {
-        const text = await file.text();
-        data = JSON.parse(text);
-        if (!Array.isArray(data))
-          throw new Error('JSON must be an array of objects');
-      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
-        const arrayBuffer = await file.arrayBuffer();
-        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
-        const sheetName = workbook.SheetNames[0];
-        const worksheet = workbook.Sheets[sheetName];
-        data = XLSX.utils.sheet_to_json(worksheet);
-      }
-
-      if (!data || data.length === 0) throw new Error('No data found in file');
-
-      // ✅ Keep raw untouched dataset
-      const rawDataset = {
-        id: `raw-${Date.now()}`,
-        name: file.name,
-        data, // untouched
-        uploadedAt: new Date(),
-        size: file.size,
-      };
-
-      // ✅ Make a normalized copy for working dataset
-      const normalizedData = normalizeDates([...data]);
-
-      const columns = analyzeColumns(normalizedData);
-      const summary = generateDataSummary(normalizedData);
-      const insights = generateAIInsights(normalizedData, columns);
-
-      const dataset = {
-        id: `dataset-${Date.now()}`,
-        name: file.name,
-        data: normalizedData,
-        columns,
-        uploadedAt: new Date(),
-        size: file.size,
-      };
-
-      // Save both versions
-      setRawDataset(rawDataset);
+      // Upload file to backend
+      const formData = new FormData();
+      formData.append('file', file);
+
+      const response = await fetch(`${API_BASE}/upload`, {
+        method: 'POST',
+        body: formData,
+      });
+
+      if (!response.ok) {
+        const errorData = await response.json();
+        throw new Error(errorData.error || 'Upload failed');
+      }
+
+      const dataset = await response.json();
+
+      // Generate summary and insights from preview data
+      const columns = analyzeColumns(dataset.data);
+      const summary = generateDataSummary(dataset.data);
+      const insights = generateAIInsights(dataset.data, columns);
+
+      // Update summary with actual row count from backend
+      const enhancedSummary = {
+        ...summary,
+        totalRows: dataset.rowCount || dataset.data.length,
+        totalColumns: dataset.columnCount || columns.length,
+      };
+
+      // Set raw dataset (for potential future use)
+      const rawDataset = {
+        id: `raw-${dataset.id}`,
+        name: dataset.name,
+        data: dataset.data,
+        uploadedAt: new Date(dataset.uploadedAt),
+        size: dataset.size,
+      };
+
+      // Set datasets and context
+      setRawDataset(rawDataset);
       setDataset(dataset);
-      setDataSummary(summary);
+      setDataSummary(enhancedSummary);
       setAIInsights(insights);
 
-      // ✅ Preview normalized (cleaned) data
-      setDatasetPreview(normalizedData.slice(0, 5));
+      // Set preview data
+      setDatasetPreview(dataset.data);

       setUploadStatus('success');
     } catch (error) {