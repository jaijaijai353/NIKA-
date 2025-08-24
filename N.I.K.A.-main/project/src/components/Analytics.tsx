import React, { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useDataContext } from "../context/DataContext";

/**
 * ======================================================================================
 * Analytics.tsx
 * --------------------------------------------------------------------------------------
 * Single-file, fully expanded, robust analytics component that renders:
 *  - Summary Statistics (dynamic, data-driven)
 *  - Distribution Analysis (selectable numeric column, multi-colored bars)
 *  - Trend Analysis (selectable numeric column, line chart)
 *  - Correlation Analysis (pairwise Pearson, selectable X/Y)
 *  - Anomalies (z-score > threshold, highlighted in bar chart)
 *  - Missingness & Cardinality (per column overview)
 *
 * The component is defensive:
 *  - Works if context exposes either `dataset` { columns, data } or plain `data` (array)
 *  - Avoids crashing on undefined/null using guards and defaults
 *  - Shows friendly messages when data is insufficient
 *
 * Styling:
 *  - Tailwind utility classes (no external UI libs)
 *  - Dark theme containers
 *
 * Recharts:
 *  - Bar/Line/Scatter/Pie charts
 *  - Multi-colored bars via <Cell>
 *
 * No extra files created. Everything lives here.
 * ======================================================================================
 */

/* ======================================================================================
 * Color Palettes
 * ====================================================================================== */
const COLORS_PRIMARY = [
  "#00BFA6",
  "#FFC107",
  "#66BB6A",
  "#FF7043",
  "#42A5F5",
  "#AB47BC",
  "#26C6DA",
  "#EC407A",
  "#8D6E63",
  "#7E57C2",
  "#26A69A",
  "#5C6BC0",
  "#9CCC65",
  "#FFCA28",
  "#EF5350",
];

const COLORS_SEQUENTIAL = [
  "#003f5c",
  "#2f4b7c",
  "#665191",
  "#a05195",
  "#d45087",
  "#f95d6a",
  "#ff7c43",
  "#ffa600",
];

/* ======================================================================================
 * Types & Safe Accessors
 * ====================================================================================== */
type DataRow = Record<string, any>;

type DatasetShape = {
  columns?: Array<{
    name: string;
    type?: string; // "numeric" | "categorical" | etc.
    mean?: number;
    median?: number;
    std?: number;
    min?: number;
    max?: number;
    missingCount?: number;
    uniqueCount?: number;
  }>;
  data?: DataRow[];
};

type ContextShape =
  | {
      dataset?: DatasetShape | null;
      data?: DataRow[] | null;
    }
  | any;

const isFiniteNumber = (v: any) =>
  typeof v === "number" && Number.isFinite(v);

/* ======================================================================================
 * Utility (Pure) Functions
 * ====================================================================================== */

/** Safe array length */
const len = (arr: any[] | undefined | null) => (Array.isArray(arr) ? arr.length : 0);

/** Safe mean */
const mean = (arr: number[]) => {
  if (!arr || arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
};

/** Safe median */
const median = (arr: number[]) => {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const m = Math.floor(n / 2);
  return n % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};

/** Safe sample standard deviation */
const stdDev = (arr: number[]) => {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  const varSum = arr.reduce((acc, x) => acc + (x - m) * (x - m), 0);
  return Math.sqrt(varSum / (arr.length - 1));
};

/** Min/Max with guards */
const minMax = (arr: number[]) => {
  if (!arr || arr.length === 0) return { min: 0, max: 0 };
  let mn = arr[0];
  let mx = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < mn) mn = arr[i];
    if (arr[i] > mx) mx = arr[i];
  }
  return { min: mn, max: mx };
};

/** Pearson correlation for same-length numeric arrays */
const pearson = (x: number[], y: number[]) => {
  if (!x || !y) return 0;
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let sumX = 0,
    sumY = 0,
    sumXX = 0,
    sumYY = 0,
    sumXY = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    if (!isFiniteNumber(xi) || !isFiniteNumber(yi)) continue;
    sumX += xi;
    sumY += yi;
    sumXX += xi * xi;
    sumYY += yi * yi;
    sumXY += xi * yi;
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  if (!isFiniteNumber(num) || !isFiniteNumber(den) || den === 0) return 0;
  return num / den;
};

