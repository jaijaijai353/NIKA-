import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, BarChart3, LineChart, PieChart, TrendingUp, Download, LayoutGrid } from "lucide-react";
import { toPng } from "html-to-image";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  Area,
  Pie,
  Cell,
  Scatter,
  Legend,
  ComposedChart as RechartsComposedChart,
  BarChart as RechartsBarChart,
  LineChart as RechartsLineChart,
  AreaChart as RechartsAreaChart,
  PieChart as RechartsPieChart,
  ScatterChart as RechartsScatterChart,
} from "recharts";

import { useDataContext } from "../../context/DataContext"; // <-- ADJUST THIS IMPORT PATH IF NEEDED

//================================================================
// 1. TYPES (from types.ts)
//================================================================
export interface Column {
  name: string;
  type: "Numeric" | "Text" | "Categorical" | "Date";
}

export interface Dataset {
  columns: Column[];
  data: Record<string, string | number | null>[];
}

export interface ChartDataPoint {
  name: string; // Used for X-axis labels
  value: number; // Primary value for Y-axis
  [key: string]: any; // Allows for additional properties needed by specific charts
}

//================================================================
// 2. HELPER COMPONENTS & HOOKS
//================================================================

/**
 * Custom hook to process and memoize chart data.
 * @param dataset The raw dataset.
 * @param selectedXAxis The column name for the X-axis.
 * @param selectedYAxis The column name for the Y-axis.
 * @returns Processed data ready for charting.
 */
const useChartData = (
  dataset: Dataset | null,
  selectedXAxis: string,
  selectedYAxis: string
): ChartDataPoint[] => {
  return useMemo(() => {
    if (!dataset || !dataset.data || !selectedXAxis || !selectedYAxis) {
      return [];
    }
    try {
      return dataset.data.map((row) => ({
        name: row[selectedXAxis]?.toString() ?? "N/A",
        value: Number(row[selectedYAxis]) || 0,
      }));
    } catch (error) {
      console.error("Error processing chart data:", error);
      return [];
    }
  }, [dataset, selectedXAxis, selectedYAxis]);
};

/**
 * Reusable skeleton component for loading state.
 */
const ChartSkeleton: React.FC = () => (
  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 animate-pulse">
    <div className="h-6 bg-slate-700 rounded-md w-1/3 mb-4"></div>
    <div className="h-64 bg-slate-700 rounded-md"></div>
  </div>
);

/**
 * Wrapper component for each chart, providing a consistent look and functionality.
 */
