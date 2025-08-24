import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  TrendingUp,
  Filter,
  Download,
} from "lucide-react";
import { useDataContext } from "../context/DataContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  ComposedChart,
  Legend,
} from "recharts";

const Visualizations: React.FC = () => {
  const { dataset, updateCounter } = useDataContext();

  // Debug: Log when component renders to confirm it's reacting to context changes
  console.log("Visualizations component rendered:", {
    hasDataset: !!dataset,
    dataLength: dataset?.data?.length,
    updateCounter,
  });

  const [selectedXAxis, setSelectedXAxis] = useState("");
  const [selectedYAxis, setSelectedYAxis] = useState("");

  const COLORS = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#06B6D4",
    "#F97316",
    "#EC4899",
  ];

  // Memoize column derivations to ensure they only re-calculate when the dataset changes.
  // This is now more robust and understands the types from DataCleaning.tsx.
  const { allColumns, numericColumns, categoricalColumns } = useMemo(() => {
    if (!dataset?.columns) {
      return { allColumns: [], numericColumns: [], categoricalColumns: [] };
    }
    const all = dataset.columns;
    const numeric = all.filter((col) =>
      ["Number", "Integer", "Float", "Currency", "Percentage"].includes(String(col.type))
    );
    const categorical = all.filter((col) =>
      ["Text", "Categorical", "Boolean", "Date", "Datetime"].includes(String(col.type))
    );
    return { allColumns: all, numericColumns: numeric, categoricalColumns: categorical };
  }, [dataset, updateCounter]);

  // Effect to safely set default axis selections or reset them if they become invalid after cleaning.
  useEffect(() => {
    if (allColumns.length > 0 && (!selectedXAxis || !allColumns.some(c => c.name === selectedXAxis))) {
      setSelectedXAxis(allColumns[0].name);
    }
    if (numericColumns.length > 0 && (!selectedYAxis || !numericColumns.some(c => c.name === selectedYAxis))) {
      setSelectedYAxis(numericColumns[0].name);
    }
  }, [allColumns, numericColumns, selectedXAxis, selectedYAxis]);

  // Derive chart data directly using useMemo instead of useEffect and useState.
  // This is more idiomatic and ensures data is always in sync with the dataset.
  const { chartData, categories } = useMemo(() => {
    if (!dataset?.data || !selectedXAxis || !selectedYAxis) {
      return { chartData: [], categories: [] };
    }

    const tempCategories = new Set<string>();
    const data = dataset.data.map((row, index) => {
      const xValue = row[selectedXAxis]?.toString() || `Row ${index + 1}`;
      const yValue = Number(row[selectedYAxis]) || 0;
      tempCategories.add(xValue);
      return {
        name: xValue,
        value: yValue,
        x: xValue, // For Scatter plot
        y: yValue,  // For Scatter plot
      };
    });

    return { chartData: data, categories: Array.from(tempCategories) };
  }, [selectedXAxis, selectedYAxis, dataset, updateCounter]);


  // Safe check for empty dataset after hooks
  if (!dataset || !dataset.columns || !dataset.data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">No data available for visualization</p>
      </div>
    );
  }

  const renderAllCharts = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 col-span-1 lg:col-span-2">
            <p className="text-gray-400">Select X and Y axes to generate charts.</p>
        </div>
      )
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div key={`bar-${updateCounter}`} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Bar Chart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} interval={0} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip cursor={{fill: '#374151'}} contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
              <Bar dataKey="value">
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line Chart */}
        <div key={`line-${updateCounter}`} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Line Chart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} interval={0} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip cursor={{fill: '#374151'}} contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
              <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Area Chart */}
        <div key={`area-${updateCounter}`} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Area Chart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} interval={0} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip cursor={{fill: '#374151'}} contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
              <Area type="monotone" dataKey="value" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div key={`pie-${updateCounter}`} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Pie Chart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData.slice(0, 8)}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                labelLine={false}
                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
              >
                {chartData.slice(0, 8).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Scatter Plot */}
        <div key={`scatter-${updateCounter}`} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Scatter Plot</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="category" dataKey="x" name={selectedXAxis} stroke="#9CA3AF" />
              <YAxis type="number" dataKey="y" name={selectedYAxis} stroke="#9CA3AF" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
              <Scatter data={chartData} fill="#EF4444" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Combo Chart */}
        <div key={`combo-${updateCounter}`} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Combo Chart (Bar + Line)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} interval={0} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
              <Legend />
              <Bar dataKey="value" name={selectedYAxis} barSize={20} fill="#3B82F6" />
              <Line type="monotone" dataKey="value" name={selectedYAxis} stroke="#EF4444" strokeWidth={2} dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Interactive Visualizations</h2>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2">
            <Download className="h-4 w-4" /> <span>Export</span>
          </button>
        </div>
      </motion.div>

      {/* Chart Config */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <Filter className="h-5 w-5 mr-2 text-blue-400" /> Chart Configuration
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* X Axis */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">X-Axis (Category)</label>
            <select value={selectedXAxis} onChange={(e) => setSelectedXAxis(e.target.value)} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
              {allColumns.map((col) => <option key={col.name} value={col.name}>{col.name} ({col.type})</option>)}
            </select>
          </div>
          {/* Y Axis */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Y-Axis (Value)</label>
            <select value={selectedYAxis} onChange={(e) => setSelectedYAxis(e.target.value)} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
              {numericColumns.map((col) => <option key={col.name} value={col.name}>{col.name} ({col.type})</option>)}
            </select>
          </div>
        </div>
      </motion.div>

      {/* All Charts */}
      {renderAllCharts()}
    </div>
  );
};

export default Visualizations;