/** Z-Score anomalies (returns indices of outliers) */
const zScoreAnomalies = (arr: number[], threshold = 2.5) => {
  const m = mean(arr);
  const s = stdDev(arr);
  if (s === 0) return [];
  const idxs: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const z = (arr[i] - m) / s;
    if (Math.abs(z) > threshold) idxs.push(i);
  }
  return idxs;
};

/** Count missing (null/undefined/NaN/empty string) */
const isMissing = (v: any) =>
  v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) || v === "";

/** Unique count for a column */
const uniqueCount = (values: any[]) => {
  const set = new Set(values.map((v) => (typeof v === "number" && Number.isNaN(v) ? "__NaN__" : v)));
  return set.size;
};

/* ======================================================================================
 * Data Normalization Helpers
 * ====================================================================================== */

/** Extract raw rows from context that may have dataset or data */
const useRowsAndColumns = (ctx: ContextShape) => {
  const dataset: DatasetShape | null | undefined = ctx?.dataset ?? null;
  const plainData: DataRow[] | null | undefined = ctx?.data ?? null;

  const rows: DataRow[] = useMemo(() => {
    if (dataset && Array.isArray(dataset.data)) return dataset.data as DataRow[];
    if (Array.isArray(plainData)) return plainData as DataRow[];
    return [];
  }, [dataset, plainData]);

  // Build columns from dataset.columns if available; else infer from first row
  const columns = useMemo(() => {
    if (dataset?.columns && Array.isArray(dataset.columns) && dataset.columns.length > 0) {
      return dataset.columns.map((c) => c.name);
    }
    if (rows.length > 0) {
      return Object.keys(rows[0]);
    }
    return [];
  }, [dataset, rows]);

  // Types inference if types are not given
  const numericColumns = useMemo(() => {
    if (dataset?.columns && dataset.columns.length > 0) {
      const numerics = dataset.columns
        .filter((c) => c.type === "numeric" || c.type === "number")
        .map((c) => c.name);
      if (numerics.length > 0) return numerics;
    }
    // Otherwise infer: numeric if value in first non-missing row parses to finite number
    const ncs: string[] = [];
    for (const col of columns) {
      let found = false;
      for (let i = 0; i < rows.length; i++) {
        const v = rows[i]?.[col];
        if (!isMissing(v)) {
          const num = Number(v);
          if (Number.isFinite(num)) ncs.push(col);
          found = true;
          break;
        }
      }
      if (!found) {
        // no non-missing values found; ignore as numeric
      }
    }
    return ncs;
  }, [dataset, rows, columns]);

  const categoricalColumns = useMemo(() => {
    // from dataset metadata if present
    if (dataset?.columns && dataset.columns.length > 0) {
      const cats = dataset.columns
        .filter((c) => c.type === "categorical" || c.type === "string" || c.type === "enum")
        .map((c) => c.name);
      if (cats.length > 0) return cats;
    }
    // infer: non-numeric columns become categorical
    const set = new Set(columns);
    for (const numCol of numericColumns) set.delete(numCol);
    return Array.from(set);
  }, [dataset, columns, numericColumns]);

  return { rows, columns, numericColumns, categoricalColumns, dataset };
};

/* ======================================================================================
 * Derived Data Builders
 * ====================================================================================== */

/** Build summary of dataset: counts, per-column stats */
const useSummary = (rows: DataRow[], columns: string[], numericColumns: string[]) => {
  return useMemo(() => {
    const totalRows = len(rows);
    const totalCols = len(columns);

    // Per-column stats
    const columnSummaries = columns.map((col) => {
      const values = rows.map((r) => r?.[col]);
      const missing = values.filter(isMissing).length;
      const nonMissingValues = values.filter((v) => !isMissing(v));
      const uCount = uniqueCount(nonMissingValues);

      let numericStats: null | {
        mean: number;
        median: number;
        std: number;
        min: number;
        max: number;
      } = null;

      if (numericColumns.includes(col)) {
        const nums = nonMissingValues.map((v) => Number(v)).filter((n) => Number.isFinite(n));
        const m = mean(nums);
        const med = median(nums);
        const sd = stdDev(nums);
        const { min, max } = minMax(nums);
        numericStats = { mean: m, median: med, std: sd, min, max };
      }

      return {
        column: col,
        missing,
        unique: uCount,
        numericStats,
      };
    });

    // Range of means across numeric columns
    const numericMeans = columnSummaries
      .filter((c) => !!c.numericStats)
      .map((c) => c.numericStats!.mean);

    const minMean = numericMeans.length ? Math.min(...numericMeans) : 0;
    const maxMean = numericMeans.length ? Math.max(...numericMeans) : 0;
    const avgNumericMean = numericMeans.length ? mean(numericMeans) : 0;

    return {
      totalRows,
      totalCols,
      columnSummaries,
      minMean,
      maxMean,
      avgNumericMean,
    };
  }, [rows, columns, numericColumns]);
};

