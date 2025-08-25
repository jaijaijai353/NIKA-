// src/components/AdvancedVisualizations.tsx
//
// AdvancedVisualizations - Full non-condensed component (~500+ lines)
// Features:
// - Summary stats panel
// - Sticky header table with pagination + search
// - Selectable X / Y axis for chart generation
// - Bar, Line, Area, Pie, Histogram, Scatter, Combo, Stacked
// - Histogram binning implementation
// - Per-bar distinct colors with palette selector
// - Hover animations on bars (framer-motion + recharts events)
// - Lots of comments and helper functions (keeps file long as requested)
//
// NOTE: Ensure `recharts`, `framer-motion` and your DataContext are installed and configured.

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ComposedChart,
  Legend,
} from "recharts";
import { useDataContext } from "../context/DataContext";
import { Search, Download, Filter } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* --------------------------- Helper Types & Interfaces --------------------- */
/* -------------------------------------------------------------------------- */

type AnyRow = Record<string, any>;

type ColumnMeta = {
  name: string;
  type: "Numeric" | "Text" | "Categorical" | "Date" | string;
};

/* -------------------------------------------------------------------------- */
/* ---------------------------- Utility Functions --------------------------- */
/* -------------------------------------------------------------------------- */

/**
 * isNumberLike - loosely check if a value is numeric
 */
function isNumberLike(val: any) {
  if (val === null || val === undefined || val === "") return false;
  if (typeof val === "number") return true;
  if (typeof val === "string") return !isNaN(Number(val));
  return false;
}

/**
 * uniqueValues - returns unique values for a column (stringified)
 */
function uniqueValues(data: AnyRow[], col: string) {
  const set = new Set<string>();
  data.forEach((row) => {
    const v = row[col];
    set.add(v === null || v === undefined ? "__NULL__" : String(v));
  });
  return Array.from(set);
}

/**
 * binNumeric - create histogram bins for a numeric array
 * returns an array of {name: "low-high", value: count, low, high}
 */
function binNumeric(values: number[], binCount = 10) {
  if (!values || values.length === 0) return [];
  const filtered = values.filter((v) => typeof v === "number" && !isNaN(v));
  if (filtered.length === 0) return [];
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const range = max - min;
  const step = range === 0 ? 1 : range / binCount;

  const bins: { low: number; high: number; count: number }[] = [];
  for (let i = 0; i < binCount; i++) {
    const low = min + i * step;
    const high = i === binCount - 1 ? max : low + step;
    bins.push({ low, high, count: 0 });
  }
  filtered.forEach((v) => {
    let idx = Math.floor((v - min) / step);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count++;
  });

  return bins.map((b) => ({
    name: `${Number(b.low.toFixed(2))} - ${Number(b.high.toFixed(2))}`,
    value: b.count,
    low: b.low,
    high: b.high,
  }));
}

/**
 * corrCoefficient - Pearson correlation between two number arrays
 */
function corrCoefficient(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  const meanA = a.reduce((x, y) => x + y, 0) / n;
  const meanB = b.reduce((x, y) => x + y, 0) / n;
  const numerator = a.reduce((acc, ai, i) => acc + (ai - meanA) * (b[i] - meanB), 0);
  const denomA = Math.sqrt(a.reduce((acc, ai) => acc + Math.pow(ai - meanA, 2), 0));
  const denomB = Math.sqrt(b.reduce((acc, bi) => acc + Math.pow(bi - meanB, 2), 0));
  const denom = denomA * denomB;
  if (denom === 0) return 0;
  return numerator / denom;
}

/* -------------------------------------------------------------------------- */
/* ------------------------------- Color Palettes --------------------------- */
/* -------------------------------------------------------------------------- */

