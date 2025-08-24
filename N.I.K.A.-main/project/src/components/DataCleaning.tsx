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
  const { dataset, dataSummary, setDataSummary, updateCleanedData } = useDataContext();

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
    dataset.columns.map((col: any) => col?.type ? String(col.type) : "Text")
  );

  // Currency settings per column (base + target)
  const SUPPORTED_CURRENCIES: string[] = ["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD"];
  const [currencyBase, setCurrencyBase] = useState<string[]>(dataset.columns.map(() => "INR"));
  const [currencyTarget, setCurrencyTarget] = useState<string[]>(dataset.columns.map(() => "INR"));

  // Global currency mode for the Column Types panel: format or convert
  const [currencyMode, setCurrencyMode] = useState<"format" | "convert">("format");

  // Missing values strategy
  const [missingStrategy, setMissingStrategy] = useState<"none" | "drop" | "zero" | "mean" | "median" | "mode" | "custom">("none");
  const [missingCustomValue, setMissingCustomValue] = useState<string>("");

  // FX rates cache like {"INR->USD": 0.0123}
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [isFetchingRate, setIsFetchingRate] = useState<boolean>(false);
  const [fxError, setFxError] = useState<string>("");

  // Toast/snackbar for feedback
  const [toast, setToast] = useState<{ open: boolean; text: string; tone: "ok" | "warn" | "err" }>({ open: false, text: "", tone: "ok" });

  // Preview rows count (explicit constant for clarity)
  const PREVIEW_COUNT: number = 10;

  // -----------------------------------------------------------
  // Summary recomputation helper (expanded)
  // -----------------------------------------------------------

  const recomputeSummary = (rows: any[], columns: any[]): void => {
    let missingCount: number = 0;
    for (const row of rows) {
      for (const col of columns) {
        const value = row[col.name];
        if (isNullish(value) || (typeof value === "number" && Number.isNaN(value))) {
          missingCount++;
        }
      }
    }

    const uniqueSet = new Set<string>(rows.map(r => JSON.stringify(r)));
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
  };

  // -----------------------------------------------------------
  // Missing Values logic (expanded, explicit)
  // -----------------------------------------------------------

  const computeNumericStats = (columnName: string): { mean: number; median: number; mode: number } => {
    const numericValues: number[] = dataset.data
      .map((row: any) => parseNumberLike(row[columnName]))
      .filter((n: number) => !Number.isNaN(n));

    if (numericValues.length === 0) return { mean: 0, median: 0, mode: 0 };

    const sum = numericValues.reduce((acc, val) => acc + val, 0);
    const mean = sum / numericValues.length;

    const sorted = [...numericValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    const counts = new Map<number, number>();
    numericValues.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    let mode = sorted[0];
    let maxCount = 0;
    for (const [k, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mode = k;
      }
    }

    return { mean, median, mode };
  };

  const applyMissingValues = (): void => {
    if (missingStrategy === "none") {
      setToast({ open: true, text: "No changes applied. Strategy = None.", tone: "warn" });
      return;
    }

    const startRows = dataset.data;
    let newRows: any[];

    if (missingStrategy === "drop") {
      newRows = startRows.filter((row: any) => {
        return dataset.columns.every((col: any) => !isNullish(row[col.name]));
      });
      setToast({ open: true, text: `Dropped ${startRows.length - newRows.length} rows`, tone: "ok" });
    } else {
      newRows = startRows.map((row: any) => {
        const newRow = { ...row };
        for (let c = 0; c < dataset.columns.length; c++) {
          const column = dataset.columns[c];
          if (isNullish(newRow[column.name])) {
            switch (missingStrategy) {
              case "zero":
                newRow[column.name] = 0;
                break;
              case "custom":
                const t = colTypes[c] || "Text";
                if (["Number", "Integer", "Float", "Currency", "Percentage"].includes(t)) {
                  const n = parseNumberLike(missingCustomValue);
                  newRow[column.name] = Number.isNaN(n) ? 0 : n;
                } else if (t === "Boolean") {
                  newRow[column.name] = ["true", "1", "yes"].includes(String(missingCustomValue).toLowerCase());
                } else if (t === "Date" || t === "Datetime") {
                  newRow[column.name] = toDateOrNull(missingCustomValue);
                } else {
                  newRow[column.name] = missingCustomValue;
                }
                break;
              case "mean":
              case "median":
              case "mode":
                const stats = computeNumericStats(column.name);
                newRow[column.name] = stats[missingStrategy];
                break;
            }
          }
        }
        return newRow;
      });
      setToast({ open: true, text: `Missing values handled using "${missingStrategy}"`, tone: "ok" });
    }

    updateCleanedData(newRows);
    recomputeSummary(newRows, dataset.columns);
  };

  // -----------------------------------------------------------
  // Duplicate removal (explicit)
  // -----------------------------------------------------------

  const removeDuplicates = (): void => {
    const startRows = dataset.data;
    const seen = new Set<string>();
    const unique: any[] = [];
    for (const row of startRows) {
      const serialized = JSON.stringify(row);
      if (!seen.has(serialized)) {
        seen.add(serialized);
        unique.push(row);
      }
    }

    updateCleanedData(unique);
    recomputeSummary(unique, dataset.columns);
    setToast({ open: true, text: `Removed ${startRows.length - unique.length} duplicate rows`, tone: "ok" });
  };

  // -----------------------------------------------------------
  // Live FX rate fetch (expanded)
  // -----------------------------------------------------------

  const fetchRate = async (from: string, to: string): Promise<number> => {
    const key = `${from}->${to}`;
    if (fxRates[key]) return fxRates[key];
    setIsFetchingRate(true);
    setFxError("");
    try {
      const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
      const response = await fetch(url);
      const json = await response.json();
      if (!json?.rates?.[to]) throw new Error("Rate not found in response");
      const rate: number = json.rates[to];
      setFxRates((prev) => ({ ...prev, [key]: rate }));
      return rate;
    } catch (e: any) {
      console.error(`Error fetching rate for ${from}->${to}:`, e);
      setFxError("Failed to fetch live rates.");
      return 1; // neutral multiplier
    } finally {
      setIsFetchingRate(false);
    }
  };

  // -----------------------------------------------------------
  // Apply Column Types (REFACTORED AND FIXED)
  // -----------------------------------------------------------

  const applyColumnTypes = async (): Promise<void> => {
    console.log("Applying column types with refactored function...");

    // 1. Pre-fetch all necessary currency rates to avoid awaiting inside a loop
    // This makes the main transformation synchronous and much cleaner.
    const ratesToFetch: { from: string; to: string }[] = [];
    for (let c = 0; c < dataset.columns.length; c++) {
      const chosenType = colTypes[c] || dataset.columns[c].type || "Text";
      if (chosenType === "Currency") {
        const base = (currencyBase[c] || "INR").toUpperCase();
        const target = (currencyTarget[c] || "INR").toUpperCase();
        const doConvert = currencyMode === "convert" || base !== target;
        if (doConvert && !fxRates[`${base}->${target}`]) {
          ratesToFetch.push({ from: base, to: target });
        }
      }
    }

    // Fetch all unique rates in parallel
    if (ratesToFetch.length > 0) {
      await Promise.all(
        ratesToFetch.map((pair) => fetchRate(pair.from, pair.to))
      );
    }

    // 2. Map over the dataset ONCE to create the new rows.
    // This is far more efficient than iterating over the dataset for each column.
    const startRows = dataset.data;
    const newRows = startRows.map((originalRow: any) => {
      // Create a mutable copy for this row's transformations
      const newRow = { ...originalRow };

      // Now, loop through columns and apply the transformation TO THIS ROW
      for (let c = 0; c < dataset.columns.length; c++) {
        const col = dataset.columns[c];
        const chosenType = colTypes[c] || col.type || "Text";
        const rawValue = newRow[col.name];

        // Use a switch for clarity and efficiency
        switch (chosenType) {
          case "Text":
          case "Categorical":
            newRow[col.name] = isNullish(rawValue) ? "" : String(rawValue);
            break;

          case "Number":
          case "Integer":
          case "Float":
          case "Percentage": {
            const parsed = parseNumberLike(rawValue);
            let num = Number.isNaN(parsed) ? 0 : parsed;
            if (chosenType === "Integer") {
              num = Math.trunc(num);
            }
            newRow[col.name] = num;
            break;
          }

          case "Boolean":
            newRow[col.name] =
              typeof rawValue === "boolean"
                ? rawValue
                : ["true", "1", "yes"].includes(String(rawValue).toLowerCase());
            break;

          case "Date":
          case "Datetime":
            newRow[col.name] = toDateOrNull(rawValue);
            break;

          case "Currency": {
            const base = (currencyBase[c] || "INR").toUpperCase();
            const target = (currencyTarget[c] || "INR").toUpperCase();
            const doConvert = currencyMode === "convert" || base !== target;

            const parsed = parseNumberLike(rawValue);
            const num = Number.isNaN(parsed) ? 0 : parsed;

            if (doConvert) {
              const rateKey = `${base}->${target}`;
              const rate = fxRates[rateKey] || 1; // Use cached rate
              newRow[col.name] = num * rate;
            } else {
              newRow[col.name] = num;
            }
            break;
          }

          default:
            // Do nothing, keep original value
            break;
        }
      }
      return newRow;
    });

    // 3. Commit the fully transformed data to the global state.
    updateCleanedData(newRows);
    recomputeSummary(newRows, dataset.columns);

    console.log("Column types applied. Final data sample:", newRows.slice(0, 2));

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
    const headerLine = dataset.columns.map((c: any) => c.name).join(",");
    const lines = dataset.data.map((row: any) => {
      return dataset.columns
        .map((col: any) => {
          const v = row[col.name];
          if (v === null || v === undefined) return "";
          if (v instanceof Date) return `"${toDDMMYYYY(v)}"`;
          const str = String(v);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",");
    });

    const content = [headerLine, ...lines].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "cleaned_data.csv");
  };

  // -----------------------------------------------------------
  // Preview cell renderer (expanded, matches chosen types)
  // -----------------------------------------------------------

  const renderPreviewCell = (value: any, columnIndex: number): React.ReactNode => {
    const chosenType = colTypes[columnIndex] || dataset.columns[columnIndex].type || "Text";

    if (isNullish(value)) return <span className="text-gray-400">-</span>;
    
    const n = typeof value === "number" ? value : parseNumberLike(value);

    switch(chosenType) {
      case "Number":
      case "Integer":
      case "Float":
        return <span>{Number.isNaN(n) ? String(value) : formatINRNumber(n)}</span>;
      case "Percentage":
        return <span>{Number.isNaN(n) ? String(value) : `${n}%`}</span>;
      case "Boolean":
        return <span>{String(Boolean(value))}</span>;
      case "Date":
      case "Datetime":
        const d = value instanceof Date ? value : toDateOrNull(value);
        return <span>{d ? toDDMMYYYY(d) : "-"}</span>;
      case "Currency":
        const target = currencyTarget[columnIndex] || "INR";
        return <span>{Number.isNaN(n) ? String(value) : formatCurrency(n, target)}</span>;
      default:
        return <span>{String(value)}</span>;
    }
  };

  // -----------------------------------------------------------
  // UI: RENDER
  // -----------------------------------------------------------

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
              <h2 className="text-2xl font-bold text-white">Data Cleaning & Transformation</h2>
              <p className="text-gray-400">Card-based actions with live preview and currency conversion</p>
            </div>
          </div>
          <button onClick={exportCSV} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center">
            <DownloadIcon className="h-4 w-4 mr-2" />
            Export CSV
          </button>
        </div>
      </motion.div>

      {/* Action cards row (equal size) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Missing Values Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}
          className={`rounded-lg p-6 border ${(dataSummary?.missingValues ?? 0) > 0 ? "border-yellow-500 bg-yellow-500/10 text-yellow-300" : "border-gray-700 bg-gray-800/20 text-gray-300"}`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-white">Missing Values</h3>
            </div>
            <span className="text-2xl font-bold">{dataSummary?.missingValues ?? 0}</span>
          </div>
          <button onClick={() => setActiveSection(activeSection === "missing" ? null : "missing")} className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2">
            <Edit3 className="h-4 w-4" />
            <span>Handle Missing</span>
          </button>
        </motion.div>

        {/* Duplicate Records Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}
          className={`rounded-lg p-6 border ${(dataSummary?.duplicates ?? 0) > 0 ? "border-red-500 bg-red-500/10 text-red-300" : "border-gray-700 bg-gray-800/20 text-gray-300"}`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <RefreshCw className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-white">Duplicate Records</h3>
            </div>
            <span className="text-2xl font-bold">{dataSummary?.duplicates ?? 0}</span>
          </div>
          <button onClick={removeDuplicates} className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2" disabled={(dataSummary?.duplicates ?? 0) === 0}>
            <Trash2 className="h-4 w-4" />
            <span>Remove Duplicates</span>
          </button>
        </motion.div>

        {/* Fix Column Types Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }}
          className="rounded-lg p-6 border border-blue-500 bg-blue-500/10 text-blue-300"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Sparkles className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-white">Fix Column Types</h3>
            </div>
            <span className="text-2xl font-bold">{dataset.columns.length}</span>
          </div>
          <button onClick={() => setActiveSection(activeSection === "columns" ? null : "columns")} className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center justify-center space-x-2">
            <Edit3 className="h-4 w-4" />
            <span>Configure</span>
          </button>
        </motion.div>
      </div>

      {/* Toast / notifications */}
      <AnimatePresence>
        {toast.open && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-5 right-5 flex items-center space-x-3 px-4 py-2 rounded-lg border z-50 ${
              toast.tone === "ok" ? "bg-green-600/20 text-green-300 border-green-600" :
              toast.tone === "warn" ? "bg-yellow-600/20 text-yellow-300 border-yellow-600" :
              "bg-red-600/20 text-red-300 border-red-600"
            }`}
          >
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">{toast.text}</span>
            <button className="ml-auto text-gray-400 hover:text-white text-lg" onClick={() => setToast({ open: false, text: "", tone: "ok" })}>&times;</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Panel Below Cards */}
      <AnimatePresence mode="wait">
        {activeSection && (
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35 }}
            className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700 overflow-hidden"
          >
            {/* --- PANELS START HERE --- */}
            {activeSection === "missing" && (
              <div>
                <h3 className="text-xl font-semibold text-white mb-4">Handle Missing Values</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">Strategy</label>
                    <select value={missingStrategy} onChange={(e) => setMissingStrategy(e.target.value as any)} className="bg-gray-700 text-white px-3 py-2 rounded w-full">
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
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Custom Value</label>
                      <input value={missingCustomValue} onChange={(e) => setMissingCustomValue(e.target.value)} className="bg-gray-700 text-white px-3 py-2 rounded w-full" placeholder="e.g. NA, 0, Unknown" />
                    </div>
                  )}
                  <div className="flex items-end">
                    <button onClick={applyMissingValues} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded w-full">Apply Strategy</button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "columns" && (
              <div>
                <h3 className="text-xl font-semibold text-white mb-4">Fix Column Types</h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 p-3 bg-gray-900/50 rounded-lg">
                  <span className="text-gray-300 text-sm font-medium">Currency action:</span>
                  <label className="text-gray-200 text-sm flex items-center gap-2"><input type="radio" name="currencyMode" value="format" checked={currencyMode === "format"} onChange={() => setCurrencyMode("format")}/> Format only</label>
                  <label className="text-gray-200 text-sm flex items-center gap-2"><input type="radio" name="currencyMode" value="convert" checked={currencyMode === "convert"} onChange={() => setCurrencyMode("convert")}/> Live convert values</label>
                  {isFetchingRate && <span className="text-xs text-blue-300">Fetching live rates…</span>}
                  {fxError && <span className="text-xs text-red-300">{fxError}</span>}
                </div>
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                  {dataset.columns.map((col: any, idx: number) => (
                    <div key={col.name} className="flex flex-col md:flex-row md:items-center md:space-x-3 bg-gray-800/40 p-3 rounded border border-gray-700">
                      <div className="flex items-center space-x-2 md:w-1/4 font-medium text-gray-200">{col.name}</div>
                      <div className="mt-2 md:mt-0 md:flex-1">
                        <select value={colTypes[idx]} onChange={(e) => { const next = [...colTypes]; next[idx] = e.target.value; setColTypes(next); }} className="bg-gray-700 text-white px-3 py-2 rounded w-full text-sm">
                          <option value="Text">Text</option> <option value="Number">Number</option> <option value="Integer">Integer</option> <option value="Float">Float</option> <option value="Date">Date</option> <option value="Datetime">Datetime</option> <option value="Boolean">Boolean</option> <option value="Currency">Currency</option> <option value="Percentage">Percentage</option> <option value="Categorical">Categorical</option>
                        </select>
                      </div>
                      {colTypes[idx] === "Currency" && (
                        <>
                          <div className="mt-2 md:mt-0 md:w-32"><select value={currencyBase[idx]} onChange={(e) => { const next = [...currencyBase]; next[idx] = e.target.value; setCurrencyBase(next); }} className="bg-gray-700 text-white px-3 py-2 rounded w-full text-sm">{SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                          <div className="mt-2 md:mt-0 md:w-32"><select value={currencyTarget[idx]} onChange={(e) => { const next = [...currencyTarget]; next[idx] = e.target.value; setCurrencyTarget(next); }} className="bg-gray-700 text-white px-3 py-2 rounded w-full text-sm">{SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        </>
                      )}
                      <div className="mt-2 md:mt-0 md:w-1/4"><div className="bg-gray-900 text-gray-200 px-3 py-2 rounded border border-gray-700 truncate text-sm">{renderPreviewCell(dataset.data[0]?.[col.name], idx)}</div></div>
                    </div>
                  ))}
                </div>
                <div className="mt-4"><button onClick={applyColumnTypes} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Apply Column Types</button></div>
              </div>
            )}
            {/* Preview Table for all panels */}
            <div className="mt-6">
              <h4 className="text-lg font-semibold text-white mb-3">Live Preview (Top {PREVIEW_COUNT} Rows)</h4>
              <div className="overflow-auto max-h-[420px] rounded border border-gray-700">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-gray-900 z-10">
                    <tr>{dataset.columns.map((c: any) => (<th key={c.name} className="text-left p-3 text-gray-300 font-medium">{c.name}</th>))}</tr>
                  </thead>
                  <tbody>
                    {dataset.data.slice(0, PREVIEW_COUNT).map((row: any, rIdx: number) => (
                      <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-gray-800/40" : "bg-gray-800/20"}>
                        {dataset.columns.map((c: any, cIdx: number) => (
                          <td key={c.name} className="p-3 text-gray-300 border-t border-gray-700">{renderPreviewCell(row[c.name], cIdx)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DataCleaning;