/** Build distribution bins for a selected numeric column */
const buildHistogram = (values: number[], desiredBins = 20) => {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return [];
  const { min, max } = minMax(clean);
  if (min === max) {
    // all same values -> single bin
    return [
      {
        bin: `${min.toFixed(2)}-${max.toFixed(2)}`,
        start: min,
        end: max,
        count: clean.length,
      },
    ];
  }
  const binCount = Math.max(1, Math.min(desiredBins, Math.ceil(Math.sqrt(clean.length))));
  const binSize = (max - min) / binCount;
  const bins: { bin: string; start: number; end: number; count: number }[] = [];
  for (let i = 0; i < binCount; i++) {
    const start = min + i * binSize;
    const end = i === binCount - 1 ? max : start + binSize;
    bins.push({
      bin: `${start.toFixed(2)}-${end.toFixed(2)}`,
      start,
      end,
      count: 0,
    });
  }
  for (let i = 0; i < clean.length; i++) {
    const v = clean[i];
    let idx = Math.floor(((v - min) / (max - min)) * binCount);
    if (idx === binCount) idx = binCount - 1; // edge case max
    bins[idx].count += 1;
  }
  return bins;
};

/** Build trend series for selected numeric column (index on x) */
const buildTrendSeries = (rows: DataRow[], col: string) => {
  if (!rows || rows.length === 0 || !col) return [];
  const data = rows
    .map((r, i) => ({ index: i + 1, value: Number(r?.[col]) }))
    .filter((d) => Number.isFinite(d.value));
  return data;
};

/** Build pairwise correlation matrix (flattened) for numeric columns */
const buildCorrelations = (rows: DataRow[], numericCols: string[]) => {
  const out: { pair: string; colX: string; colY: string; corr: number }[] = [];
  if (!rows || rows.length === 0 || !numericCols || numericCols.length < 2) return out;

  const colToArray: Record<string, number[]> = {};
  for (const col of numericCols) {
    colToArray[col] = rows
      .map((r) => Number(r?.[col]))
      .map((v) => (Number.isFinite(v) ? v : NaN))
      .filter((x) => Number.isFinite(x));
  }

  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const colX = numericCols[i];
      const colY = numericCols[j];
      // To align lengths, sample to the shorter length
      const n = Math.min(colToArray[colX].length, colToArray[colY].length);
      if (n < 2) continue;
      const xs = colToArray[colX].slice(0, n);
      const ys = colToArray[colY].slice(0, n);
      const corr = pearson(xs, ys);
      out.push({
        pair: `${colX} vs ${colY}`,
        colX,
        colY,
        corr,
      });
    }
  }
  // sort by absolute correlation desc
  out.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
  return out;
};

/** Build anomalies based on z-scores for a selected numeric column */
const buildAnomalies = (rows: DataRow[], col: string, threshold = 2.5) => {
  if (!rows || rows.length === 0 || !col) return { anomalies: [] as number[], series: [] as number[] };
  const series = rows.map((r) => Number(r?.[col])).filter((v) => Number.isFinite(v));
  const anomalies = zScoreAnomalies(series, threshold);
  return { anomalies, series };
};

/** Build categorical counts for a selected categorical column */
const buildCategoryCounts = (rows: DataRow[], col: string, topN = 15) => {
  if (!rows || rows.length === 0 || !col) return [];
  const counts = new Map<any, number>();
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i]?.[col];
    const key = isMissing(v) ? "__MISSING__" : String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const arr = Array.from(counts, ([name, count]) => ({ name, value: count }));
  arr.sort((a, b) => b.value - a.value);
  return arr.slice(0, topN);
};

