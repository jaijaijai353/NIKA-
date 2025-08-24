import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
} from "recharts";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Target,
  Lightbulb,
  Star,
  ArrowRight,
  Search,
  Filter,
  Settings,
  ChevronDown,
  ChevronUp,
  Download,
  Zap,
  Columns,
  FileText,
} from "lucide-react";
import { useDataContext } from "../context/DataContext";

/**
 * AIInsights.tsx
 *
 * Single-file, expanded AI-powered insights panel.
 * - Reads the cleaned dataset from useDataContext()
 * - Computes summary stats, trends, correlations, anomalies, categorical breakdowns
 * - Generates dynamic insight objects (type/title/desc/confidence/importance/meta)
 * - UI: search, filters, sort, collapsible groups, sparkline mini-charts, drilldown modal
 * - Defensive: guards for missing/insufficient data
 *
 * Drop into src/components and render <AIInsights /> inside your app.
 */

/* ===========================
   Types
   =========================== */

type Row = Record<string, any>;

type InsightType =
  | "anomaly"
  | "trend"
  | "correlation"
  | "recommendation"
  | "quality"
  | "categorical"
  | "segmentation"
  | "other";

type Insight = {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  confidence: number; // 0..1
  importance: "high" | "medium" | "low";
  meta?: Record<string, any>; // supporting data for drilldown/chart
};

/* ===========================
   Palette / small utilities
   =========================== */

const PALETTE = [
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
];

const safeLen = (arr?: any[]) => (Array.isArray(arr) ? arr.length : 0);
const isMissing = (v: any) =>
  v === null ||
  v === undefined ||
  v === "" ||
  (typeof v === "number" && Number.isNaN(v));
const isFiniteNumber = (v: any) => typeof v === "number" && Number.isFinite(v);

const toNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/* ===========================
   Math helpers
   =========================== */

const mean = (arr: number[]) => {
  if (!arr || arr.length === 0) return 0;
  const s = arr.reduce((a, b) => a + b, 0);
  return s / arr.length;
};

