import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Database, 
  TrendingUp, 
  AlertTriangle, 
  Users,
  BarChart3,
  PieChart
} from 'lucide-react';
import { useDataContext } from '../context/DataContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart as RechartsPieChart, Pie, Cell, Legend 
} from 'recharts';

/**
 * A helper function to render any cell value as a string, preserving its original format.
 * @param value - The data from a cell in the dataset.
 * @returns A string representation of the value.
 */
const renderCellValue = (value: any): string => {
  // Display null or undefined values as a consistent placeholder
  if (value === null || typeof value === 'undefined') {
    return '-';
  }

  // For objects or arrays, stringify them to avoid displaying "[object Object]"
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  // For all other primitive types (string, number, boolean), convert to string
  return String(value);
};


const Overview: React.FC = () => {
  const { dataset, dataSummary } = useDataContext();
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Memoize derived data to prevent recalculations on every render
  const { pieData, missingColumns, maxMissingCount, previewData, columnTotals } = useMemo(() => {
    if (!dataset) {
      return { pieData: [], missingColumns: [], maxMissingCount: 0, previewData: [], columnTotals: {} };
    }

    // Pie Chart Data for Column Types
    const typeData: Record<string, number> = {};
    dataset.columns.forEach(col => {
      const type = col.type || 'Unknown';
      typeData[type] = (typeData[type] || 0) + 1;
    });
    const total = Object.values(typeData).reduce((sum, val) => sum + val, 0);
    const calculatedPieData = Object.entries(typeData).map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
    }));

    // Bar Chart Data for Missing Values
    const calculatedMissingColumns = dataset.columns
      .filter(col => typeof col.missingCount === 'number' && col.missingCount > 0)
      .map(col => ({
        ...col,
        highlight: selectedType ? col.type === selectedType : true
      }));

    const calculatedMaxMissing = Math.max(0, ...calculatedMissingColumns.map(col => col.missingCount || 0));
    
    // Preview Data (Top 5 Rows)
    const calculatedPreviewData = dataset.data.slice(0, 5);
    
    // Totals for numeric columns in the preview table footer
    const totals: Record<string, string> = {};
    dataset.columns.forEach(col => {
      // Use the pre-calculated column type for a more reliable check
      if (col.type === 'numeric' || col.type === 'integer') {
        const total = dataset.data.reduce((sum, row) => {
          const value = row[col.name];
          // Ensure value is a valid number before adding
          return sum + (typeof value === 'number' && !isNaN(value) ? value : 0);
        }, 0);
        totals[col.name] = total.toLocaleString();
      } else {
        totals[col.name] = ''; // Display nothing for non-numeric columns
      }
    });

    return {
      pieData: calculatedPieData,
      missingColumns: calculatedMissingColumns,
      maxMissingCount: calculatedMaxMissing,
      previewData: calculatedPreviewData,
      columnTotals: totals,
    };
  }, [dataset, selectedType]);

  if (!dataset || !dataSummary) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">No data available. Please upload a file to begin.</p>
      </div>
    );
  }
  
  const getCardColor = (title: string, value: number) => {
    switch(title) {
      case 'Missing Values':
      case 'Duplicates':
        if (value === 0) return 'text-green-400';
        if (value <= (dataset.data.length * 0.05)) return 'text-yellow-400'; // Warning if >5%
        return 'text-red-400';
      default:
        return 'text-blue-400';
    }
  };

  const summaryCards = [
    { title: 'Total Rows', value: dataSummary.totalRows, icon: Database, bgColor: 'bg-blue-500/10' },
    { title: 'Total Columns', value: dataSummary.totalColumns, icon: BarChart3, bgColor: 'bg-green-500/10' },
    { title: 'Missing Values', value: dataSummary.missingValues, icon: AlertTriangle, bgColor: 'bg-yellow-500/10' },
    { title: 'Duplicates', value: dataSummary.duplicates, icon: Users, bgColor: 'bg-red-500/10' }
  ];

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
  const generateColor = (index: number) => `hsl(${(index * 60) % 360}, 70%, 50%)`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700"
      >
        <h2 className="text-2xl font-bold text-white mb-2">Data Overview</h2>
        <p className="text-gray-400">Dataset: {dataset.name}</p>
        {/* FIX: Added optional chaining (?.) and a fallback text to prevent crash */}
        <p className="text-gray-400 text-sm">Uploaded: {dataset.uploadedAt?.toLocaleString() || 'Not available'}</p>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {summaryCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`${card.bgColor} rounded-lg p-6 border border-gray-700 backdrop-blur-sm hover:border-gray-500 transition-all duration-200`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">{card.title}</p>
                  <p className={`text-3xl font-bold ${getCardColor(card.title, Number(card.value))}`}>
                    {Number(card.value).toLocaleString()}
                  </p>
                </div>
                <Icon className={`h-8 w-8 ${getCardColor(card.title, Number(card.value))}`} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column Types Distribution */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
            <PieChart className="h-5 w-5 mr-2 text-purple-400" />
            Column Types Distribution
          </h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  paddingAngle={5}
                  label={({ name, percentage }) => `${name} (${percentage}%)`}
                  onClick={(data) => setSelectedType(prev => prev === data.name ? null : data.name)} // Toggle selection
                  cursor="pointer"
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length] || generateColor(index)}
                      stroke={selectedType === entry.name ? '#fff' : 'none'}
                      strokeWidth={selectedType === entry.name ? 3 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white shadow-lg">
                        <p><strong>{data.name}</strong></p>
                        <p>Count: {data.value}</p>
                        <p>Percentage: {data.percentage}%</p>
                      </div>
                    );
                  }}
                />
                <Legend iconType="circle" />
              </RechartsPieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center mt-12">No column type data available</p>
          )}
        </motion.div>

        {/* Missing Values by Column */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-green-400" />
            Missing Values by Column
          </h3>
          {missingColumns.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={missingColumns} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} angle={-45} textAnchor="end" height={80} interval={0} />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  cursor={{ fill: 'rgba(107, 114, 128, 0.1)' }}
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-gray-900 border border-gray-600 rounded p-2 text-sm text-white shadow-lg">
                        <p><strong>{data.name}</strong></p>
                        <p>Missing: {data.missingCount}</p>
                        <p>Type: {data.type}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="missingCount">
                  {missingColumns.map((col, idx) => {
                    const isMax = col.missingCount === maxMissingCount && col.highlight;
                    const fillColor = isMax ? '#F87171' : col.highlight ? '#FBBF24' : '#4B5563';
                    return <Cell key={`barcell-${idx}`} fill={fillColor} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
               <p className="text-gray-400 text-center">No missing values found in the dataset! ✨</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Data Preview Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">Data Preview (First 5 Rows)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-700/20">
              <tr className="border-b-2 border-gray-600">
                {dataset.columns.map(col => (
                  <th key={col.name} className="p-3 text-gray-300 font-semibold tracking-wider">
                    {col.name}
                    <span className="block text-xs text-purple-400 font-normal">{col.type}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewData.map((row, index) => (
                <tr key={index} className="border-b border-gray-700 hover:bg-gray-700/20 transition-colors">
                  {dataset.columns.map(col => (
                    <td
                      key={col.name}
                      className={`p-3 text-gray-300 whitespace-nowrap ${selectedType === col.type ? 'bg-purple-500/10' : ''}`}
                    >
                      {renderCellValue(row[col.name])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-700/20">
                <tr className="border-t-2 border-gray-600">
                    {dataset.columns.map(col => (
                        <td key={`${col.name}-total`} className="p-3 text-gray-300 font-bold">
                            {columnTotals[col.name]}
                        </td>
                    ))}
                </tr>
            </tfoot>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default Overview;