/** Build missingness per column */
const buildMissingness = (rows: DataRow[], columns: string[]) => {
  if (!rows || !columns || columns.length === 0) return [];
  const total = rows.length || 1;
  return columns.map((col) => {
    const miss = rows.map((r) => r?.[col]).filter(isMissing).length;
    const pct = (miss / total) * 100;
    return { column: col, missing: miss, percent: pct };
  });
};

/** Build cardinality per column */
const buildCardinality = (rows: DataRow[], columns: string[]) => {
  if (!rows || !columns || columns.length === 0) return [];
  return columns.map((col) => {
    const vals = rows.map((r) => r?.[col]).filter((v) => !isMissing(v));
    const u = uniqueCount(vals);
    return { column: col, unique: u };
  });
};

/* ======================================================================================
 * Insight Generators (Text, data-driven, not pre-recorded)
 * ====================================================================================== */

const summaryInsight = (summary: ReturnType<typeof useSummary>) => {
  if (!summary) return "No summary available.";
  const { totalRows, totalCols, minMean, maxMean, avgNumericMean, columnSummaries } = summary;
  const hasNumeric = columnSummaries.some((c) => !!c.numericStats);

  const numPart = hasNumeric
    ? ` Numeric columns show mean values in the range ${minMean.toFixed(2)}–${maxMean.toFixed(
        2
      )} (overall avg ≈ ${avgNumericMean.toFixed(2)}).`
    : " No numeric columns detected.";

  const highMissing = columnSummaries
    .map((c) => {
      const total = summary.totalRows || 1;
      const pct = (c.missing / total) * 100;
      return { col: c.column, pct };
    })
    .filter((x) => x.pct > 20)
    .slice(0, 3);

  const missPart =
    highMissing.length > 0
      ? ` Columns with higher missingness (>20%): ${highMissing
          .map((x) => `${x.col} (${x.pct.toFixed(1)}%)`)
          .join(", ")}.`
      : "";

  return `Dataset has ${totalRows} rows and ${totalCols} columns.${numPart}${missPart}`;
};

const distributionInsight = (col: string, bins: ReturnType<typeof buildHistogram>) => {
  if (!col) return "Select a numeric column to analyze its distribution.";
  if (!bins || bins.length === 0) return `No numeric values available for "${col}".`;
  const total = bins.reduce((acc, b) => acc + b.count, 0);
  const maxBin = bins.reduce((a, b) => (a.count > b.count ? a : b), bins[0]);
  return `Distribution for "${col}" has ${bins.length} bins over ${total} values. The most populated bin is ${maxBin.bin} with ${maxBin.count} records.`;
};

const trendInsight = (col: string, series: { index: number; value: number }[]) => {
  if (!col) return "Select a numeric column to analyze trends.";
  if (!series || series.length < 2) return `Not enough data points to assess a trend for "${col}".`;
  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;
  const changePct = first === 0 ? 0 : ((last - first) / Math.abs(first)) * 100;
  const direction = last > first ? "upward" : last < first ? "downward" : "flat";
  return `Trend for "${col}" appears ${direction}. Change ≈ ${changePct.toFixed(2)}% from first to last observed point.`;
};

const correlationInsight = (pairs: { pair: string; corr: number }[]) => {
  if (!pairs || pairs.length === 0) return "Not enough numeric columns to compute correlation.";
  const top = pairs.slice(0, 3);
  const text = top
    .map((p) => `${p.pair} (${p.corr >= 0 ? "+" : ""}${p.corr.toFixed(2)})`)
    .join(", ");
  return `Top correlations: ${text}.`;
};

const anomalyInsight = (col: string, anomalies: number[], total: number) => {
  if (!col) return "Select a numeric column to detect anomalies.";
  if (!anomalies) return `No anomaly information available for "${col}".`;
  if (total === 0) return `No values available to detect anomalies in "${col}".`;
  if (anomalies.length === 0) return `No significant anomalies detected for "${col}".`;
  const pct = (anomalies.length / total) * 100;
  return `Detected ${anomalies.length} anomalies in "${col}" (~${pct.toFixed(
    2
  )}% of points) using z-scores.`;
};

