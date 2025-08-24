// src/components/DataCleaning.tsx
// Expanded, animated, non-condensed version with:
// - Three equal action cards (Missing, Duplicates, Fix Column Types)
// - Action panel that opens below the cards with detailed controls
// - Live preview table that always reflects the latest cleaned/transformed dataset
// - Apply Column Types fixes (numbers, dates, booleans, percentage, categorical, currency)
// - Currency: format-only (sign + commas) OR live convert values using exchangerate.host
// - Missing value strategies: none, drop, zero, mean, median, mode, custom
// - Duplicate removal
// - Export CSV
// - Gentle Framer Motion animations for a premium feel

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RectangleVertical as CleaningServices,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Trash2,
  Edit3,
  Info,
  Download as DownloadIcon,
  Sparkles,
} from "lucide-react";
import { saveAs } from "file-saver";
import { useDataContext } from "../context/DataContext";

// -------------------------------------------------------------
// Utility helpers and formatters (written verbosely for clarity)
// -------------------------------------------------------------

const isNullish = (value: any): boolean => {
  if (value === null) return true;
  if (value === undefined) return true;
  if (value === "") return true;
  return false;
};

const formatINRNumber = (val: number): string => {
  if (val === null || val === undefined) return "-";
  if (Number.isNaN(val)) return "-";
  const formatter = new Intl.NumberFormat("en-IN");
  const out = formatter.format(val);
  return out;
};

const formatCurrency = (val: number, currencyCode: string): string => {
  if (val === null || val === undefined) return "-";
  if (Number.isNaN(val)) return "-";
  try {
    const formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode,
    });
    const out = formatter.format(val);
    return out;
  } catch (e) {
    // Fallback if locale/currency combo is not supported
    const fallback = `${currencyCode} ${val.toFixed(2)}`;
    return fallback;
  }
};

const parseNumberLike = (input: any): number => {
  if (typeof input === "number") return input;
  if (input === null || input === undefined) return NaN;
  // remove common currency/percent/symbols and group separators
  const str = String(input)
    .replace(/\s+/g, "")
    .replace(/[₹$,€£%]/g, "")
    .replace(/,/g, "");
  const n = Number(str);
  return n;
};