const median = (arr: number[]) => {
  if (!arr || arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const stdDev = (arr: number[]) => {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
};

const minMax = (arr: number[]) => {
  if (!arr || arr.length === 0) return { min: 0, max: 0 };
  let mn = arr[0],
    mx = arr[0];
  for (let i = 1; i < arr.length; i++) {
    const v = arr[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { min: mn, max: mx };
};

const pearson = (x: number[], y: number[]) => {
  if (!x || !y) return 0;
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isFiniteNumber(x[i]) && isFiniteNumber(y[i])) {
      xs.push(x[i]);
      ys.push(y[i]);
    }
  }
  if (xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0,
    sx = 0,
    sy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    sx += (xs[i] - mx) ** 2;
    sy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(sx * sy);
  if (!isFiniteNumber(num) || !isFiniteNumber(den) || den === 0) return 0;
  return num / den;
};

const zScoreOutliers = (arr: number[], thresh = 2.5) => {
  if (!arr || arr.length < 2) return [];
  const m = mean(arr);
  const s = stdDev(arr);
  if (s === 0) return [];
  const idx: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const z = (arr[i] - m) / s;
    if (Math.abs(z) > thresh) idx.push(i);
  }
  return idx;
};

/* ===========================
   Data normalization hook
   =========================== */

/**
 * Normalizes data from the DataContext.
 * - Exclusively uses `dataset` to reflect the cleaned data state.
 * - Uses `updateCounter` to explicitly trigger re-memoization after cleaning.
 * - Returns memoized rows and inferred column lists.
 */
const useNormalizedData = () => {
  const { dataset, updateCounter } = useDataContext();

  const { rows, columns, numericColumns, categoricalColumns } = useMemo(() => {
    console.log("AIInsights: Normalizing data and columns due to update.");
    if (!dataset?.data || !dataset?.columns) {
      return { rows: [], columns: [], numericColumns: [], categoricalColumns: [] };
    }

    const rows = dataset.data;
    const allColumns = dataset.columns;

    const numericColumns = allColumns
      .filter((c) => ["Number", "Integer", "Float", "Currency", "Percentage"].includes(String(c.type)))
      .map((c) => c.name);

    const categoricalColumns = allColumns
      .filter((c) => !numericColumns.includes(c.name))
      .map((c) => c.name);

    return {
      rows,
      columns: allColumns.map((c) => c.name),
      numericColumns,
      categoricalColumns,
    };
  }, [dataset, updateCounter]);

  return { rows, columns, numericColumns, categoricalColumns };
};


/* ===========================
   Insight builder
   =========================== */

/**
 * Given normalized rows and column lists, produce a list of Insights.
 * The function below is intentionally verbose and explicit — it tries multiple checks and creates many insight types.
 */
const buildInsights = (rows: Row[], numericCols: string[], catCols: string[], allCols: string[]) => {
  const insights: Insight[] = [];
  const N = rows.length;

  // --- 1. Quick dataset-level insights
  if (N === 0) {
    insights.push({
      id: "no-data",
      type: "quality",
      title: "No data available for analysis",
      description: "Please upload or clean your data to generate insights. This panel will automatically update.",
      confidence: 0.9,
      importance: "high",
    });
    return insights;
  }

  insights.push({
    id: "dataset-overview",
    type: "other",
    title: `Dataset contains ${N} rows and ${allCols.length} columns`,
    description: `The current dataset has ${N} rows. Detected ${numericCols.length} numeric and ${catCols.length} categorical columns for analysis.`,
    confidence: 0.85,
    importance: "low",
  });

  // --- 2. Missingness & column quality
  const missing = allCols.map((c) => {
    const miss = rows.filter((r) => isMissing(r?.[c])).length;
    return {
      column: c,
      missing: miss,
      percent: N === 0 ? 0 : (miss / N) * 100,
    };
  });

  const highMissing = missing.filter((m) => m.percent >= 30);
  if (highMissing.length > 0) {
    insights.push({
      id: "missing-high",
      type: "quality",
      title: `${highMissing.length} column(s) with high missingness`,
      description: `Columns with >=30% missing values: ${highMissing
        .map((m) => `${m.column} (${m.percent.toFixed(0)}%)`)
        .join(", ")}. Consider imputation or inspecting data source.`,
      confidence: 0.92,
      importance: "high",
      meta: { highMissing },
    });
  } else {
    const someMissing = missing.filter((m) => m.percent > 0);
    if (someMissing.length > 0) {
      insights.push({
        id: "missing-some",
        type: "quality",
        title: `${someMissing.length} column(s) have some missing values`,
        description: `No columns exceed 30% missingness, but several columns contain some missing values. Choose an imputation or cleaning strategy based on column importance.`,
        confidence: 0.75,
        importance: "medium",
        meta: { someMissing },
      });
    }
  }

  // --- 3. Categorical cardinality suggestions
  const catCard = catCols.map((c) => {
    const vals = rows.map((r) => r?.[c]).filter((v) => !isMissing(v));
    const unique = new Set(vals.map((v) => (typeof v === "string" ? v : JSON.stringify(v)))).size;
    return { column: c, unique, total: vals.length };
  });
  const highCard = catCard.filter((c) => c.unique > Math.max(50, Math.sqrt(Math.max(1, N))));
  if (highCard.length > 0) {
    insights.push({
      id: "high-cardinality",
      type: "quality",
      title: `High cardinality categorical columns (${highCard.length})`,
      description: `Found categorical columns with high number of distinct values: ${highCard
        .map((c) => `${c.column} (${c.unique})`)
        .join(", ")}. Consider bucketing, hashing, or leaving as-is depending on downstream needs.`,
      confidence: 0.78,
      importance: "medium",
      meta: { highCard },
    });
  }

  // --- 4. Numeric columns summary, skewness & outliers
  numericCols.forEach((col) => {
    const arr = rows.map((r) => toNumber(r?.[col])).filter(Number.isFinite);
    if (arr.length === 0) {
      insights.push({
        id: `numeric-empty-${col}`,
        type: "quality",
        title: `Numeric column "${col}" has no valid numbers`,
        description: `Column "${col}" was detected as numeric but has no parseable numeric values. Check parsing rules or data typing.`,
        confidence: 0.85,
        importance: "high",
        meta: { column: col },
      });
      return;
    }
    const m = mean(arr);
    const md = median(arr);
    const sd = stdDev(arr);
    const { min, max } = minMax(arr);
    const skew = m > md ? "right-skewed" : m < md ? "left-skewed" : "symmetric";
    const outIdx = zScoreOutliers(arr, 2.5);

    if (outIdx.length > Math.max(1, Math.floor(arr.length * 0.01))) {
      insights.push({
        id: `outliers-${col}`,
        type: "anomaly",
        title: `Outliers detected in "${col}" (${outIdx.length})`,
        description: `Column "${col}" shows ${skew} distribution with mean=${m.toFixed(2)}, median=${md.toFixed(
          2
        )}, std=${sd.toFixed(2)}. Detected ${outIdx.length} potential outlier(s) using z-score.`,
        confidence: Math.min(0.95, 0.5 + Math.min(0.4, outIdx.length / Math.max(1, arr.length))),
        importance: outIdx.length > arr.length * 0.05 ? "high" : "medium",
        meta: { column: col, mean: m, median: md, std: sd, min, max, outlierIndices: outIdx.slice(0, 100) },
      });
    } else {
      insights.push({
        id: `summary-${col}`,
        type: "trend",
        title: `Summary for "${col}"`,
        description: `Range: ${min} → ${max}. Mean: ${m.toFixed(2)}, Median: ${md.toFixed(2)}, Std: ${sd.toFixed(
          2
        )}. Distribution appears ${skew}.`,
        confidence: 0.7,
        importance: "low",
        meta: { column: col, mean: m, median: md, std: sd, min, max },
      });
    }
  });

  // --- 5. Correlations: pairwise Pearson, report strong ones
  if (numericCols.length >= 2) {
    const pairs: { x: string; y: string; corr: number }[] = [];
    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const xArr = rows.map((r) => toNumber(r?.[numericCols[i]]));
        const yArr = rows.map((r) => toNumber(r?.[numericCols[j]]));
        const corr = pearson(xArr, yArr);
        pairs.push({ x: numericCols[i], y: numericCols[j], corr });
      }
    }
    const strong = pairs.filter((p) => Math.abs(p.corr) >= 0.6).sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
    if (strong.length > 0) {
      strong.slice(0, 6).forEach((s, idx) =>
        insights.push({
          id: `corr-${s.x}-${s.y}-${idx}`,
          type: "correlation",
          title: `Correlation detected: ${s.x} vs ${s.y}`,
          description: `Found ${s.corr >= 0 ? "positive" : "negative"} linear correlation (r=${s.corr.toFixed(
            3
          )}) between "${s.x}" and "${s.y}". Consider exploring causality or confounders.`,
          confidence: Math.min(0.95, Math.abs(s.corr)),
          importance: Math.abs(s.corr) > 0.8 ? "high" : "medium",
          meta: { pair: [s.x, s.y], corr: s.corr },
        })
      );
    } else {
      insights.push({
        id: "corr-none",
        type: "correlation",
        title: "No strong linear correlations found",
        description: "Pairwise Pearson correlation did not find absolute correlations >= 0.6. Consider nonlinear relationships or engineered features.",
        confidence: 0.6,
        importance: "low",
      });
    }
  }

  // --- 6. Trend detection: simple slope using index as x
  numericCols.forEach((col) => {
    const pts = rows.map((r, i) => ({ x: i, y: toNumber(r?.[col]) })).filter((p) => Number.isFinite(p.y));
    if (pts.length < 4) return;
    const n = pts.length;
    let sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0;
    for (let i = 0; i < n; i++) {
      sx += pts[i].x;
      sy += pts[i].y;
      sxx += pts[i].x * pts[i].x;
      sxy += pts[i].x * pts[i].y;
    }
    const denom = n * sxx - sx * sx || 1;
    const slope = (n * sxy - sx * sy) / denom;
    const first = pts[0].y;
    const last = pts[n - 1].y;
    const pct = Math.abs(first) > 1e-9 ? ((last - first) / Math.abs(first)) * 100 : 0;
    if (Math.abs(pct) >= 5) {
      insights.push({
        id: `trend-${col}`,
        type: "trend",
        title: `Trend detected for "${col}"`,
        description: `Values for "${col}" changed by ${pct.toFixed(1)}% from first to last sample. Estimated slope ≈ ${slope.toFixed(4)}.`,
        confidence: Math.min(0.9, Math.min(0.8 + Math.abs(pct) / 100, 0.98)),
        importance: Math.abs(pct) > 20 ? "high" : "medium",
        meta: { column: col, slope, pct, series: pts.slice(-200) },
      });
    }
  });

  // --- 7. Recommendations & transformations (generated heuristically)
  if (numericCols.length > 0 && catCols.length > 0) {
    insights.push({
      id: "recommend-features",
      type: "recommendation",
      title: "Feature engineering suggestions",
      description:
        "Consider creating interaction terms between numeric and categorical columns (e.g., numeric_mean_by_category), and normalizing skewed numeric columns using log or Box-Cox transforms.",
      confidence: 0.7,
      importance: "medium",
    });
  }

  // --- 8. Segmentation hint
  catCard.forEach((c) => {
    if (c.total > 0 && c.unique > 1 && c.unique < N / 2) {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const v = r?.[c.column];
        const key = isMissing(v) ? "__MISSING__" : String(v);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 1 && sorted[0][1] > sorted[1][1] * 2 && sorted[0][1] > N * 0.2) {
        insights.push({
          id: `segmentation-${c.column}`,
          type: "segmentation",
          title: `Segmentation opportunity on "${c.column}"`,
          description: `Most records (${sorted[0][1]}) belong to "${sorted[0][0]}". Consider separate modeling or KPI tracking for this dominant segment.`,
          confidence: 0.72,
          importance: "medium",
          meta: { column: c.column, top: sorted[0] },
        });
      }
    }
  });

  return insights;
};