const PALETTES: Record<string, string[]> = {
  Default: [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#06B6D4",
    "#F97316",
    "#EC4899",
    "#64748B",
    "#0EA5E9",
  ],
  Vibrant: [
    "#ff6b6b",
    "#ffb86b",
    "#ffd86b",
    "#6bff8a",
    "#6bd6ff",
    "#8a6bff",
    "#ff6bda",
    "#6bffd8",
    "#ffd26b",
  ],
  Pastel: [
    "#a8dadc",
    "#ffd6a5",
    "#ffc6ff",
    "#e2f0cb",
    "#c9c9ff",
    "#f9d1d1",
    "#d0f0c0",
    "#f0e5d8",
  ],
  Dark: [
    "#0f172a",
    "#1f2937",
    "#374151",
    "#4b5563",
    "#6b7280",
    "#9ca3af",
    "#d1d5db",
  ],
};

/* -------------------------------------------------------------------------- */
/* ---------------------------- Main Component ------------------------------ */
/* -------------------------------------------------------------------------- */

const AdvancedVisualizations: React.FC = () => {
  // ========== Data from context ==========
  const { cleanedData, columns: contextColumns } = useDataContext(); // assume cleanedData: AnyRow[], columns: ColumnMeta[] or string[]
  // Fallbacks
  const data: AnyRow[] = cleanedData || [];

  // derive columns metadata (if context doesn't provide metadata)
  const derivedColumns: ColumnMeta[] = useMemo(() => {
    if (contextColumns && Array.isArray(contextColumns) && contextColumns.length > 0) {
      // if columns are strings convert them
      if (typeof contextColumns[0] === "string") {
        return (contextColumns as string[]).map((n) => ({ name: n, type: "Text" }));
      }
      // else assume ColumnMeta
      return contextColumns as ColumnMeta[];
    }
    // else derive from first row
    if (data.length === 0) return [];
    const first = data[0];
    return Object.keys(first).map((k) => {
      const sample = first[k];
      if (isNumberLike(sample)) return { name: k, type: "Numeric" };
      if (Object.prototype.toString.call(sample) === "[object Date]") return { name: k, type: "Date" };
      return { name: k, type: "Text" };
    });
  }, [contextColumns, data]);

  // ========== UI state ==========
  const [selectedPalette, setSelectedPalette] = useState<string>("Default");
  const [selectedChart, setSelectedChart] = useState<string>("bar"); // bar, line, area, pie, histogram, scatter, combo, stacked
  const [selectedX, setSelectedX] = useState<string>(() => (derivedColumns[0]?.name ?? ""));
  const [selectedY, setSelectedY] = useState<string>(() => {
    const numeric = derivedColumns.find((c) => c.type === "Numeric");
    return numeric ? numeric.name : derivedColumns[0]?.name ?? "";
  });
  const [binCount, setBinCount] = useState<number>(10);
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const rowsPerPage = 10;
  const [activeBarIndex, setActiveBarIndex] = useState<number | null>(null);
  const [stackKeys, setStackKeys] = useState<string[]>([]); // used for stacked chart: columns to stack (categorical unique values)

  // palette
  const colors = PALETTES[selectedPalette] || PALETTES.Default;

  // ========== Derived lists ==========
  const columnNames = derivedColumns.map((c) => c.name);

  useEffect(() => {
    // ensure selectedX/Y exist after columns change
    if (columnNames.length > 0) {
      if (!selectedX) setSelectedX(columnNames[0]);
      if (!selectedY) {
        const numeric = derivedColumns.find((c) => c.type === "Numeric");
        setSelectedY(numeric ? numeric.name : columnNames[0]);
      }
    }
  }, [derivedColumns, columnNames, selectedX, selectedY]);

  // ========== Filtering & Pagination ==========
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [data, search]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, page]);

  useEffect(() => {
    // reset page when filter changes
    setPage(1);
  }, [search]);

  // ========== Summary Stats ==========
  const summaryStats = useMemo(() => {
    const rows = data.length;
    const cols = derivedColumns.length;
    let missing = 0;
    data.forEach((row) =>
      derivedColumns.forEach((c) => {
        const v = row[c.name];
        if (v === null || v === undefined || v === "") missing++;
      })
    );
    return { rows, cols, missing };
  }, [data, derivedColumns]);

  // ========== Numeric columns & types ==========
  const numericColumns = useMemo(() => derivedColumns.filter((c) => c.type === "Numeric").map((c) => c.name), [derivedColumns]);
  const categoricalColumns = useMemo(() => derivedColumns.filter((c) => c.type === "Text" || c.type === "Categorical").map((c) => c.name), [derivedColumns]);

  // ========== Chart Data Creation ==========
  // Generic chart data structure: [{ name, value, ...otherFields }]
  const generatedChartData = useMemo(() => {
    if (!selectedX || !selectedY) return [];
    // if selectedX is categorical or text we group by it
    const xIsNumeric = numericColumns.includes(selectedX);
    const yIsNumeric = numericColumns.includes(selectedY);

    // If X is numeric and chart is histogram we will bin Y or X depending on selection
    if (selectedChart === "histogram") {
      // For histogram we will bin the Y (if Y numeric) or X if X numeric - choose numeric column if possible
      const histCol = yIsNumeric ? selectedY : (xIsNumeric ? selectedX : selectedY);
      const values = data.map((r) => Number(r[histCol])).filter((v) => !isNaN(v));
      const bins = binNumeric(values, binCount);
      return bins.map((b) => ({ name: b.name, value: b.value, low: b.low, high: b.high }));
    }

    // For other charts: group by X and aggregate Y (sum or average)
    const grouping: Record<string, { name: string; value: number; __rows: AnyRow[] }> = {};
    data.forEach((row, idx) => {
      const xRaw = row[selectedX];
      const xVal = xRaw === undefined || xRaw === null ? "__NULL__" : String(xRaw);
      const yRaw = Number(row[selectedY]);
      const yVal = isNaN(yRaw) ? 0 : yRaw;
      if (!grouping[xVal]) grouping[xVal] = { name: xVal, value: 0, __rows: [] };
      grouping[xVal].value += yVal;
      grouping[xVal].__rows.push(row);
    });

    const arr = Object.values(grouping);
    // attempt to sort if X is numeric-like
    if (arr.length > 0 && arr.every((a) => !isNaN(Number(a.name)))) {
      arr.sort((a, b) => Number(a.name) - Number(b.name));
    }
    return arr;
  }, [selectedX, selectedY, data, selectedChart, binCount, numericColumns]);

  // ========== Stacked Data (for stacked bar) ==========
  const stackedChartData = useMemo(() => {
    if (selectedChart !== "stacked") return [];
    // stacked keys = unique values of selectedX (categorical) stacked across Y? We'll support stacking by categories of another column.
    // For stacked scenario, we'll create an object per X with keys as unique values from a chosen 'stackBy' column. For simplicity we'll stack selectedY by unique categories of that Y column if not numeric.
    // In this implementation the user will select a "stackBy" column separately. For now if stackKeys empty derive from selectedX unique values.
    const stackBy = stackKeys.length > 0 ? stackKeys : uniqueValues(data, selectedX).slice(0, 10);
    const map: Record<string, any> = {};
    data.forEach((row) => {
      const xVal = row[selectedX] ?? "__NULL__";
      const sVal = row[selectedY] ?? "__NULL__";
      if (!map[xVal]) map[xVal] = { name: String(xVal) };
      // We'll increment count for category sVal
      const key = String(sVal);
      if (!map[xVal][key]) map[xVal][key] = 0;
      map[xVal][key] += isNumberLike(row[selectedY]) ? Number(row[selectedY]) : 1;
    });
    return Object.values(map);
  }, [selectedChart, data, selectedX, selectedY, stackKeys]);

  // ========== Correlation Matrix ==========
  const correlationMatrix = useMemo(() => {
    if (!numericColumns || numericColumns.length < 2) return null;
    const n = numericColumns.length;
    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        const a = data.map((d) => Number(d[numericColumns[i]])).map((v) => (isNaN(v) ? 0 : v));
        const b = data.map((d) => Number(d[numericColumns[j]])).map((v) => (isNaN(v) ? 0 : v));
        row.push(corrCoefficient(a, b));
      }
      matrix.push(row);
    }
    return matrix;
  }, [numericColumns, data]);

  /* -------------------------------------------------------------------------- */
  /* --------------------------- Rendering helpers ---------------------------- */
  /* -------------------------------------------------------------------------- */

  // helper to pick a color for an index
  function colorForIndex(index: number) {
    return colors[index % colors.length];
  }

  // tooltip formatter for Recharts
  const tooltipFormatter = (value: any, name: any, props: any) => {
    return [value, name];
  };

  // highlight style for hovered bars (we maintain activeBarIndex)
  const onBarEnter = (idx: number | null) => {
    setActiveBarIndex(idx);
  };

  // build unique categories for X when X is categorical (used in pie or stacked)
  const xCategories = useMemo(() => {
    if (!selectedX) return [];
    return uniqueValues(data, selectedX);
  }, [data, selectedX]);

  /* -------------------------------------------------------------------------- */
  /* ------------------------------- JSX Output ------------------------------- */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="p-6 space-y-6">
      {/* ------------------------------ Header --------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold">Advanced Visualizations</h1>
          <p className="text-sm text-gray-400">Interactive analytics and chart generation</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded"
            onClick={() => {
              // simple CSV export: header + rows, quick implementation
              const headers = columnNames;
              const csvRows = [headers.join(",")];
              data.forEach((row) => {
                const line = headers.map((h) => JSON.stringify(row[h] ?? "")).join(",");
                csvRows.push(line);
              });
              const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "export.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </motion.div>

      {/* --------------------------- Summary Stats ----------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-3 gap-4"
      >
        <div className="bg-gray-800/40 p-4 rounded border border-gray-700">
          <div className="text-sm text-gray-300">Rows</div>
          <div className="text-2xl font-semibold">{summaryStats.rows}</div>
        </div>
        <div className="bg-gray-800/40 p-4 rounded border border-gray-700">
          <div className="text-sm text-gray-300">Columns</div>
          <div className="text-2xl font-semibold">{summaryStats.cols}</div>
        </div>
        <div className="bg-gray-800/40 p-4 rounded border border-gray-700">
          <div className="text-sm text-gray-300">Missing Values</div>
          <div className="text-2xl font-semibold">{summaryStats.missing}</div>
        </div>
      </motion.div>

      {/* ------------------------ Controls: Chart + Axes ------------------------ */}
      <motion.div
        className="bg-gray-800/20 p-4 rounded border border-gray-700"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart Type */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">Chart Type</label>
            <select
              value={selectedChart}
              onChange={(e) => setSelectedChart(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
            >
              <option value="bar">Bar Chart</option>
              <option value="line">Line Chart</option>
              <option value="area">Area Chart</option>
              <option value="pie">Pie Chart</option>
              <option value="histogram">Histogram</option>
              <option value="scatter">Scatter Plot</option>
              <option value="combo">Combo Chart</option>
              <option value="stacked">Stacked Bar Chart</option>
            </select>
          </div>

          {/* X Axis */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">X Axis</label>
            <select
              value={selectedX}
              onChange={(e) => setSelectedX(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
            >
              {columnNames.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          {/* Y Axis */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">Y Axis</label>
            <select
              value={selectedY}
              onChange={(e) => setSelectedY(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
            >
              {columnNames.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Additional controls */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Color Palette</label>
            <select
              value={selectedPalette}
              onChange={(e) => setSelectedPalette(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
            >
              {Object.keys(PALETTES).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Bins (Histogram)</label>
            <input
              type="range"
              min={3}
              max={50}
              value={binCount}
              onChange={(e) => setBinCount(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-gray-400">Bins: {binCount}</div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Stack Keys (comma separated)</label>
            <input
              type="text"
              placeholder="example: A,B,C"
              onBlur={(e) => {
                const text = e.target.value.trim();
                if (!text) setStackKeys([]);
                else setStackKeys(text.split(",").map((s) => s.trim()));
              }}
              className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600"
            />
            <div className="text-xs text-gray-400">Used for stacked chart composition.</div>
          </div>
        </div>
      </motion.div>

      {/* --------------------------- Chart Area ------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="bg-gray-900/20 border border-gray-700 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Generated Chart</h2>
          <div style={{ width: "100%", height: 420 }}>
            <ResponsiveContainer>
              {/* BAR CHART */}
              {selectedChart === "bar" && (
                <BarChart
                  data={generatedChartData}
                  margin={{ top: 20, right: 20, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#273141" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} />
                  <YAxis />
                  <ReTooltip formatter={tooltipFormatter} />
                  <Bar
                    dataKey="value"
                    onMouseLeave={() => onBarEnter(null)}
                    onMouseEnter={(_, index) => onBarEnter(index)}
                    // setting isAnimationActive true will trigger Recharts animation
                    isAnimationActive={true}
                    animationDuration={400}
                  >
                    {generatedChartData.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={activeBarIndex === index ? shadeColor(colorForIndex(index), -12) : colorForIndex(index)}
                        cursor="pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              )}

              {/* LINE CHART */}
              {selectedChart === "line" && (
                <LineChart data={generatedChartData} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273141" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} />
                  <YAxis />
                  <ReTooltip />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={colors[0]}
                    strokeWidth={2}
                    activeDot={{ r: 8 }}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              )}

              {/* AREA CHART */}
              {selectedChart === "area" && (
                <AreaChart data={generatedChartData} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273141" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} />
                  <YAxis />
                  <ReTooltip />
                  <Area type="monotone" dataKey="value" stroke={colors[0]} fill={makeTransparent(colors[0], 0.35)} />
                </AreaChart>
              )}

              {/* PIE CHART */}
              {selectedChart === "pie" && (
                <PieChart>
                  <Pie
                    data={generatedChartData.slice(0, 12)}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={140}
                    innerRadius={60}
                    label
                  >
                    {generatedChartData.slice(0, 12).map((entry: any, index: number) => (
                      <Cell key={`slice-${index}`} fill={colorForIndex(index)} />
                    ))}
                  </Pie>
                  <ReTooltip />
                </PieChart>
              )}

              {/* HISTOGRAM */}
              {selectedChart === "histogram" && (
                <BarChart data={generatedChartData} margin={{ top: 20, right: 20, left: 0, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273141" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} />
                  <YAxis />
                  <ReTooltip />
                  <Bar dataKey="value" isAnimationActive>
                    {generatedChartData.map((entry: any, idx: number) => (
                      <Cell key={`hist-${idx}`} fill={colorForIndex(idx)} />
                    ))}
                  </Bar>
                </BarChart>
              )}

              {/* SCATTER */}
              {selectedChart === "scatter" && (
                <ScatterChart data={generatedChartData} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273141" />
                  <XAxis dataKey="name" />
                  <YAxis dataKey="value" />
                  <ReTooltip />
                  <Scatter data={generatedChartData} fill={colors[0]}>
                    {generatedChartData.map((entry: any, idx: number) => (
                      <Cell key={`s-${idx}`} fill={colorForIndex(idx)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              )}

              {/* COMBO */}
              {selectedChart === "combo" && (
                <ComposedChart data={generatedChartData} margin={{ top: 20, right: 20, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273141" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} />
                  <YAxis />
                  <ReTooltip />
                  <Legend />
                  <Bar dataKey="value" fill={colors[0]} />
                  <Line type="monotone" dataKey="value" stroke={colors[1] || colors[0]} strokeWidth={2} />
                </ComposedChart>
              )}

              {/* STACKED */}
              {selectedChart === "stacked" && (
                <BarChart
                  data={stackedChartData}
                  margin={{ top: 20, right: 20, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#273141" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={80} />
                  <YAxis />
                  <ReTooltip />
                  <Legend />
                  {Object.keys(stackedChartData[0] || {})
                    .filter((k) => k !== "name")
                    .map((k, idx) => (
                      <Bar key={k} dataKey={k} stackId="a" fill={colorForIndex(idx)} />
                    ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* tiny help text */}
          <div className="mt-2 text-xs text-gray-400">
            Tip: Hover bars to highlight. Use palette and type controls above. Histogram bins come from the slider.
          </div>
        </div>
      </motion.div>

      {/* ----------------------------- Chart Details ---------------------------- */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Auto Chart Previews */}
          <div className="bg-gray-900/10 p-4 rounded border border-gray-700">
            <h3 className="font-semibold mb-2">Auto Chart Previews</h3>
            <div className="grid grid-cols-1 gap-3">
              {/* Show previews for first 2 columns or selected */}
              {columnNames.slice(0, 2).map((col, i) => {
                const isNum = numericColumns.includes(col);
                const previewData = isNum
                  ? data.map((d, idx) => ({ name: `Row ${idx + 1}`, value: Number(d[col]) }))
                  : Object.entries(
                      data.reduce((acc: Record<string, number>, cur: AnyRow) => {
                        const v = cur[col] ?? "__NULL__";
                        acc[String(v)] = (acc[String(v)] || 0) + 1;
                        return acc;
                      }, {})
                    ).map(([k, v]) => ({ name: k, value: v }));

                return (
                  <motion.div
                    key={col}
                    className="border rounded p-3"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-medium">{col}</div>
                      <div className="text-xs text-gray-400">{isNum ? "Numeric" : "Categorical"}</div>
                    </div>
                    <div style={{ width: "100%", height: 180 }}>
                      <ResponsiveContainer>
                        {isNum ? (
                          <BarChart data={previewData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" hide />
                            <YAxis />
                            <ReTooltip />
                            <Bar dataKey="value" fill={colors[0]}>
                              {previewData.map((_, idx) => (
                                <Cell key={idx} fill={colorForIndex(idx)} />
                              ))}
                            </Bar>
                          </BarChart>
                        ) : (
                          <PieChart>
                            <Pie
                              data={previewData.slice(0, 8)}
                              dataKey="value"
                              nameKey="name"
                              outerRadius={70}
                              label
                            >
                              {previewData.slice(0, 8).map((_, idx) => (
                                <Cell key={idx} fill={colorForIndex(idx)} />
                              ))}
                            </Pie>
                            <ReTooltip />
                          </PieChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Right: Correlation & Details */}
          <div className="bg-gray-900/10 p-4 rounded border border-gray-700">
            <h3 className="font-semibold mb-2">Correlation Matrix</h3>
            {/* -- HEATMAP FEATURE REMOVED -- */}
            <div className="text-sm text-gray-400">
              {correlationMatrix
                ? "Correlation data is available, but the heatmap component has been removed."
                : "Not enough numeric columns to compute correlation."
              }
            </div>
          </div>
        </div>
      </motion.div>

      {/* ------------------------- Data Table (sticky header) ------------------- */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="p-2 rounded bg-gray-800/20 border border-gray-700"
            />
          </div>

          <div className="text-sm text-gray-400">
            Showing {filteredData.length} rows • Page {page} of {Math.max(1, Math.ceil(filteredData.length / rowsPerPage))}
          </div>
        </div>

        <div className="overflow-auto rounded border border-gray-700 max-h-[380px]">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-900/60 backdrop-blur z-10">
              <tr>
                {columnNames.map((c) => (
                  <th key={c} className="px-3 py-2 text-left border-b">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-gray-800/10">
                  {columnNames.map((c, i) => (
                    <td key={i} className="px-3 py-2 border-b align-top">
                      {String(row[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        <div className="flex items-center justify-between mt-2">
          <div className="space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded bg-gray-800/20 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => (p * rowsPerPage < filteredData.length ? p + 1 : p))}
              disabled={page * rowsPerPage >= filteredData.length}
              className="px-3 py-1 rounded bg-gray-800/20 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="text-xs text-gray-400">Rows per page: {rowsPerPage}</div>
        </div>
      </motion.div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* ----------------------------- Small Helpers ------------------------------ */
/* -------------------------------------------------------------------------- */

/**
 * shadeColor - lighten or darken hex color (percent negative to darken)
 */
function shadeColor(hex: string, percent: number) {
  // strip #
  const s = hex.replace("#", "");
  const num = parseInt(s, 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;
  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);
  return "#" + (r << 16 | g << 8 | b).toString(16).padStart(6, "0");
}

/**
 * makeTransparent - return rgba string for hex with alpha
 */
function makeTransparent(hex: string, alpha = 0.5) {
  const s = hex.replace("#", "");
  const num = parseInt(s, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* -------------------------------------------------------------------------- */
/* ------------------------------- Export ---------------------------------- */
/* -------------------------------------------------------------------------- */

export default AdvancedVisualizations;