const toDateOrNull = (value: any): Date | null => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value;
  }
  if (typeof value === "string") {
    const m = value.match(/^([0-3]?\d)\/([0-1]?\d)\/(\d{4})$/);
    if (m) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const year = parseInt(m[3], 10);
      const d = new Date(year, month, day);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const toDDMMYYYY = (d: Date | null): string => {
  if (!d) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// -------------------------------------------------------------
// Main Component
// -------------------------------------------------------------

const DataCleaning: React.FC = () => {
  // Access dataset and summary from your global DataContext
  const { dataset, setDataset, dataSummary, setDataSummary, updateCleanedData, forceDatasetUpdate } = useDataContext();

  // Debug dataset
  console.log("Dataset:", dataset);
  console.log("Dataset columns:", dataset?.columns);

  // Early guard for missing dataset
  if (!dataset || !dataset.columns || !dataset.data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">No data available for cleaning</p>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Local UI State (written out explicitly for readability)
  // -----------------------------------------------------------

  type ActiveSection = "missing" | "duplicates" | "columns" | null;

  const [activeSection, setActiveSection] = useState<ActiveSection>(null);

  // Column types selection per column; default from dataset if present, else "Text"
  const [colTypes, setColTypes] = useState<string[]>(
    dataset.columns.map((col: any) => {
      const initialType = col?.type ? String(col.type) : "Text";
      return initialType;
    })
  );

  // Debug column types
  console.log("Column types:", colTypes);

  // Currency settings per column (base + target)
  const SUPPORTED_CURRENCIES: string[] = [
    "INR",
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "AUD",
    "CAD",
  ];

  const [currencyBase, setCurrencyBase] = useState<string[]>(
    dataset.columns.map(() => "INR")
  );

  const [currencyTarget, setCurrencyTarget] = useState<string[]>(
    dataset.columns.map(() => "INR")
  );

  // Debug currency arrays
  console.log("Currency arrays:", { currencyBase, currencyTarget });

  // Global currency mode for the Column Types panel: format or convert
  const [currencyMode, setCurrencyMode] = useState<"format" | "convert">(
    "format"
  );

  // Missing values strategy
  const [missingStrategy, setMissingStrategy] = useState<
    "none" | "drop" | "zero" | "mean" | "median" | "mode" | "custom"
  >("none");

  const [missingCustomValue, setMissingCustomValue] = useState<string>("");

  // FX rates cache like {"INR->USD": 0.0123}
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [isFetchingRate, setIsFetchingRate] = useState<boolean>(false);
  const [fxError, setFxError] = useState<string>("");

  // Toast/snackbar for feedback
  const [toast, setToast] = useState<{
    open: boolean;
    text: string;
    tone: "ok" | "warn" | "err";
  }>({ open: false, text: "", tone: "ok" });

  // Preview rows count (explicit constant for clarity)
  const PREVIEW_COUNT: number = 10;

  // -----------------------------------------------------------
  // Summary recomputation helper (expanded)
  // -----------------------------------------------------------

  const recomputeSummary = (rows: any[], columns: any[]): void => {
    let missingCount: number = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        const value = row[col.name];
        const valueIsMissing =
          value === null ||
          value === undefined ||
          value === "" ||
          (typeof value === "number" && Number.isNaN(value));
        if (valueIsMissing) {
          missingCount = missingCount + 1;
        }
      }
    }

    const uniqueSet = new Set<string>();
    for (let r = 0; r < rows.length; r++) {
      const serialized = JSON.stringify(rows[r]);
      uniqueSet.add(serialized);
    }
    const duplicates = rows.length - uniqueSet.size;

    const memoryUsage = `${(JSON.stringify(rows).length / 1024).toFixed(2)} KB`;
    const newSummary = {
      totalRows: rows.length,
      totalColumns: columns.length,
      missingValues: missingCount,
      duplicates: duplicates,
      memoryUsage,
    };
    
    setDataSummary(newSummary);
    
    // Don't call updateCleanedData here to avoid infinite loops
    // The calling function should handle dataset updates
  };

  // -----------------------------------------------------------
  // Missing Values logic (expanded, explicit)
  // -----------------------------------------------------------

  const computeNumericStats = (
    columnName: string
  ): { mean: number; median: number; mode: number } => {
    const numericValues: number[] = [];
    for (let i = 0; i < dataset.data.length; i++) {
      const raw = dataset.data[i][columnName];
      if (!isNullish(raw)) {
        const n = parseNumberLike(raw);
        if (!Number.isNaN(n)) {
          numericValues.push(n);
        }
      }
    }

    if (numericValues.length === 0) {
      return { mean: 0, median: 0, mode: 0 };
    }

    let sum = 0;
    for (let i = 0; i < numericValues.length; i++) {
      sum = sum + numericValues[i];
    }
    const mean = sum / numericValues.length;

    const sorted = [...numericValues].sort((a, b) => a - b);
    const lowerIndex = Math.floor((sorted.length - 1) / 2);
    const upperIndex = Math.ceil((sorted.length - 1) / 2);
    const median = (sorted[lowerIndex] + sorted[upperIndex]) / 2;

    const counts = new Map<number, number>();
    for (let i = 0; i < numericValues.length; i++) {
      const v = numericValues[i];
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    let mode = sorted[0];
    let bestCount = 0;
    for (const [k, count] of counts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        mode = k;
      }
    }

    return { mean, median, mode };
  };

  const applyMissingValues = (): void => {
    if (missingStrategy === "none") {
      setToast({
        open: true,
        text: "No changes applied. Strategy = None.",
        tone: "warn",
      });
      return;
    }

    console.log("applyMissingValues called with strategy:", missingStrategy);
    const startRows = dataset.data;
    let newRows: any[] = [];

    if (missingStrategy === "drop") {
      for (let r = 0; r < startRows.length; r++) {
        const row = startRows[r];
        let rowHasMissing = false;
        for (let c = 0; c < dataset.columns.length; c++) {
          const column = dataset.columns[c];
          const v = row[column.name];
          if (isNullish(v) || v === "") {
            rowHasMissing = true;
            break;
          }
        }
        if (!rowHasMissing) {
          newRows.push(row);
        }
      }
      updateCleanedData(newRows);
      recomputeSummary(newRows, dataset.columns);
      setToast({
        open: true,
        text: `Dropped ${
          startRows.length - newRows.length
        } rows with missing values`,
        tone: "ok",
      });
      console.log("Missing values applied, newRows length:", newRows.length);
      
      // Direct update: Immediately update the dataset
      directUpdateDataset(newRows);
      
      // Backup: Force dataset update to ensure all components get the new data
      setTimeout(() => {
        console.log("Backup: Force dataset update for missing values...");
        forceDatasetUpdate(newRows);
      }, 200);
      
      return;
    }

    // Fill strategies
    for (let r = 0; r < startRows.length; r++) {
      const row = startRows[r];
      const newRow: any = { ...row };
      for (let c = 0; c < dataset.columns.length; c++) {
        const column = dataset.columns[c];
        const value = newRow[column.name];
        if (isNullish(value) || value === "") {
          if (missingStrategy === "zero") {
            newRow[column.name] = 0;
          }
          if (missingStrategy === "custom") {
            // attempt numeric conversion if the selected column type is some numeric-like
            const idx = c;
            const t = colTypes[idx] || dataset.columns[idx].type || "Text";
            if (
              t === "Number" ||
              t === "Integer" ||
              t === "Float" ||
              t === "Currency" ||
              t === "Percentage"
            ) {
              const n = parseNumberLike(missingCustomValue);
              newRow[column.name] = Number.isNaN(n) ? 0 : n;
            } else if (t === "Boolean") {
              const b = ["true", "1", "yes"].includes(
                String(missingCustomValue).toLowerCase()
              );
              newRow[column.name] = b;
            } else if (t === "Date" || t === "Datetime") {
              const d = toDateOrNull(missingCustomValue);
              newRow[column.name] = d;
            } else {
              newRow[column.name] = missingCustomValue;
            }
          }
          if (
            missingStrategy === "mean" ||
            missingStrategy === "median" ||
            missingStrategy === "mode"
          ) {
            const stats = computeNumericStats(column.name);
            if (missingStrategy === "mean") newRow[column.name] = stats.mean;
            if (missingStrategy === "median")
              newRow[column.name] = stats.median;
            if (missingStrategy === "mode") newRow[column.name] = stats.mode;
          }
        }
      }
      newRows.push(newRow);
    }

    updateCleanedData(newRows);
    recomputeSummary(newRows, dataset.columns);
    setToast({
      open: true,
      text: `Missing values handled using "${missingStrategy}"`,
      tone: "ok",
    });
    console.log("Missing values filled, newRows length:", newRows.length);
    
    // Direct update: Immediately update the dataset
    directUpdateDataset(newRows);
    
    // Backup: Force dataset update to ensure all components get the new data
    setTimeout(() => {
      console.log("Backup: Force dataset update for missing values...");
      forceDatasetUpdate(newRows);
    }, 200);
  };

  // -----------------------------------------------------------
  // Duplicate removal (explicit)
  // -----------------------------------------------------------

  const removeDuplicates = (): void => {
    console.log("removeDuplicates called");
    const startRows = dataset.data;
    const seen = new Set<string>();
    const unique: any[] = [];
    for (let i = 0; i < startRows.length; i++) {
      const serialized = JSON.stringify(startRows[i]);
      if (!seen.has(serialized)) {
        seen.add(serialized);
        unique.push(startRows[i]);
      }
    }
    console.log("Duplicates removed, unique rows:", unique.length, "from", startRows.length);
    updateCleanedData(unique);
    recomputeSummary(unique, dataset.columns);
    setToast({
      open: true,
      text: `Removed ${startRows.length - unique.length} duplicate rows`,
      tone: "ok",
    });
    
    // Direct update: Immediately update the dataset
    directUpdateDataset(unique);
    
    // Backup: Force dataset update to ensure all components get the new data
    setTimeout(() => {
      console.log("Backup: Force dataset update for duplicates...");
      forceDatasetUpdate(unique);
    }, 200);
  };

  // -----------------------------------------------------------
  // Live FX rate fetch (expanded)
  // -----------------------------------------------------------

  const fetchRate = async (from: string, to: string): Promise<number> => {
    const key = `${from}->${to}`;
    console.log(`Fetching rate for ${from}->${to}, key: ${key}`);
    if (fxRates[key]) {
      console.log(`Using cached rate for ${key}: ${fxRates[key]}`);
      return fxRates[key];
    }
    setIsFetchingRate(true);
    setFxError("");
    try {
      const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(
        from
      )}&symbols=${encodeURIComponent(to)}`;
      console.log(`Fetching from URL: ${url}`);
      const response = await fetch(url);
      const json = await response.json();
      console.log(`API response:`, json);
      if (!json || !json.rates || json.rates[to] == null) {
        throw new Error("Rate not found in response");
      }
      const rate: number = json.rates[to];
      console.log(`Rate for ${from}->${to}: ${rate}`);
      setFxRates((prev) => ({ ...prev, [key]: rate }));
      return rate;
    } catch (e: any) {
      console.error(`Error fetching rate for ${from}->${to}:`, e);
      setFxError("Failed to fetch live rates. Proceeding without conversion.");
      return 1; // neutral multiplier
    } finally {
      setIsFetchingRate(false);
    }
  };

  // -----------------------------------------------------------
  // Apply Column Types (expanded, fixes included)
  // -----------------------------------------------------------

  const applyColumnTypes = async (): Promise<void> => {
    // Create a deep-ish copy for safe transformation
    const startRows = dataset.data;
    let newRows: any[] = startRows.map((r: any) => ({ ...r }));

    console.log("Applying column types...");
    console.log("Current colTypes:", colTypes);
    console.log("Current currencyBase:", currencyBase);
    console.log("Current currencyTarget:", currencyTarget);
    console.log("Current currencyMode:", currencyMode);

    for (let c = 0; c < dataset.columns.length; c++) {
      const col = dataset.columns[c];
      const chosenType = colTypes[c] || col.type || "Text";
      
      console.log(`Column ${c}: ${col.name}, chosen type: ${chosenType}, colTypes[${c}]: ${colTypes[c]}`);

      if (chosenType === "Text") {
        const transformed: any[] = [];
        for (let r = 0; r < newRows.length; r++) {
          const row = newRows[r];
          const raw = row[col.name];
          const out = isNullish(raw) ? "" : String(raw);
          const updated = { ...row, [col.name]: out };
          transformed.push(updated);
        }
        newRows = transformed;
      }

      if (
        chosenType === "Number" ||
        chosenType === "Integer" ||
        chosenType === "Float" ||
        chosenType === "Percentage"
      ) {
        const transformed: any[] = [];
        for (let r = 0; r < newRows.length; r++) {
          const row = newRows[r];
          const raw = row[col.name];
          const parsed = parseNumberLike(raw);
          let num = Number.isNaN(parsed) ? 0 : parsed;
          if (chosenType === "Integer") {
            num = Math.trunc(num);
          }
          // Float and Number keep as-is; Percentage is stored as the numeric value (UI adds % sign)
          const updated = { ...row, [col.name]: num };
          transformed.push(updated);
        }
        newRows = transformed;
      }

      if (chosenType === "Boolean") {
        const transformed: any[] = [];
        for (let r = 0; r < newRows.length; r++) {
          const row = newRows[r];
          const raw = row[col.name];
          const out =
            typeof raw === "boolean"
              ? raw
              : ["true", "1", "yes"].includes(String(raw).toLowerCase());
          const updated = { ...row, [col.name]: out };
          transformed.push(updated);
        }
        newRows = transformed;
      }

      if (chosenType === "Date" || chosenType === "Datetime") {
        const transformed: any[] = [];
        for (let r = 0; r < newRows.length; r++) {
          const row = newRows[r];
          const raw = row[col.name];
          const d = toDateOrNull(raw);
          const updated = { ...row, [col.name]: d };
          transformed.push(updated);
        }
        newRows = transformed;
      }

      if (chosenType === "Categorical") {
        const transformed: any[] = [];
        for (let r = 0; r < newRows.length; r++) {
          const row = newRows[r];
          const raw = row[col.name];
          const out = isNullish(raw) ? "" : raw;
          const updated = { ...row, [col.name]: out };
          transformed.push(updated);
        }
        newRows = transformed;
      }

      if (chosenType === "Currency") {
        const base = (currencyBase[c] || "INR").toUpperCase();
        const target = (currencyTarget[c] || "INR").toUpperCase();
        // If user picked different currencies, convert regardless of toggle to meet expectation
        const doConvert = currencyMode === "convert" || base !== target;
        let rate = 1;
        
        console.log(`Currency processing: ${col.name}, base: ${base}, target: ${target}, doConvert: ${doConvert}, currencyMode: ${currencyMode}`);
        console.log(`currencyBase[${c}]: ${currencyBase[c]}, currencyTarget[${c}]: ${currencyTarget[c]}`);
        
        if (doConvert) {
          rate = await fetchRate(base, target);
          console.log(`Currency conversion: ${base} -> ${target}, rate: ${rate}`);
        }
        
        const transformed: any[] = [];
        for (let r = 0; r < newRows.length; r++) {
          const row = newRows[r];
          const raw = row[col.name];
          const parsed = parseNumberLike(raw);
          const num = Number.isNaN(parsed) ? 0 : parsed;
          const finalVal = doConvert ? num * rate : num; // store numeric; UI will format
          console.log(`Row ${r}: ${raw} -> ${parsed} -> ${finalVal} (${base} -> ${target}, rate: ${rate})`);
          const updated = { ...row, [col.name]: finalVal };
          transformed.push(updated);
        }
        newRows = transformed;
      }
    }

    // Commit the transformed data to global dataset and recompute summary
    updateCleanedData(newRows);
    recomputeSummary(newRows, dataset.columns);

    console.log("Column types applied. Final data sample:", newRows.slice(0, 2));
    console.log("Final data length:", newRows.length);

    // Direct update: Immediately update the dataset
    directUpdateDataset(newRows);

    // Backup: Force dataset update to ensure all components get the new data
    setTimeout(() => {
      console.log("Backup: Force dataset update...");
      forceDatasetUpdate(newRows);
    }, 200);

    // Let the user know things applied correctly
    setToast({
      open: true,
      text: "Column types applied successfully",
      tone: "ok",
    });
  };

  // -----------------------------------------------------------
  // Export CSV (expanded)
  // -----------------------------------------------------------

  const exportCSV = (): void => {
    const headerNames: string[] = [];
    for (let c = 0; c < dataset.columns.length; c++) {
      headerNames.push(dataset.columns[c].name);
    }
    const headerLine = headerNames.join(",");

    const lines: string[] = [];
    for (let r = 0; r < dataset.data.length; r++) {
      const row = dataset.data[r];
      const pieces: string[] = [];
      for (let c = 0; c < dataset.columns.length; c++) {
        const col = dataset.columns[c];
        const v = row[col.name];
        if (v instanceof Date) {
          pieces.push(`"${toDDMMYYYY(v)}"`);
        } else if (typeof v === "string") {
          pieces.push(`"${v.replace(/"/g, '""')}"`);
        } else if (typeof v === "number") {
          pieces.push(`${v}`);
        } else if (v === null || v === undefined) {
          pieces.push("");
        } else {
          pieces.push(`"${String(v).replace(/"/g, '""')}"`);
        }
      }
      lines.push(pieces.join(","));
    }

    const content = [headerLine, ...lines].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "cleaned_data.csv");
  };

  // -----------------------------------------------------------
  // Preview cell renderer (expanded, matches chosen types)
  // -----------------------------------------------------------

  const renderPreviewCell = (
    value: any,
    columnIndex: number
  ): React.ReactNode => {
    const chosenType =
      colTypes[columnIndex] || dataset.columns[columnIndex].type || "Text";

    if (value === null || value === undefined) {
      return <span className="text-gray-400">-</span>;
    }

    if (
      chosenType === "Number" ||
      chosenType === "Integer" ||
      chosenType === "Float"
    ) {
      const n = typeof value === "number" ? value : parseNumberLike(value);
      if (Number.isNaN(n)) {
        return <span>{String(value)}</span>;
      }
      return <span>{formatINRNumber(n)}</span>;
    }

    if (chosenType === "Percentage") {
      const n = typeof value === "number" ? value : parseNumberLike(value);
      if (Number.isNaN(n)) {
        return <span>{String(value)}</span>;
      }
      return <span>{`${n}%`}</span>;
    }

    if (chosenType === "Boolean") {
      const b = Boolean(value);
      return <span>{String(b)}</span>;
    }

    if (chosenType === "Date") {
      const d = value instanceof Date ? value : toDateOrNull(value);
      if (!d) return <span className="text-gray-400">-</span>;
      return <span>{toDDMMYYYY(d)}</span>;
    }

    if (chosenType === "Datetime") {
      const d = value instanceof Date ? value : toDateOrNull(value);
      if (!d) return <span className="text-gray-400">-</span>;
      return <span>{toDDMMYYYY(d)}</span>;
    }

    if (chosenType === "Currency") {
      const target = currencyTarget[columnIndex] || "INR";
      const n = typeof value === "number" ? value : parseNumberLike(value);
      if (Number.isNaN(n)) {
        return <span>{String(value)}</span>;
      }
      const formatted = formatCurrency(n, target);
      return <span>{formatted}</span>;
    }

    // default: Text / Categorical
    return <span>{String(value)}</span>;
  };

  // -----------------------------------------------------------
  // UI: HEADER
  // -----------------------------------------------------------

  // Direct function to update dataset (backup method)
  const directUpdateDataset = (newData: any[]) => {
    if (!dataset) return;
    
    console.log("Direct dataset update called with data length:", newData.length);
    
    const updatedDataset = {
      ...dataset,
      data: [...newData],
      updatedAt: new Date()
    };
    
    setDataset(updatedDataset);
    console.log("Direct dataset update completed");
  };

  return (
    <div className="space-y-6">
      {/* Header with title and export */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CleaningServices className="h-8 w-8 text-blue-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">
                Data Cleaning & Transformation
              </h2>
              <p className="text-gray-400">
                Card-based actions with live preview and currency conversion
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={exportCSV}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center"
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              Export CSV
            </button>
          </div>
        </div>
      </motion.div>

      {/* Action cards row (equal size) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Missing Values Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className={`rounded-lg p-6 border ${
            (dataSummary?.missingValues ?? 0) > dataset.data.length * 0.1
              ? "border-yellow-500 bg-yellow-500/10 text-yellow-300"
              : "border-yellow-500/60 bg-yellow-500/5 text-yellow-300"
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-white">
                Missing Values
              </h3>
            </div>
            <span className="text-2xl font-bold">
              {dataSummary?.missingValues ?? 0}
            </span>
          </div>
          <button
            onClick={() =>
              setActiveSection(activeSection === "missing" ? null : "missing")
            }
            className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2"
          >
            <Edit3 className="h-4 w-4" />
            <span>Handle Missing</span>
          </button>
        </motion.div>

        {/* Duplicate Records Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className={`rounded-lg p-6 border ${
            (dataSummary?.duplicates ?? 0) > 0
              ? "border-red-500 bg-red-500/10 text-red-300"
              : "border-red-500/60 bg-red-500/5 text-red-300"
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Info className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-white">
                Duplicate Records
              </h3>
            </div>
            <span className="text-2xl font-bold">
              {dataSummary?.duplicates ?? 0}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={removeDuplicates}
              className="w-1/2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2"
            >
              <Trash2 className="h-4 w-4" />
              <span>Remove</span>
            </button>
            <button
              onClick={() =>
                setActiveSection(
                  activeSection === "duplicates" ? null : "duplicates"
                )
              }
              className="w-1/2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Details</span>
            </button>
          </div>
        </motion.div>

        {/* Fix Column Types Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="rounded-lg p-6 border border-blue-500 bg-blue-500/10 text-blue-300"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Sparkles className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-white">
                Fix Column Types
              </h3>
            </div>
            <span className="text-2xl font-bold">
              {dataset.columns.length}
            </span>
          </div>
          <button
            onClick={() =>
              setActiveSection(activeSection === "columns" ? null : "columns")
            }
            className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2"
          >
            <Edit3 className="h-4 w-4" />
            <span>Configure</span>
          </button>
        </motion.div>
      </div>

      {/* Toast / notifications */}
      <AnimatePresence>
        {toast.open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className={
              toast.tone === "ok"
                ? "flex items-center space-x-2 bg-green-600/20 text-green-300 px-4 py-2 rounded-lg border border-green-600"
                : toast.tone === "warn"
                ? "flex items-center space-x-2 bg-yellow-600/20 text-yellow-300 px-4 py-2 rounded-lg border border-yellow-600"
                : "flex items-center space-x-2 bg-red-600/20 text-red-300 px-4 py-2 rounded-lg border border-red-600"
            }
          >
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">{toast.text}</span>
            <button
              className="ml-auto text-gray-200 hover:text-white text-xs"
              onClick={() => setToast({ open: false, text: "", tone: "ok" })}
            >
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Panel Below Cards */}
      <AnimatePresence mode="wait">
        {activeSection && (
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
            className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700"
          >
            {/* Missing Values Panel */}
            {activeSection === "missing" && (
              <div>
                <h3 className="text-xl font-semibold text-white mb-4">
                  Handle Missing Values
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className="block text-sm text-gray-300 mb-1">
                      Strategy
                    </label>
                    <select
                      value={missingStrategy}
                      onChange={(e) =>
                        setMissingStrategy(
                          e.target.value as typeof missingStrategy
                        )
                      }
                      className="bg-gray-700 text-white px-3 py-2 rounded w-full"
                    >
                      <option value="none">None (Preview only)</option>
                      <option value="drop">Drop Rows with Missing</option>
                      <option value="zero">Fill with 0</option>
                      <option value="mean">Fill with Mean (numeric)</option>
                      <option value="median">Fill with Median (numeric)</option>
                      <option value="mode">Fill with Mode (numeric)</option>
                      <option value="custom">Fill with Custom Value</option>
                    </select>
                  </div>

                  {missingStrategy === "custom" && (
                    <div className="col-span-1">
                      <label className="block text-sm text-gray-300 mb-1">
                        Custom Value
                      </label>
                      <input
                        value={missingCustomValue}
                        onChange={(e) => setMissingCustomValue(e.target.value)}
                        className="bg-gray-700 text-white px-3 py-2 rounded w-full"
                        placeholder="e.g. NA, 0, Unknown"
                      />
                    </div>
                  )}

                  <div className="col-span-1 flex items-end">
                    <button
                      onClick={applyMissingValues}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded w-full"
                    >
                      Apply Strategy
                    </button>
                  </div>
                </div>

                {/* Preview for Missing Values */}
                <div className="mt-6">
                  <h4 className="text-lg font-semibold text-white mb-3">
                    Preview (Top {PREVIEW_COUNT} Rows)
                  </h4>
                  <div className="overflow-auto max-h-[420px] rounded border border-gray-700">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-900">
                          {dataset.columns.map((c: any) => (
                            <th
                              key={c.name}
                              className="text-left p-3 text-gray-300 font-medium sticky top-0"
                            >
                              {c.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataset.data
                          .slice(0, PREVIEW_COUNT)
                          .map((row: any, rIdx: number) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx % 2 === 0
                                  ? "bg-gray-800/40"
                                  : "bg-gray-800/20"
                              }
                            >
                              {dataset.columns.map((c: any, cIdx: number) => (
                                <td
                                  key={c.name}
                                  className="p-3 text-gray-300 border-t border-gray-700"
                                >
                                  {renderPreviewCell(row[c.name], cIdx)}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Duplicates Panel */}
            {activeSection === "duplicates" && (
              <div>
                <h3 className="text-xl font-semibold text-white mb-4">
                  Duplicate Records
                </h3>
                <p className="text-gray-300 mb-3">
                  Duplicates are detected by comparing complete rows (JSON
                  equality).
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={removeDuplicates}
                    className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded"
                  >
                    Remove Duplicates Now
                  </button>
                </div>

                {/* Preview for Duplicates */}
                <div className="mt-6">
                  <h4 className="text-lg font-semibold text-white mb-3">
                    Preview (Top {PREVIEW_COUNT} Rows)
                  </h4>
                  <div className="overflow-auto max-h-[420px] rounded border border-gray-700">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-900">
                          {dataset.columns.map((c: any) => (
                            <th
                              key={c.name}
                              className="text-left p-3 text-gray-300 font-medium sticky top-0"
                            >
                              {c.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataset.data
                          .slice(0, PREVIEW_COUNT)
                          .map((row: any, rIdx: number) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx % 2 === 0
                                  ? "bg-gray-800/40"
                                  : "bg-gray-800/20"
                              }
                            >
                              {dataset.columns.map((c: any, cIdx: number) => (
                                <td
                                  key={c.name}
                                  className="p-3 text-gray-300 border-t border-gray-700"
                                >
                                  {renderPreviewCell(row[c.name], cIdx)}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Column Types Panel */}
            {activeSection === "columns" && (
              <div>
                <h3 className="text-xl font-semibold text-white mb-4">
                  Fix Column Types
                </h3>

                {/* Currency global mode */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-gray-300 text-sm">
                    Currency action:
                  </span>
                  <label className="text-gray-200 text-sm flex items-center gap-2">
                    <input
                      type="radio"
                      name="currencyMode"
                      value="format"
                      checked={currencyMode === "format"}
                      onChange={() => setCurrencyMode("format")}
                    />
                    Format only (sign & commas)
                  </label>
                  <label className="text-gray-200 text-sm flex items-center gap-2">
                    <input
                      type="radio"
                      name="currencyMode"
                      value="convert"
                      checked={currencyMode === "convert"}
                      onChange={() => setCurrencyMode("convert")}
                    />
                    Live convert values
                  </label>
                  {isFetchingRate && (
                    <span className="text-xs text-blue-300">
                      Fetching live rates…
                    </span>
                  )}
                  {fxError && (
                    <span className="text-xs text-red-300">{fxError}</span>
                  )}
                </div>

                {/* Per-column controls */}
                <div className="space-y-3">
                  {dataset.columns.map((col: any, idx: number) => (
                    <div
                      key={col.name}
                      className="flex flex-col md:flex-row md:items-center md:space-x-3 bg-gray-800/40 p-3 rounded border border-gray-700"
                    >
                      {/* Name */}
                      <div className="flex items-center space-x-2 md:w-64">
                        <Edit3 className="h-4 w-4 text-blue-300" />
                        <span className="text-gray-200 font-medium">
                          {col.name}
                        </span>
                      </div>

                      {/* Type selector */}
                      <div className="mt-2 md:mt-0 md:flex-1">
                        <label className="text-gray-400 text-xs block mb-1">
                          Type
                        </label>
                        <select
                          value={colTypes[idx]}
                          onChange={(e) => {
                            const next = [...colTypes];
                            next[idx] = e.target.value;
                            setColTypes(next);
                            console.log(`Column type changed for column ${idx}: ${e.target.value}`);
                          }}
                          className="bg-gray-700 text-white px-3 py-2 rounded w-full"
                        >
                          <option value="Text">Text</option>
                          <option value="Number">Number (INR commas)</option>
                          <option value="Integer">Integer</option>
                          <option value="Float">Float / Decimal</option>
                          <option value="Date">Date</option>
                          <option value="Datetime">Datetime</option>
                          <option value="Boolean">Boolean</option>
                          <option value="Currency">Currency</option>
                          <option value="Percentage">Percentage</option>
                          <option value="Categorical">Categorical</option>
                        </select>
                      </div>

                      {/* Currency controls (only when chosen type is Currency) */}
                      {colTypes[idx] === "Currency" && (
                        <>
                          <div className="mt-2 md:mt-0 md:w-48">
                            <label className="text-gray-400 text-xs block mb-1">
                              Base
                            </label>
                            <select
                              value={currencyBase[idx]}
                              onChange={(e) => {
                                const next = [...currencyBase];
                                next[idx] = e.target.value;
                                setCurrencyBase(next);
                                console.log(`Currency base changed for column ${idx}: ${e.target.value}`);
                              }}
                              className="bg-gray-700 text-white px-3 py-2 rounded w-full"
                            >
                              {SUPPORTED_CURRENCIES.map((cc) => (
                                <option key={cc} value={cc}>
                                  {cc}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="mt-2 md:mt-0 md:w-48">
                            <label className="text-gray-400 text-xs block mb-1">
                              Target
                            </label>
                            <select
                              value={currencyTarget[idx]}
                              onChange={(e) => {
                                const next = [...currencyTarget];
                                next[idx] = e.target.value;
                                setCurrencyTarget(next);
                                console.log(`Currency target changed for column ${idx}: ${e.target.value}`);
                              }}
                              className="bg-gray-700 text-white px-3 py-2 rounded w-full"
                            >
                              {SUPPORTED_CURRENCIES.map((cc) => (
                                <option key={cc} value={cc}>
                                  {cc}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      {/* Quick preview sample */}
                      <div className="mt-2 md:mt-0 md:w-64">
                        <label className="text-gray-400 text-xs block mb-1">
                          Preview
                        </label>
                        <div className="bg-gray-900 text-gray-200 px-3 py-2 rounded border border-gray-700 truncate">
                          {renderPreviewCell(dataset.data[0]?.[col.name], idx)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Apply button */}
                <div className="mt-4">
                  <button
                    onClick={applyColumnTypes}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded"
                  >
                    Apply Column Types
                  </button>
                </div>

                {/* Preview for Column Types */}
                <div className="mt-6">
                  <h4 className="text-lg font-semibold text-white mb-3">
                    Preview (Top {PREVIEW_COUNT} Rows)
                  </h4>
                  <div className="overflow-auto max-h-[420px] rounded border border-gray-700">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-900">
                          {dataset.columns.map((c: any) => (
                            <th
                              key={c.name}
                              className="text-left p-3 text-gray-300 font-medium sticky top-0"
                            >
                              {c.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataset.data
                          .slice(0, PREVIEW_COUNT)
                          .map((row: any, rIdx: number) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx % 2 === 0
                                  ? "bg-gray-800/40"
                                  : "bg-gray-800/20"
                              }
                            >
                              {dataset.columns.map((c: any, ci: number) => (
                                <td
                                  key={c.name}
                                  className="p-3 text-gray-300 border-t border-gray-700"
                                >
                                  {renderPreviewCell(row[c.name], ci)}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DataCleaning;
