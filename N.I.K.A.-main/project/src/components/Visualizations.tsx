import React, { useState, useEffect, useReducer, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Download,
} from "lucide-react";
import { useDataContext } from "../context/DataContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, AreaChart, Area, ComposedChart, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Treemap,
} from "recharts";

// ============================================================================================
// 1. TYPE DEFINITIONS
// ============================================================================================

type DataRow = Record<string, any>;
type AggregationMethod = 'none' | 'sum' | 'average' | 'count' | 'min' | 'max';
type SortKey = 'x' | 'y';
type SortDirection = 'asc' | 'desc';
type ColorPalette = 'vibrant' | 'cool' | 'forest' | 'sunset';

interface ChartState {
  xAxis: string;
  yAxis: string;
  aggregation: AggregationMethod;
  sortKey: SortKey;
  sortDirection: SortDirection;
  colorPalette: ColorPalette;
  filters: Record<string, { type: 'numeric' | 'categorical'; value: any }>;
}

type ChartAction =
  | { type: 'SET_X_AXIS'; payload: string }
  | { type: 'SET_Y_AXIS'; payload: string }
  | { type: 'SET_AGGREGATION'; payload: AggregationMethod }
  | { type: 'SET_SORT'; payload: { key: SortKey; direction: SortDirection } }
  | { type: 'SET_PALETTE'; payload: ColorPalette }
  | { type: 'SET_FILTER'; payload: { column: string; value: any } }
  | { type: 'INIT_AXES'; payload: { xAxis: string; yAxis: string } };

// ============================================================================================
// 2. UTILITY HOOKS & HELPERS
// ============================================================================================

/** Color palettes for the charts */
const COLOR_PALETTES: Record<ColorPalette, string[]> = {
  vibrant: ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#F97316", "#EC4899"],
  cool: ["#06B6D4", "#3B82F6", "#6366F1", "#A78BFA", "#C084FC", "#34D399", "#A3E635", "#22D3EE"],
  forest: ["#10B981", "#22C55E", "#84CC16", "#F59E0B", "#D97706", "#65A30D", "#15803D", "#FACC15"],
  sunset: ["#F97316", "#EF4444", "#EC4899", "#D946EF", "#F59E0B", "#E11D48", "#9333EA", "#F43F5E"],
};

/** Reducer for managing complex chart state */
const chartStateReducer = (state: ChartState, action: ChartAction): ChartState => {
  switch (action.type) {
    case 'SET_X_AXIS':
      if (action.payload === state.yAxis) {
        return { ...state, xAxis: action.payload, yAxis: state.xAxis };
      }
      return { ...state, xAxis: action.payload };
    case 'SET_Y_AXIS':
      if (action.payload === state.xAxis) {
        return { ...state, yAxis: action.payload, xAxis: state.yAxis };
      }
      return { ...state, yAxis: action.payload };
    case 'SET_AGGREGATION':
      return { ...state, aggregation: action.payload };
    case 'SET_SORT':
      return { ...state, sortKey: action.payload.key, sortDirection: action.payload.direction };
    case 'SET_PALETTE':
      return { ...state, colorPalette: action.payload };
    case 'SET_FILTER':
      return { ...state, filters: { ...state.filters, [action.payload.column]: { ...state.filters[action.payload.column], value: action.payload.value } } };
    case 'INIT_AXES':
      return { ...state, xAxis: action.payload.xAxis, yAxis: action.payload.yAxis };
    default:
      return state;
  }
};

// ============================================================================================
// 3. CUSTOM RECHARTS COMPONENTS
// ============================================================================================