/* ===========================
   UI: big component
   =========================== */

/* Small sparkline component using LineChart (recharts) */
const Sparkline: React.FC<{ data: { x: number; y: number }[]; color?: string }> = ({ data, color = "#00BFA6" }) => {
  if (!data || data.length === 0)
    return <div className="h-8 w-24 flex items-center justify-center text-xs text-gray-400">no data</div>;
  return (
    <ResponsiveContainer width={100} height={36}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="y" stroke={color} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
};

/* Drilldown Modal (simple) */
const DrilldownModal: React.FC<{
  open: boolean;
  onClose: () => void;
  insight?: Insight | null;
  rows?: Row[];
}> = ({ open, onClose, insight, rows }) => {
  if (!open || !insight) return null;
  const meta = insight.meta ?? {};
  const sampleRows = (meta?.sampleRows && Array.isArray(meta.sampleRows) && meta.sampleRows) || rows?.slice(0, 50) || [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 w-[90%] max-w-4xl bg-[#0B0E13] border border-gray-800 rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">{insight.title}</h3>
            <p className="text-sm text-gray-300 mt-2">{insight.description}</p>
            <div className="mt-3 text-xs text-gray-400">
              Confidence: <span className="text-white">{Math.round(insight.confidence * 100)}%</span> • Importance:{" "}
              <span className="text-white">{insight.importance}</span>
            </div>
          </div>

          <div className="flex-shrink-0">
            <button
              onClick={onClose}
              className="bg-[#13151A] px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-[#17181c]"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0F1418] p-3 rounded-lg border border-gray-800">
            <h4 className="text-sm text-gray-300 mb-2">Supporting sample rows</h4>
            <div className="max-h-56 overflow-auto text-xs text-gray-200">
              {sampleRows.length === 0 ? (
                <div className="text-gray-400">No sample rows available.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      {Object.keys(sampleRows[0]).slice(0, 6).map((k) => (
                        <th key={k} className="p-1">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-800">
                        {Object.keys(r).slice(0, 6).map((k) => (
                          <td key={k} className="p-1 text-gray-200">{String(r[k])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="bg-[#0F1418] p-3 rounded-lg border border-gray-800">
            <h4 className="text-sm text-gray-300 mb-2">Actionable suggestions</h4>
            <div className="text-xs text-gray-200 space-y-2">
              {insight.type === "anomaly" && (
                <>
                  <div>- Inspect rows with extreme values for data entry errors.</div>
                  <div>- Consider capping, trimming, or flagging outliers for downstream models.</div>
                </>
              )}
              {insight.type === "trend" && (
                <>
                  <div>- If trend is business-relevant, build a time-aware model or forecast.</div>
                  <div>- Test seasonality and smoothing (rolling averages).</div>
                </>
              )}
              {insight.type === "correlation" && (
                <>
                  <div>- Check for causality or confounding variables.</div>
                  <div>- Use scatterplot visualizations and regression diagnostics.</div>
                </>
              )}
               {insight.type === "quality" && (
                <>
                  <div>- Navigate to the Data Cleaning tab to address this issue.</div>
                  <div>- Impute missing values or remove columns with low utility.</div>
                </>
              )}
              {insight.type === "recommendation" && (
                <div>- Apply the recommended transformations and re-evaluate model performance.</div>
              )}
              <div className="mt-3 flex gap-2">
                <button className="px-3 py-1 bg-[#1F2937] rounded-lg text-sm text-white">Save Insight</button>
                <button className="px-3 py-1 bg-[#0B1220] border border-gray-700 rounded-lg text-sm text-gray-200">Export CSV</button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

/* ===========================
   The main AIInsights component
   =========================== */

const AIInsights: React.FC = () => {
  const { updateCounter } = useDataContext();

  // Debug: Log when component renders based on its direct dependency
  useEffect(() => {
    console.log("AIInsights: Component re-rendered because updateCounter changed to:", updateCounter);
  }, [updateCounter]);

  const { rows, columns, numericColumns, categoricalColumns } = useNormalizedData();

  // local UI state
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<InsightType | "all">("all");
  const [importanceFilter, setImportanceFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [sortBy, setSortBy] = useState<"confidence" | "importance" | "type">("confidence");
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Derive insights directly from data using useMemo for automatic refresh.
  const insights = useMemo(() => {
    console.log("AIInsights: Re-generating AI insights because underlying data changed.");
    // This function is computationally expensive, so memoizing it is crucial.
    return buildInsights(rows, numericColumns, categoricalColumns, columns);
  }, [rows, numericColumns, categoricalColumns, columns]);

  // Filtering / searching / sorting
  const filteredInsights = useMemo(() => {
    let items = insights.slice();
    if (filterType !== "all") items = items.filter((i) => i.type === filterType);
    if (importanceFilter !== "all") items = items.filter((i) => i.importance === importanceFilter);
    if (query.trim() !== "") {
      const q = query.toLowerCase();
      items = items.filter((i) => (i.title + " " + i.description).toLowerCase().includes(q));
    }
    // sort
    if (sortBy === "confidence") items.sort((a, b) => b.confidence - a.confidence);
    else if (sortBy === "importance")
      items.sort((a, b) => {
        const score = (imp: string) => (imp === "high" ? 3 : imp === "medium" ? 2 : 1);
        return score(b.importance) - score(a.importance);
      });
    else if (sortBy === "type") items.sort((a, b) => a.type.localeCompare(b.type));
    return items;
  }, [insights, filterType, importanceFilter, query, sortBy]);

  // counts for the header
  const counts = useMemo(() => {
    return {
      total: insights.length,
      high: insights.filter((i) => i.importance === "high").length,
      medium: insights.filter((i) => i.importance === "medium").length,
      low: insights.filter((i) => i.importance === "low").length,
      avgConfidence:
        insights.length === 0 ? 0 : insights.reduce((s, i) => s + (i.confidence || 0), 0) / insights.length,
    };
  }, [insights]);

  const openDrill = (ins: Insight) => {
    setSelectedInsight(ins);
    setModalOpen(true);
  };

  const closeDrill = () => {
    setModalOpen(false);
    setSelectedInsight(null);
  };

  /* UI helpers */
  const getIcon = (type: InsightType) => {
    // ... (rest of getIcon, importanceClass, confidenceColor, InsightCard are unchanged)
    switch (type) {
      case "anomaly": return AlertTriangle;
      case "trend": return TrendingUp;
      case "correlation": return Target;
      case "recommendation": return Lightbulb;
      case "quality": return Zap;
      case "categorical": return Columns;
      case "segmentation": return FileText;
      default: return Brain;
    }
  };

  const importanceClass = (imp: Insight["importance"]) => {
    switch (imp) {
      case "high": return "border-red-500 bg-red-500/10 text-red-400";
      case "medium": return "border-yellow-500 bg-yellow-500/10 text-yellow-400";
      case "low": default: return "border-blue-500 bg-blue-500/10 text-blue-400";
    }
  };

  const confidenceColor = (c: number) => {
    if (c >= 0.8) return "text-green-400";
    if (c >= 0.6) return "text-yellow-400";
    return "text-red-400";
  };

  /* Small Insight Card */
  const InsightCard: React.FC<{ insight: Insight; index: number }> = ({ insight, index }) => {
    const Icon = getIcon(insight.type as InsightType);
    const impClass = importanceClass(insight.importance);

    return (
      <motion.div
        key={insight.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: index * 0.03 }}
        className={`bg-gray-800/30 backdrop-blur-sm rounded-lg p-5 border ${impClass} hover:scale-[1.02] transition-transform duration-200 cursor-pointer group`}
        onClick={() => openDrill(insight)}
      >
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-lg ${impClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
                  {insight.title}
                </h4>
                <p className="text-xs text-gray-300 mt-2 line-clamp-3">{insight.description}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="flex items-center gap-2">
                  <Star className={`h-4 w-4 ${confidenceColor(insight.confidence)}`} />
                  <div className={`text-xs font-medium ${confidenceColor(insight.confidence)}`}>
                    {Math.round((insight.confidence || 0) * 100)}%
                  </div>
                </div>
                <div className="mt-2 text-xs">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${impClass}`}>{insight.importance}</span>
                </div>
              </div>
            </div>
            {insight.meta?.series && Array.isArray(insight.meta.series) && insight.meta.series.length > 0 && (
              <div className="mt-3">
                <Sparkline data={insight.meta.series.slice(-30)} color={PALETTE[index % PALETTE.length]} />
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-gray-400">Type: {insight.type}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); openDrill(insight); }}
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs"
                >
                  Explore <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  /* ===========================
     Render
     =========================== */

  return (
    <div className="p-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-5 border border-gray-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Brain className="h-7 w-7 text-purple-400" />
              <div>
                <h2 className="text-xl font-bold text-white">AI Insights</h2>
                <p className="text-xs text-gray-400">Data-driven observations based on your cleaned dataset.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-400">Avg Confidence</div>
              <div className="text-sm font-bold text-white">{Math.round((counts.avgConfidence || 0) * 100)}%</div>
              <button
                onClick={() => {
                  const payload = JSON.stringify({ insights, generatedAt: new Date().toISOString() }, null, 2);
                  const blob = new Blob([payload], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `insights-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="ml-2 px-3 py-1 rounded-lg bg-[#0B1220] border border-gray-700 text-xs flex items-center gap-2"
                title="Export insights"
              >
                <Download className="h-4 w-4 text-gray-300" /> Export
              </button>
            </div>
          </div>

          {/* filters row */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search insights..."
                className="w-full bg-[#0B0E13] border border-gray-800 rounded-lg py-2 px-3 text-sm text-gray-200 focus:outline-none"
              />
              <Search className="absolute right-3 top-2.5 text-gray-400" />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="bg-[#0B0E13] border border-gray-800 rounded-lg py-2 px-3 text-sm text-gray-200 focus:outline-none"
              >
                <option value="all">All types</option>
                <option value="anomaly">Anomalies</option>
                <option value="trend">Trends</option>
                <option value="correlation">Correlations</option>
                <option value="recommendation">Recommendations</option>
                <option value="quality">Quality</option>
                <option value="categorical">Categorical</option>
                <option value="segmentation">Segmentation</option>
              </select>
              <select
                value={importanceFilter}
                onChange={(e) => setImportanceFilter(e.target.value as any)}
                className="bg-[#0B0E13] border border-gray-800 rounded-lg py-2 px-3 text-sm text-gray-200 focus:outline-none"
              >
                <option value="all">All priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-[#0B0E13] border border-gray-800 rounded-lg py-2 px-3 text-sm text-gray-200 focus:outline-none"
              >
                <option value="confidence">Sort: Confidence</option>
                <option value="importance">Sort: Importance</option>
                <option value="type">Sort: Type</option>
              </select>
            </div>
          </div>
        </div>
      </motion.div>

        {/* Insights grid */}
        <div className="mt-6 grid grid-cols-1 gap-4">
            {filteredInsights.length === 0 ? (
                <div className="bg-[#0F1418] border border-gray-800 rounded-xl p-6 text-gray-400">
                    No insights match your filters/search.
                </div>
            ) : (
                filteredInsights.map((ins, idx) => (
                    <InsightCard key={`${ins.id}-${updateCounter}`} insight={ins} index={idx} />
                ))
            )}
        </div>
      <DrilldownModal open={modalOpen} onClose={closeDrill} insight={selectedInsight} rows={rows} />
    </div>
  );
};

export default AIInsights;