const ChartContainer: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const chartRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!chartRef.current) return;
    try {
      const dataUrl = await toPng(chartRef.current, { cacheBust: true, backgroundColor: '#1e293b' });
      const link = document.createElement("a");
      link.download = `${title.toLowerCase().replace(/ /g, "_")}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to download chart image:", err);
    }
  };
  
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 100 } },
  };

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="bg-gradient-to-br from-slate-800/60 to-slate-900/70 backdrop-blur-sm rounded-xl p-4 md:p-6 border border-slate-700/80 shadow-lg"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-100">{title}</h3>
        <button
          onClick={handleDownload}
          className="p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors duration-200"
          aria-label={`Download ${title}`}
          title={`Download ${title}`}
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
      <div ref={chartRef} className="bg-transparent pt-2 pb-4 px-2">
        <div style={{ width: '100%', height: '350px' }}>
          {children}
        </div>
      </div>
    </motion.div>
  );
};


//================================================================
// 3. MAIN VISUALIZATIONS COMPONENT
//================================================================

const Visualizations: React.FC = () => {
  const { dataset } = useDataContext();
  const [isLoading, setIsLoading] = useState(true);

  // State for axis and chart configuration
  const [selectedXAxis, setSelectedXAxis] = useState<string>("");
  const [selectedYAxis, setSelectedYAxis] = useState<string>("");
  const [stackBy, setStackBy] = useState<string>("");

  const COLORS = ["#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#2dd4bf", "#fb923c", "#f472b6"];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  // Memoize column derivations to prevent unnecessary recalculations
  const { allColumns, numericColumns, categoricalColumns } = useMemo(() => {
    const columns = dataset?.columns ?? [];
    return {
      allColumns: columns,
      numericColumns: columns.filter((col) => col.type === "Numeric"),
      categoricalColumns: columns.filter((col) => col.type === "Text" || col.type === "Categorical"),
    };
  }, [dataset]);

  // Effect to set default axes once data is available
  useEffect(() => {
    if (dataset) {
      if (allColumns.length > 0 && !selectedXAxis) {
        const defaultX = categoricalColumns.length > 0 ? categoricalColumns[0].name : allColumns[0].name;
        setSelectedXAxis(defaultX);
      }
      if (numericColumns.length > 0 && !selectedYAxis) {
        setSelectedYAxis(numericColumns[0].name);
      }
      setTimeout(() => setIsLoading(false), 500);
    }
  }, [allColumns, numericColumns, categoricalColumns, selectedXAxis, selectedYAxis, dataset]);

  const chartData = useChartData(dataset, selectedXAxis, selectedYAxis);

  // Data for the Histogram (binned data)
  const histogramData = useMemo(() => {
    if (!selectedYAxis || chartData.length === 0) return [];
    const values = chartData.map(d => d.value).filter(v => !isNaN(v));
    if (values.length === 0) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(10, Math.floor(Math.sqrt(values.length)));
    if (binCount <= 0 || min === max) return [{ name: `${min}-${max}`, count: values.length }];

    const binWidth = (max - min) / binCount;
    const bins = Array.from({ length: binCount }, (_, i) => ({
        name: `${(min + i * binWidth).toFixed(1)}-${(min + (i + 1) * binWidth).toFixed(1)}`,
        count: 0,
    }));

    values.forEach(value => {
        let binIndex = Math.floor((value - min) / binWidth);
        if (binIndex === binCount) binIndex--; // Edge case for the max value
        if (bins[binIndex]) bins[binIndex].count++;
    });
    return bins;
  }, [chartData, selectedYAxis]);

  // Data for the Stacked Bar Chart
  const stackedBarData = useMemo(() => {
    if (!stackBy || !dataset || !selectedXAxis || !selectedYAxis) return { data: [], categories: [] };
    
    const groupedData: { [key: string]: { name: string; [key: string]: any } } = {};
    const stackCategories = new Set<string>();

    dataset.data.forEach(row => {
        const groupKey = row[selectedXAxis]?.toString();
        const stackKey = row[stackBy]?.toString();
        const value = Number(row[selectedYAxis]);

        if (groupKey && stackKey && !isNaN(value)) {
            if (!groupedData[groupKey]) groupedData[groupKey] = { name: groupKey };
            groupedData[groupKey][stackKey] = (groupedData[groupKey][stackKey] || 0) + value;
            stackCategories.add(stackKey);
        }
    });

    return { data: Object.values(groupedData), categories: Array.from(stackCategories) };
  }, [dataset, selectedXAxis, selectedYAxis, stackBy]);

  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800/80 backdrop-blur-sm p-3 border border-slate-600 rounded-lg shadow-xl">
          <p className="label text-slate-200 font-bold">{`${label}`}</p>
          {payload.map((pld: any, index: number) => (
            <p key={index} style={{ color: pld.color }} className="intro">{`${pld.name} : ${pld.value.toLocaleString()}`}</p>
          ))}
        </div>
      );
    }
    return null;
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, i) => <ChartSkeleton key={i} />)}
        </div>
      );
    }

    if (!dataset || dataset.data.length === 0 || chartData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-96 bg-slate-800/50 rounded-xl border border-slate-700">
          <LayoutGrid className="h-16 w-16 text-slate-600 mb-4" />
          <h3 className="text-xl font-semibold text-slate-300">No Data to Visualize</h3>
          <p className="text-slate-500 mt-1">Please upload a dataset or check your configuration.</p>
        </div>
      );
    }

    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <ChartContainer title="Bar Chart">
          <ResponsiveContainer>
            <RechartsBarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={80} interval={0} />
              <YAxis stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }}/>
              <Bar dataKey="value">
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Line Chart">
          <ResponsiveContainer>
            <RechartsLineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={80} interval={0} />
              <YAxis stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="value" stroke={COLORS[1]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }}/>
            </RechartsLineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Area Chart">
           <ResponsiveContainer>
            <RechartsAreaChart data={chartData}>
                <defs>
                    <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[4]} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={COLORS[4]} stopOpacity={0}/>
                    </linearGradient>
                </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={80} interval={0} />
              <YAxis stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" stroke={COLORS[4]} fill="url(#colorArea)" />
            </RechartsAreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Pie Chart">
            <ResponsiveContainer>
                <RechartsPieChart>
                    <Pie data={chartData.slice(0, 8)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} labelLine={false} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                        {chartData.slice(0, 8).map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                </RechartsPieChart>
            </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Histogram">
            <ResponsiveContainer>
                <RechartsBarChart data={histogramData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={80} interval={0} />
                    <YAxis stroke="#9ca3af" label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}/>
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Frequency" fill={COLORS[1]} />
                </RechartsBarChart>
            </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Stacked Bar Chart">
            {stackBy && stackedBarData.data.length > 0 ? (
                <ResponsiveContainer>
                    <RechartsBarChart data={stackedBarData.data} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis type="number" stroke="#9ca3af" />
                        <YAxis type="category" dataKey="name" stroke="#9ca3af" width={100} interval={0} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        {stackedBarData.categories.map((cat, index) => (
                            <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[index % COLORS.length]} />
                        ))}
                    </RechartsBarChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-center p-4">
                    Select a 'Stack By' category in the configuration panel to view this chart.
                </div>
            )}
        </ChartContainer>

      </motion.div>
    );
  };
  
  return (
    <div className="space-y-6 p-4 md:p-6 min-h-screen bg-slate-900 text-white">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h2 className="text-3xl font-bold text-slate-100">Interactive Dashboard</h2>
        </motion.div>
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <Filter className="h-5 w-5 mr-2 text-sky-400" /> Chart Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="xAxisSelect" className="block text-sm font-medium text-slate-300 mb-2">X-Axis (Group By)</label>
            <select id="xAxisSelect" value={selectedXAxis} onChange={(e) => setSelectedXAxis(e.target.value)} className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg p-2.5 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                {allColumns.map((col) => <option key={col.name} value={col.name}>{col.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="yAxisSelect" className="block text-sm font-medium text-slate-300 mb-2">Y-Axis (Value)</label>
            <select id="yAxisSelect" value={selectedYAxis} onChange={(e) => setSelectedYAxis(e.target.value)} className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg p-2.5 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
              {numericColumns.length > 0 ? (
                numericColumns.map((col) => <option key={col.name} value={col.name}>{col.name}</option>)
              ) : (
                <option disabled>No numeric columns found</option>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="stackBySelect" className="block text-sm font-medium text-slate-300 mb-2">Stack By (For Stacked Chart)</label>
            <select id="stackBySelect" value={stackBy} onChange={(e) => setStackBy(e.target.value)} className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg p-2.5 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition">
                <option value="">None</option>
                {categoricalColumns.map((col) => <option key={col.name} value={col.name}>{col.name}</option>)}
            </select>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {renderContent()}
      </AnimatePresence>
    </div>
  );
};

export default Visualizations;
