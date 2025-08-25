import React, { useState, useEffect } from "react";
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

  // Debug: Log when component renders
  console.log("Visualizations component rendered:", {
    hasDataset: !!dataset,
    dataLength: dataset?.data?.length,
    updateCounter,
  });

  // Force re-render when update counter changes
  useEffect(() => {
    console.log("Visualizations: Update counter changed to:", updateCounter);
  }, [updateCounter]);

  // Force re-render when dataset data changes
  useEffect(() => {
    console.log(
      "Visualizations: Dataset data length changed to:",
      dataset?.data?.length
    );
  }, [dataset?.data?.length]);

  const [selectedXAxis, setSelectedXAxis] = useState("");
  const [selectedYAxis, setSelectedYAxis] = useState("");
  const [chartData, setChartData] = useState<any[]>([]);

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

  if (!dataset || !dataset.columns || !dataset.data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">No data available for visualization</p>
      </div>
    );
  }

  const allColumns = dataset.columns;

  // --- START: AXIS SELECTION LOGIC ---

  // 1. Set initial, non-conflicting axes when data loads
  useEffect(() => {
    if (allColumns.length > 0 && !selectedXAxis && !selectedYAxis) {
      setSelectedXAxis(allColumns[0].name);
      // Set Y-axis to the second column if available, otherwise the first
      if (allColumns.length > 1) {
        setSelectedYAxis(allColumns[1].name);
      } else {
        setSelectedYAxis(allColumns[0].name);
      }
    }
  }, [allColumns, selectedXAxis, selectedYAxis]);

  // 2. Handle X-axis changes that might conflict with Y-axis
  useEffect(() => {
    if (selectedXAxis && selectedXAxis === selectedYAxis) {
      const newYOption = allColumns.find((c) => c.name !== selectedXAxis);
      if (newYOption) {
        setSelectedYAxis(newYOption.name);
      }
    }
  }, [selectedXAxis, selectedYAxis, allColumns]);

  // 3. Handle Y-axis changes that might conflict with X-axis
  useEffect(() => {
    if (selectedYAxis && selectedYAxis === selectedXAxis) {
      const newXOption = allColumns.find((c) => c.name !== selectedYAxis);
      if (newXOption) {
        setSelectedXAxis(newXOption.name);
      }
    }
  }, [selectedYAxis, selectedXAxis, allColumns]);
  
  // --- END: AXIS SELECTION LOGIC ---

  useEffect(() => {
    if (!selectedXAxis || !selectedYAxis) return;

    // Prepare chart data
    const xCol = selectedXAxis;
    const yCol = selectedYAxis;

    const data = dataset.data.map((row, index) => {
      const xValue = row[xCol]?.toString() || `Row ${index + 1}`;
      const yValue = Number(row[yCol]) || 0;
      return {
        name: xValue,
        value: yValue,
        x: xValue,
        y: yValue,
      };
    });
    setChartData(data);
  }, [selectedXAxis, selectedYAxis, dataset.data]);

  const renderAllCharts = () => {
    if (chartData.length === 0) return <p className="text-gray-400">No data to visualize</p>;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Bar Chart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip />
              <Bar dataKey="value">
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line Chart */}
        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Line Chart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Area Chart */}
        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Area Chart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip />
              <Area type="monotone" dataKey="value" stroke="#8B5CF6" fill="#8B5CF6" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
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
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {chartData.slice(0, 8).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Scatter Plot */}
        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Scatter Plot</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="x" stroke="#9CA3AF" />
              <YAxis dataKey="y" stroke="#9CA3AF" />
              <Tooltip />
              <Scatter data={chartData}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Combo Chart */}
        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Combo Chart</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#3B82F6" />
              <Line type="monotone" dataKey="value" stroke="#EF4444" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Stacked Bar Chart (Corrected for current data structure) */}
        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Bar Chart (Stackable)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} />
              <YAxis stroke="#9CA3AF" />
              <Tooltip />
              <Legend />
              {/* This renders a standard bar chart. True stacking needs a different data structure. */}
              <Bar dataKey="value" stackId="a" fill={COLORS[0]} name={selectedYAxis} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Histogram */}
        <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-2">Histogram</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="x" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip />
              <Bar dataKey="value" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };
  
  // Dynamically filter options for each dropdown to exclude the other's selection
  const xAxisOptions = allColumns.filter(col => col.name !== selectedYAxis);
  const yAxisOptions = allColumns.filter(col => col.name !== selectedXAxis);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Interactive Dashboard</h2>
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
            <label className="block text-sm font-medium text-gray-300 mb-2">X-Axis</label>
            <select value={selectedXAxis} onChange={(e) => setSelectedXAxis(e.target.value)} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
              {xAxisOptions.map((col) => <option key={col.name} value={col.name}>{col.name} ({col.type})</option>)}
            </select>
          </div>
          {/* Y Axis */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Y-Axis</label>
            <select value={selectedYAxis} onChange={(e) => setSelectedYAxis(e.target.value)} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
              {yAxisOptions.map((col) => <option key={col.name} value={col.name}>{col.name} ({col.type})</option>)}
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