const missingnessInsight = (miss: { column: string; missing: number; percent: number }[]) => {
  if (!miss || miss.length === 0) return "No missingness information available.";
  const top = [...miss].sort((a, b) => b.percent - a.percent).slice(0, 3);
  const text = top.map((m) => `${m.column} (${m.percent.toFixed(1)}%)`).join(", ");
  return `Highest missingness: ${text}.`;
};

const cardinalityInsight = (cards: { column: string; unique: number }[]) => {
  if (!cards || cards.length === 0) return "No cardinality information available.";
  const top = [...cards].sort((a, b) => b.unique - a.unique).slice(0, 3);
  const text = top.map((c) => `${c.column} (${c.unique})`).join(", ");
  return `Columns with highest unique values: ${text}.`;
};

/* ======================================================================================
 * Main Component
 * ====================================================================================== */

const Analytics: React.FC = () => {
  const context = useDataContext() as ContextShape;
  
  // Debug: Log when component renders
  console.log("Analytics component rendered:", { 
    hasDataset: !!context.dataset, 
    dataLength: context.dataset?.data?.length,
    updateCounter: context.updateCounter 
  });
  
  // Force re-render when update counter changes
  useEffect(() => {
    console.log("Analytics: Update counter changed to:", context.updateCounter);
  }, [context.updateCounter]);
  
  // Force re-render when dataset data changes
  useEffect(() => {
    console.log("Analytics: Dataset data length changed to:", context.dataset?.data?.length);
  }, [context.dataset?.data?.length]);

  // Normalize rows/columns/types
  const { rows, columns, numericColumns, categoricalColumns } = useRowsAndColumns(context);

  // UI State
  const [selectedNumeric, setSelectedNumeric] = useState<string>("");
  const [selectedNumericTrend, setSelectedNumericTrend] = useState<string>("");
  const [selectedNumericAnomaly, setSelectedNumericAnomaly] = useState<string>("");
  const [selectedCat, setSelectedCat] = useState<string>("");

  // Initialize defaults when columns change
  useEffect(() => {
    if (numericColumns.length > 0) {
      if (!selectedNumeric) setSelectedNumeric(numericColumns[0]);
      if (!selectedNumericTrend) setSelectedNumericTrend(numericColumns[0]);
      if (!selectedNumericAnomaly) setSelectedNumericAnomaly(numericColumns[0]);
    } else {
      setSelectedNumeric("");
      setSelectedNumericTrend("");
      setSelectedNumericAnomaly("");
    }
  }, [numericColumns, selectedNumeric, selectedNumericTrend, selectedNumericAnomaly]);

  useEffect(() => {
    if (categoricalColumns.length > 0) {
      if (!selectedCat) setSelectedCat(categoricalColumns[0]);
    } else {
      setSelectedCat("");
    }
  }, [categoricalColumns, selectedCat]);

  // Derived data
  const summary = useSummary(rows, columns, numericColumns);

  const distBins = useMemo(() => {
    if (!selectedNumeric) return [];
    const vals = rows.map((r) => Number(r?.[selectedNumeric])).filter((n) => Number.isFinite(n));
    return buildHistogram(vals, 24);
  }, [rows, selectedNumeric]);

  const trendSeries = useMemo(() => {
    if (!selectedNumericTrend) return [];
    return buildTrendSeries(rows, selectedNumericTrend);
  }, [rows, selectedNumericTrend]);

  const correlations = useMemo(() => buildCorrelations(rows, numericColumns), [rows, numericColumns]);

  const { anomalies: anomalyIdxs, series: anomalySeries } = useMemo(
    () => buildAnomalies(rows, selectedNumericAnomaly, 2.5),
    [rows, selectedNumericAnomaly]
  );

  const catCounts = useMemo(() => {
    if (!selectedCat) return [];
    return buildCategoryCounts(rows, selectedCat, 20);
  }, [rows, selectedCat]);

  const missingness = useMemo(() => buildMissingness(rows, columns), [rows, columns]);
  const cardinality = useMemo(() => buildCardinality(rows, columns), [rows, columns]);

  // Insight texts
  const summaryText = useMemo(() => summaryInsight(summary), [summary]);
  const distText = useMemo(() => distributionInsight(selectedNumeric, distBins), [selectedNumeric, distBins]);
  const trendText = useMemo(() => trendInsight(selectedNumericTrend, trendSeries), [selectedNumericTrend, trendSeries]);
  const corrText = useMemo(() => correlationInsight(correlations), [correlations]);
  const anomalyText = useMemo(
    () => anomalyInsight(selectedNumericAnomaly, anomalyIdxs, anomalySeries.length),
    [selectedNumericAnomaly, anomalyIdxs, anomalySeries.length]
  );
  const missingText = useMemo(() => missingnessInsight(missingness), [missingness]);
  const cardinalityText = useMemo(() => cardinalityInsight(cardinality), [cardinality]);

  // Helpers for chart color
  const cellColor = useCallback((i: number) => COLORS_PRIMARY[i % COLORS_PRIMARY.length], []);
  const isAnomalyIndex = useCallback((i: number) => anomalyIdxs.includes(i), [anomalyIdxs]);

  /* ===============================================================================
   * Renderers
   * =============================================================================== */

  // Header with counts and selectors
  const Header = () => {
    return (
      <div className="bg-[#111318] border border-gray-800 rounded-2xl p-5 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-100">Advanced Analytics</h2>
            <p className="text-gray-400 text-sm">
              Fully data-driven insights based on your uploaded dataset. No pre-recorded content.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#0C0F14] border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-400">Rows</div>
              <div className="text-xl text-gray-100">{len(rows)}</div>
            </div>
            <div className="bg-[#0C0F14] border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-400">Columns</div>
              <div className="text-xl text-gray-100">{len(columns)}</div>
            </div>
            <div className="bg-[#0C0F14] border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-400">Numeric</div>
              <div className="text-xl text-gray-100">{len(numericColumns)}</div>
            </div>
            <div className="bg-[#0C0F14] border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-400">Categorical</div>
              <div className="text-xl text-gray-100">{len(categoricalColumns)}</div>
            </div>
          </div>
        </div>

        {/* Selectors */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-400 mb-1">Distribution (numeric)</label>
            <select
              className="bg-[#0B0E13] border border-gray-800 rounded-lg text-gray-200 p-2 focus:outline-none"
              value={selectedNumeric}
              onChange={(e) => setSelectedNumeric(e.target.value)}
            >
              {numericColumns.length === 0 && <option value="">No numeric columns</option>}
              {numericColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-400 mb-1">Trend (numeric)</label>
            <select
              className="bg-[#0B0E13] border border-gray-800 rounded-lg text-gray-200 p-2 focus:outline-none"
              value={selectedNumericTrend}
              onChange={(e) => setSelectedNumericTrend(e.target.value)}
            >
              {numericColumns.length === 0 && <option value="">No numeric columns</option>}
              {numericColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-400 mb-1">Anomalies (numeric)</label>
            <select
              className="bg-[#0B0E13] border border-gray-800 rounded-lg text-gray-200 p-2 focus:outline-none"
              value={selectedNumericAnomaly}
              onChange={(e) => setSelectedNumericAnomaly(e.target.value)}
            >
              {numericColumns.length === 0 && <option value="">No numeric columns</option>}
              {numericColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-400 mb-1">Categorical (counts)</label>
            <select
              className="bg-[#0B0E13] border border-gray-800 rounded-lg text-gray-200 p-2 focus:outline-none"
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
            >
              {categoricalColumns.length === 0 && <option value="">No categorical columns</option>}
              {categoricalColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  };

  // Section Container
  const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
    title,
    subtitle,
    children,
  }) => (
    <div className="bg-[#111318] border border-gray-800 rounded-2xl p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
        {subtitle ? <p className="text-sm text-gray-400">{subtitle}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );

  // Chart wrappers with friendly fallbacks
  const DistributionSection = () => {
    const chartData =
      distBins?.map((b, i) => ({
        name: b.bin,
        count: b.count,
        idx: i,
      })) ?? [];

    return (
      <Section title="Distribution Analysis" subtitle={distText}>
        {chartData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#263141" />
                <XAxis dataKey="name" stroke="#AEB6C2" interval={0} angle={-45} textAnchor="end" height={70} />
                <YAxis stroke="#AEB6C2" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0B0E13",
                    border: "1px solid #1f2937",
                    borderRadius: "8px",
                    color: "#E5E7EB",
                  }}
                />
                <Bar dataKey="count">
                  {chartData.map((_, i) => (
                    <Cell key={`cell-d-${i}`} fill={cellColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-gray-400">No distribution data to display.</div>
        )}
      </Section>
    );
  };

  const TrendSection = () => {
    const tData = trendSeries?.map((d) => ({ name: d.index, value: d.value })) ?? [];
    return (
      <Section title="Trend Analysis" subtitle={trendText}>
        {tData.length > 1 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#263141" />
                <XAxis dataKey="name" stroke="#AEB6C2" />
                <YAxis stroke="#AEB6C2" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0B0E13",
                    border: "1px solid #1f2937",
                    borderRadius: "8px",
                    color: "#E5E7EB",
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="#26C6DA" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-gray-400">Not enough data to display a trend.</div>
        )}
      </Section>
    );
  };

  const CorrelationSection = () => {
    const cData =
      correlations?.map((c, i) => ({
        pair: c.pair,
        corr: c.corr,
        idx: i,
      })) ?? [];

    // Map corr [-1,1] to positive heights using abs for display; keep sign in label
    const visData = cData.map((d) => ({ name: d.pair, value: Math.abs(d.corr), sign: d.corr >= 0 ? "+" : "-" }));

    return (
      <Section title="Correlation Analysis" subtitle={corrText}>
        {visData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#263141" />
                <XAxis dataKey="name" stroke="#AEB6C2" interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis stroke="#AEB6C2" domain={[0, 1]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0B0E13",
                    border: "1px solid #1f2937",
                    borderRadius: "8px",
                    color: "#E5E7EB",
                  }}
                  formatter={(val: any, _name: any, entry: any) => {
                    const original = correlations?.[entry?.payload?.idx]?.corr ?? 0;
                    return [`${original >= 0 ? "+" : ""}${original.toFixed(3)}`, "corr"];
                  }}
                />
                <Bar dataKey="value">
                  {visData.map((_, i) => (
                    <Cell key={`cell-c-${i}`} fill={cellColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-gray-400">Not enough numeric columns to compute correlations.</div>
        )}
      </Section>
    );
  };

  const AnomalySection = () => {
    const aData =
      anomalySeries?.map((v, i) => ({
        index: i + 1,
        value: v,
        isAnomaly: isAnomalyIndex(i),
      })) ?? [];

    return (
      <Section title="Anomaly Detection" subtitle={anomalyText}>
        {aData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#263141" />
                <XAxis dataKey="index" stroke="#AEB6C2" />
                <YAxis stroke="#AEB6C2" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0B0E13",
                    border: "1px solid #1f2937",
                    borderRadius: "8px",
                    color: "#E5E7EB",
                  }}
                  formatter={(val: any, _name: any, entry: any) => {
                    return [val, entry?.payload?.isAnomaly ? "value (anomaly)" : "value"];
                  }}
                />
                <Bar dataKey="value">
                  {aData.map((d, i) => (
                    <Cell key={`cell-a-${i}`} fill={d.isAnomaly ? "#EF5350" : cellColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-gray-400">No numeric series available for anomaly detection.</div>
        )}

        {/* List anomalies explicitly */}
        <div className="mt-4">
          {anomalyIdxs.length > 0 ? (
            <div className="text-sm text-gray-300">
              Indices flagged:{" "}
              <span className="text-gray-100">
                {anomalyIdxs.map((i) => i + 1).join(", ")}
              </span>
            </div>
          ) : (
            <div className="text-sm text-gray-400">No points exceeded the z-score threshold.</div>
          )}
        </div>
      </Section>
    );
  };

  const CategorySection = () => {
    const cData = catCounts ?? [];

    return (
      <Section title="Categorical Distribution" subtitle={selectedCat ? `Breakdown for "${selectedCat}"` : "Select a categorical column to see counts."}>
        {cData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#263141" />
                <XAxis dataKey="name" stroke="#AEB6C2" interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis stroke="#AEB6C2" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0B0E13",
                    border: "1px solid #1f2937",
                    borderRadius: "8px",
                    color: "#E5E7EB",
                  }}
                />
                <Bar dataKey="value">
                  {cData.map((_, i) => (
                    <Cell key={`cell-cat-${i}`} fill={cellColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-gray-400">No categorical distribution available.</div>
        )}
      </Section>
    );
  };

  const MissingnessSection = () => {
    const mData = missingness ?? [];
    return (
      <Section title="Missingness Overview" subtitle={missingText}>
        {mData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#263141" />
                <XAxis dataKey="column" stroke="#AEB6C2" interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis stroke="#AEB6C2" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0B0E13",
                    border: "1px solid #1f2937",
                    borderRadius: "8px",
                    color: "#E5E7EB",
                  }}
                  formatter={(val: any, name: any) => {
                    if (name === "percent") return [`${Number(val).toFixed(2)}%`, "missing"];
                    return [val, name];
                  }}
                />
                <Legend />
                <Bar dataKey="missing" name="Missing Count">
                  {mData.map((_, i) => (
                    <Cell key={`cell-m1-${i}`} fill={COLORS_SEQUENTIAL[i % COLORS_SEQUENTIAL.length]} />
                  ))}
                </Bar>
                <Bar dataKey="percent" name="Missing %">
                  {mData.map((_, i) => (
                    <Cell key={`cell-m2-${i}`} fill={COLORS_PRIMARY[(i + 3) % COLORS_PRIMARY.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-gray-400">No missingness information available.</div>
        )}
      </Section>
    );
  };

  const CardinalitySection = () => {
    const cd = cardinality ?? [];
    return (
      <Section title="Cardinality (Unique Values)" subtitle={cardinalityText}>
        {cd.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cd}>
                <CartesianGrid strokeDasharray="3 3" stroke="#263141" />
                <XAxis dataKey="column" stroke="#AEB6C2" interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis stroke="#AEB6C2" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0B0E13",
                    border: "1px solid #1f2937",
                    borderRadius: "8px",
                    color: "#E5E7EB",
                  }}
                />
                <Bar dataKey="unique">
                  {cd.map((_, i) => (
                    <Cell key={`cell-u-${i}`} fill={cellColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-gray-400">No cardinality information available.</div>
        )}
      </Section>
    );
  };

  // Summary table (compact but safe)
  const SummaryTable = () => {
    const cs = summary?.columnSummaries ?? [];
    return (
      <Section title="Summary Statistics" subtitle={summaryText}>
        {cs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left p-3 text-gray-300 font-medium">Column</th>
                  <th className="text-left p-3 text-gray-300 font-medium">Missing</th>
                  <th className="text-left p-3 text-gray-300 font-medium">Unique</th>
                  <th className="text-left p-3 text-gray-300 font-medium">Mean</th>
                  <th className="text-left p-3 text-gray-300 font-medium">Median</th>
                  <th className="text-left p-3 text-gray-300 font-medium">Std</th>
                  <th className="text-left p-3 text-gray-300 font-medium">Min</th>
                  <th className="text-left p-3 text-gray-300 font-medium">Max</th>
                </tr>
              </thead>
              <tbody>
                {cs.map((s, i) => {
                  const n = s.numericStats;
                  return (
                    <tr key={s.column} className="border-b border-gray-900 hover:bg-gray-900/30">
                      <td className="p-3 text-gray-100 font-medium">{s.column}</td>
                      <td className="p-3 text-gray-300">{s.missing}</td>
                      <td className="p-3 text-gray-300">{s.unique}</td>
                      <td className="p-3 text-gray-300">{n ? n.mean.toFixed(3) : "—"}</td>
                      <td className="p-3 text-gray-300">{n ? n.median.toFixed(3) : "—"}</td>
                      <td className="p-3 text-gray-300">{n ? n.std.toFixed(3) : "—"}</td>
                      <td className="p-3 text-gray-300">{n ? n.min.toFixed(3) : "—"}</td>
                      <td className="p-3 text-gray-300">{n ? n.max.toFixed(3) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-400">No columns available.</div>
        )}
      </Section>
    );
  };

  /* ===============================================================================
   * Empty state
   * =============================================================================== */
  if (len(rows) === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">No data available. Please upload a dataset to see analytics.</p>
      </div>
    );
  }

  /* ===============================================================================
   * Layout
   * =============================================================================== */
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Header />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <SummaryTable />
        <CategorySection />
        <DistributionSection />
        <TrendSection />
        <CorrelationSection />
        <AnomalySection />
        <MissingnessSection />
        <CardinalitySection />
      </motion.div>
    </div>
  );
};

export default Analytics;