/** A styled, custom tooltip for charts */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-3 text-sm shadow-lg">
        <p className="font-bold text-white">{label}</p>
        {payload.map((pld: any, index: number) => (
          <p key={index} style={{ color: pld.color || '#FFFFFF' }}>
            {`${pld.name}: ${pld.value.toLocaleString()}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

/** A custom renderer for the Treemap to add labels and colors */
const CustomizedTreemapContent = ({ root, depth, x, y, width, height, index, colors, name }: any) => {
  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        style={{
          fill: depth === 1 ? colors[index % colors.length] : 'none',
          stroke: '#111827', strokeWidth: 2, strokeOpacity: 0.5,
        }}
      />
      {depth === 1 && width > 60 && height > 30 ? (
        <text x={x + width / 2} y={y + height / 2 + 7} textAnchor="middle" fill="#fff" fontSize={14} fontWeight="bold">
          {name}
        </text>
      ) : null}
    </g>
  );
};


// ============================================================================================
// 4. MAIN VISUALIZATION COMPONENT
// ============================================================================================

const Visualizations: React.FC = () => {
  const { dataset } = useDataContext();

  const initialState: ChartState = {
    xAxis: '',
    yAxis: '',
    aggregation: 'none',
    sortKey: 'x',
    sortDirection: 'asc',
    colorPalette: 'vibrant',
    filters: {},
  };

  const [state, dispatch] = useReducer(chartStateReducer, initialState);
  const { xAxis, yAxis, aggregation, sortKey, sortDirection, colorPalette, filters } = state;
  
  const [chartData, setChartData] = useState<any[]>([]);

  const { allColumns, numericColumns, categoricalColumns } = useMemo(() => {
    if (!dataset?.columns) return { allColumns: [], numericColumns: [], categoricalColumns: [] };
    
    const numeric: string[] = [];
    const categorical: string[] = [];

    dataset.columns.forEach(col => {
      const isNumeric = dataset.data?.slice(0, 10).some(row => typeof row[col.name] === 'number');
      if (isNumeric) {
        numeric.push(col.name);
      } else {
        categorical.push(col.name);
      }
    });

    return { allColumns: dataset.columns.map(c => c.name), numericColumns: numeric, categoricalColumns: categorical };
  }, [dataset]);

  useEffect(() => {
    if (allColumns.length > 0 && !xAxis && !yAxis) {
      const initialX = categoricalColumns.length > 0 ? categoricalColumns[0] : allColumns[0];
      const initialY = numericColumns.length > 0 ? numericColumns[0] : (allColumns.length > 1 ? allColumns[1] : allColumns[0]);
      dispatch({ type: 'INIT_AXES', payload: { xAxis: initialX, yAxis: initialY }});
    }
  }, [allColumns, numericColumns, categoricalColumns, xAxis, yAxis]);

  useEffect(() => {
    if (!xAxis || !yAxis || !dataset?.data) {
        setChartData([]);
        return;
    };

    let processedData = [...dataset.data];

    if (aggregation !== 'none') {
      const groups = processedData.reduce((acc, row) => {
        const key = row[xAxis]?.toString() || 'N/A';
        const value = Number(row[yAxis]);
        if (!isNaN(value)) {
          if (!acc[key]) {
            acc[key] = { values: [], sum: 0, count: 0, min: Infinity, max: -Infinity };
          }
          acc[key].values.push(value);
          acc[key].sum += value;
          acc[key].count++;
          acc[key].min = Math.min(acc[key].min, value);
          acc[key].max = Math.max(acc[key].max, value);
        }
        return acc;
      }, {} as Record<string, { values: number[], sum: number, count: number, min: number, max: number }>);

      processedData = Object.entries(groups).map(([key, group]) => {
        let aggregatedValue = 0;
        switch (aggregation) {
          case 'sum': aggregatedValue = group.sum; break;
          case 'average': aggregatedValue = group.sum / group.count; break;
          case 'count': aggregatedValue = group.count; break;
          case 'min': aggregatedValue = group.min; break;
          case 'max': aggregatedValue = group.max; break;
        }
        return { [xAxis]: key, [yAxis]: aggregatedValue };
      });
    }

    let finalData = processedData.map((row) => ({
      name: row[xAxis]?.toString(),
      value: Number(row[yAxis]) || 0,
      size: Number(row[yAxis]) || 0,
    }));
    
    finalData.sort((a, b) => {
        const key = sortKey === 'x' ? 'name' : 'value';
        const valA = a[key];
        const valB = b[key];
        
        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
            comparison = valA - valB;
        } else {
            comparison = String(valA).localeCompare(String(valB));
        }

        return sortDirection === 'asc' ? comparison : -comparison;
    });

    setChartData(finalData);

  }, [xAxis, yAxis, dataset?.data, aggregation, sortKey, sortDirection, filters]);
  
  if (!dataset || !dataset.columns || !dataset.data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No data available for visualization. Please upload a dataset.
      </div>
    );
  }

  const chartWrapperProps = {
    className: "bg-gray-800/30 rounded-xl p-4 border border-gray-700 relative shadow-md",
    whileHover: { scale: 1.02, zIndex: 10, boxShadow: "0px 15px watchful rgba(0, 0, 0, 0.5)" },
    transition: { type: "spring", stiffness: 260, damping: 20 },
  };

  /** Renders all available charts in a grid */
  const renderAllCharts = () => {
    if (chartData.length === 0) {
        return (
          <div className="col-span-1 lg:col-span-2 flex items-center justify-center h-64 text-gray-500">
              <p>No data to display for the selected configuration.</p>
          </div>
        );
      }
  
    const colors = COLOR_PALETTES[colorPalette];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <motion.div {...chartWrapperProps}>
                <h3 className="text-white font-semibold mb-2">Bar Chart</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                        <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} interval={0} />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.1)' }}/>
                        <Bar dataKey="value" name={yAxis}>
                            {chartData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </motion.div>

            {/* Line Chart */}
            <motion.div {...chartWrapperProps}>
                <h3 className="text-white font-semibold mb-2">Line Chart</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                        <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} interval={0} />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="value" name={yAxis} stroke={colors[1 % colors.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }}/>
                    </LineChart>
                </ResponsiveContainer>
            </motion.div>

            {/* Area Chart */}
            <motion.div {...chartWrapperProps}>
                <h3 className="text-white font-semibold mb-2">Area Chart</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={colors[4 % colors.length]} stopOpacity={0.8}/>
                                <stop offset="95%" stopColor={colors[4 % colors.length]} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} interval={0} />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="value" name={yAxis} stroke={colors[4 % colors.length]} strokeWidth={3} fill="url(#areaGradient)" />
                    </AreaChart>
                </ResponsiveContainer>
            </motion.div>

            {/* Pie Chart */}
            <motion.div {...chartWrapperProps}>
                <h3 className="text-white font-semibold mb-2">Pie Chart</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Tooltip content={<CustomTooltip />} />
                        <Pie data={chartData.slice(0, 8)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                            {chartData.slice(0, 8).map((_, index) => (
                                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </motion.div>

             {/* Combo Chart */}
             <motion.div {...chartWrapperProps}>
                <h3 className="text-white font-semibold mb-2">Combo Chart</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={chartData}>
                        <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={60} interval={0} />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar dataKey="value" name={yAxis} barSize={20} fill={colors[0 % colors.length]} />
                        <Line type="monotone" dataKey="value" name={yAxis} stroke={colors[3 % colors.length]} strokeWidth={2} />
                    </ComposedChart>
                </ResponsiveContainer>
            </motion.div>

            {/* Radar Chart */}
            <motion.div {...chartWrapperProps}>
                <h3 className="text-white font-semibold mb-2">Radar Chart</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData.slice(0, 8)}>
                        <PolarGrid stroke="#4B5563" />
                        <PolarAngleAxis dataKey="name" stroke="#9CA3AF" />
                        <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} stroke="#4B5563" />
                        <Radar name={yAxis} dataKey="value" stroke={colors[6 % colors.length]} fill={colors[6 % colors.length]} fillOpacity={0.6} />
                        <Tooltip content={<CustomTooltip />} />
                    </RadarChart>
                </ResponsiveContainer>
            </motion.div>
        </div>
    );
  };
  
  return (
    <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5 border border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-white">Interactive Dashboard</h2>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200">
                    <Download className="h-4 w-4" /> <span>Export</span>
                </button>
            </div>
        </motion.div>

        {/* --- Controls Panel --- */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5 text-blue-400"/>
                Chart Controls
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {/* X-Axis (Category) */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">X-Axis (Category)</label>
                    <select value={xAxis} onChange={(e) => dispatch({ type: 'SET_X_AXIS', payload: e.target.value })} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
                        {categoricalColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                        {numericColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                </div>
                
                {/* Y-Axis (Value) */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Y-Axis (Value)</label>
                    <select value={yAxis} onChange={(e) => dispatch({ type: 'SET_Y_AXIS', payload: e.target.value })} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
                        {numericColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                        {categoricalColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                </div>

                {/* Aggregation */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Aggregation</label>
                    <select value={aggregation} onChange={(e) => dispatch({ type: 'SET_AGGREGATION', payload: e.target.value as AggregationMethod })} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
                        <option value="none">None</option>
                        <option value="sum">Sum</option>
                        <option value="average">Average</option>
                        <option value="count">Count</option>
                        <option value="min">Min</option>
                        <option value="max">Max</option>
                    </select>
                </div>

                {/* Sorting */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Sort By</label>
                    <div className="flex gap-2">
                        <select value={`${sortKey}-${sortDirection}`} onChange={(e) => {
                            const [key, direction] = e.target.value.split('-') as [SortKey, SortDirection];
                            dispatch({ type: 'SET_SORT', payload: { key, direction } });
                        }} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
                            <option value="x-asc">Category (A-Z)</option>
                            <option value="x-desc">Category (Z-A)</option>
                            <option value="y-asc">Value (Low-High)</option>
                            <option value="y-desc">Value (High-Low)</option>
                        </select>
                    </div>
                </div>

                 {/* Color Palette */}
                 <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Color Palette</label>
                    <select value={colorPalette} onChange={(e) => dispatch({ type: 'SET_PALETTE', payload: e.target.value as ColorPalette })} className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
                        <option value="vibrant">Vibrant</option>
                        <option value="cool">Cool Tones</option>
                        <option value="forest">Forest</option>
                        <option value="sunset">Sunset</option>
                    </select>
                </div>
            </div>
        </motion.div>

        {/* --- Rendered Charts --- */}
        {renderAllCharts()}
    </div>
  );
};

export default Visualizations;
