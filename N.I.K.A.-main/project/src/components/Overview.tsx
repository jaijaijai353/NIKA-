import React, [object Object], [object Object] from 'react';
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
import { motion as m } from 'framer-motion';

const Overview: React.FC = () => {
  const { dataset, dataSummary, updateCounter } = useDataContext();
  
  // Debug: Log when component renders to see updates
  console.log("Overview component rendered:", { 
    hasDataset: !!dataset, 
    dataLength: dataset?.data?.length,
    updateCounter 
  });
  
  // Debug: Log when updateCounter changes specifically
  useEffect(() => {
    console.log("Overview: Update counter changed to:", updateCounter);
  }, [updateCounter]);
  
  // Debug: Log when the dataset's data array changes
  useEffect(() => {
    console.log("Overview: Dataset data length changed to:", dataset?.data?.length);
  }, [dataset?.data?.length]);

  // Debug: Log when the summary object updates
  useEffect(() => {
    console.log("Overview: dataSummary updated:", dataSummary);
  }, [dataSummary]);

  const [selectedType, setSelectedType] = useState<string | null>(null);

  if (!dataset || !dataSummary) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">No data available. Please upload a file to begin.</p>
      </div>
    );
  }

  // Dynamic summary card colors
  const getCardColor = (title: string, value: number) => {
    switch(title) {
      case 'Missing Values':
        if (value === 0) return 'text-green-400';
        if (value <= 50) return 'text-yellow-400';
        return 'text-red-400';
      case 'Duplicates':
        if (value === 0) return 'text-green-400';
        if (value <= 50) return 'text-yellow-400';
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

  // Column type distribution
  const { pieData } = useMemo(() => {
    if (!dataset?.columns) return { pieData: [] };
    const typeData: Record<string, number> = {};
    dataset.columns.forEach(col => {
      const type = col.type || 'Unknown';
      typeData[type] = (typeData[type] || 0) + 1;
    });
    const total = Object.values(typeData).reduce((sum, val) => sum + val, 0);
    if (total === 0) return { pieData: [] };
    return {
      pieData: Object.entries(typeData).map(([name, value]) => ({
        name,
        value,
        percentage: ((value / total) * 100).toFixed(1)
      }))
    };
  }, [dataset, updateCounter]);

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

  // Missing values with highlight
  const missingColumns = useMemo(() => {
    if (!dataset?.columns) return [];
    // Assuming another process enriches columns with missingCount.
    // If not present, this will safely result in an empty array.
    return dataset.columns
      .filter(col => typeof col.missingCount === 'number' && col.missingCount > 0)
      .map(col => ({
        ...col,
        highlight: selectedType ? col.type === selectedType : true
      }));
  }, [dataset, selectedType, updateCounter]);

  // Max missing count for pulsing animation
  const maxMissingCount = useMemo(() => {
    if (missingColumns.length === 0) return 0;
    return Math.max(...missingColumns.map(col => col.missingCount || 0));
  }, [missingColumns]);

  const previewData = dataset.data.slice(0, 5);
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
        <p className="text-gray-400">Dataset: {dataset.name || "Untitled Dataset"}</p>
        <p className="text-gray-400 text-sm">Last Update: {new Date(dataset.updatedAt || Date.now()).toLocaleString()}</p>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        {summaryCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={`${card.title}-${updateCounter}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`${card.bgColor} rounded-lg p-6 border border-gray-700 backdrop-blur-sm hover:scale-105 transition-transform duration-200`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">{card.title}</p>
                  <motion.p 
                    className={`text-2xl font-bold ${getCardColor(card.title, Number(card.value))}`} 
                    initial={{ scale: 0.8 }} 
                    animate={{ scale: 1 }} 
                    transition={{ duration: 0.3, delay: index * 0.1 + 0.2 }}
                  >
                    {card.value.toLocaleString ? card.value.toLocaleString() : card.value}
                  </motion.p>
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
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                  onClick={(data) => setSelectedType(selectedType === data.name ? null : data.name)}
                  cursor="pointer"
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
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
                      <div className="bg-gray-800 border border-gray-600 rounded p-2 text-sm text-white">
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

        {/* Missing Values by Column with Pulse */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-green-400" />
            Missing Values by Column
          </h3>
          {missingColumns.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={missingColumns}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-gray-800 border border-gray-600 rounded p-2 text-sm text-white">
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
                    const fillColor = isMax ? '#EF4444' : col.highlight ? '#F59E0B' : '#374151';
                    return (
                      <Cell key={`barcell-${idx}`} fill={fillColor} />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center mt-12">No missing values detected in dataset</p>
          )}
        </motion.div>
      </div>

      {/* Data Preview Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">Data Preview (Top 5 Rows)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-600">
                {dataset.columns.map(col => (
                  <th key={col.name} className="text-left p-3 text-gray-300 font-medium">
                    {col.name}
                    <span className="block text-xs text-gray-500 font-normal">{col.type}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewData.map((row, index) => (
                <tr key={index} className="border-b border-gray-700 hover:bg-gray-700/20">
                  {dataset.columns.map(col => (
                    <td
                      key={col.name}
                      className={`p-3 text-gray-300 ${selectedType === col.type ? 'bg-gray-700/40 font-semibold' : ''}`}
                    >
                      {row[col.name]?.toString() || '-'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-gray-600 font-semibold">
                {dataset.columns.map(col => {
                  const numericTypes = ["Number", "Integer", "Float", "Currency", "Percentage"];
                  const isNumeric = numericTypes.includes(String(col.type));
                  const total = isNumeric 
                    ? dataset.data.reduce((sum, row) => sum + (Number(row[col.name]) || 0), 0)
                    : '-';
                  const formattedTotal = isNumeric ? (total as number).toLocaleString() : '-';
                  return <td key={`${col.name}-total`} className="p-3 text-gray-300">{formattedTotal}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default Overview;
