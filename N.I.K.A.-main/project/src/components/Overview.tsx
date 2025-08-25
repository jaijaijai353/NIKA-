// src/pages/Overview.tsx

import React, { useState, useMemo, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, 
  AlertTriangle, 
  Users, 
  BarChart3,
  PieChart as PieIcon,
  TrendingUp,
  X,
  ArrowDown,
  ArrowUp,
  Search,
  FileDown,
  Inbox
} from 'lucide-react';
import { useDataContext } from '../context/DataContext';
import { 
  BarChart, Bar, Cell as BarCell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  PieChart, Pie, Cell as PieCell, Legend 
} from 'recharts';


// ===================================================================================
// 1. TYPE DEFINITIONS
// (Previously in src/types/data.ts)
// ===================================================================================

export interface NumericColumnStats {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
}
export interface CategoricalColumnStats {
  valueCounts: Record<string, number>;
  uniqueValues: number;
}
export interface DataColumn {
  name: string;
  type: 'numeric' | 'categorical' | 'date' | 'unknown' | 'integer';
  missingCount: number;
  stats: NumericColumnStats | CategoricalColumnStats | null;
}
export interface DataRow {
  [key: string]: string | number | null | undefined;
}
export interface Dataset {
  name: string;
  columns: DataColumn[];
  data: DataRow[];
  uploadedAt?: Date;
}
export interface DataSummary {
  totalRows: number;
  totalColumns: number;
  missingValues: number;
  duplicates: number;
}
export interface DataContextType {
  dataset: Dataset | null;
  dataSummary: DataSummary | null;
  isLoading: boolean;
}
export interface SortConfig {
  key: string;
  direction: 'ascending' | 'descending';
}


// ===================================================================================
// 2. CONSTANTS
// (Previously in src/constants.ts)
// ===================================================================================

const ROWS_PER_PAGE = 10;
const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];


// ===================================================================================
// 3. UTILITY FUNCTIONS
// (Previously in utils/ and hooks/)
// ===================================================================================

/**
 * Escapes a value for CSV format.
 */
const escapeCsvValue = (value: any): string => {
  if (value === null || typeof value === 'undefined') return '';
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

/**
 * Converts data to a CSV string and triggers a download.
 */
const exportToCSV = (data: DataRow[], columns: string[], filename: string): void => {
  const header = columns.map(escapeCsvValue).join(',');
  const rows = data.map(row => columns.map(col => escapeCsvValue(row[col])).join(','));
  const csvContent = [header, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Calculates detailed statistics for a column.
 */
const calculateColumnStats = (column: Pick<DataColumn, 'name' | 'type'>, data: DataRow[]): NumericColumnStats | CategoricalColumnStats | null => {
  const values = data.map(row => row[column.name]);

  if (column.type === 'numeric' || column.type === 'integer') {
    const numericValues = values.map(Number).filter(n => !isNaN(n) && Number.isFinite(n));
    if (numericValues.length === 0) return null;
    const sum = numericValues.reduce((a, b) => a + b, 0);
    const mean = sum / numericValues.length;
    const stdDev = Math.sqrt(numericValues.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / numericValues.length);
    return {
      min: Math.min(...numericValues),
      max: Math.max(...numericValues),
      mean: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
    };
  }

  if (column.type === 'categorical' || column.type === 'date') {
    const valueCounts = values.reduce<Record<string, number>>((acc, val) => {
      const key = String(val ?? 'NULL');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return { valueCounts, uniqueValues: Object.keys(valueCounts).length };
  }

  return null;
};

/**
 * Determines card color based on value.
 */
const getCardColor = (title: string, value: number, totalRows: number): string => {
    if (title === 'Missing Values' || title === 'Duplicates') {
        if (value === 0) return 'text-green-400';
        if (value <= (totalRows * 0.05)) return 'text-yellow-400';
        return 'text-red-400';
    }
    return 'text-blue-400';
};


// ===================================================================================
// 4. CHILD & HELPER COMPONENTS
// (All UI pieces are defined here before being used in the main component)
// ===================================================================================

// --- ErrorBoundary Component ---
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError = () => ({ hasError: true });
  componentDidCatch = (error: Error, errorInfo: ErrorInfo) => console.error("Dashboard Error:", error, errorInfo);
  render = () => this.state.hasError ? (
    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-8 text-center">
      <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
      <h2 className="text-xl font-bold text-white">Something went wrong</h2>
      <p className="text-red-300 mt-2">There was an error rendering the dashboard. Please try refreshing.</p>
    </div>
  ) : this.props.children;
}

// --- Skeleton Loader Components ---
const CardSkeleton: React.FC = () => (
  <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 animate-pulse">
    <div className="h-4 bg-gray-600 rounded w-1/3 mb-4"></div>
    <div className="h-8 bg-gray-600 rounded w-1/2"></div>
  </div>
);
const ChartSkeleton: React.FC = () => (
  <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 animate-pulse">
    <div className="h-6 bg-gray-600 rounded w-1/2 mb-6"></div>
    <div className="flex items-end justify-center h-[300px] space-x-4">
      {[...Array(5)].map((_, i) => <div key={i} style={{ height: `${20 + i * 15}%`}} className="w-8 bg-gray-600 rounded-t-md"></div>)}
    </div>
  </div>
);
const TableSkeleton: React.FC = () => (
    <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700 animate-pulse">
        <div className="h-6 bg-gray-600 rounded w-1/3 mb-6"></div>
        <div className="space-y-4">
            {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-gray-600 rounded w-full"></div>)}
        </div>
    </div>
);


// --- UI Components for the Dashboard ---
const SummaryCard: React.FC<{ title: string, value: number, icon: React.ElementType, color: string, bgColor: string, index: number, onClick: () => void }> = ({ title, value, icon: Icon, color, bgColor, index, onClick }) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: index * 0.1 }} className={`${bgColor} rounded-lg p-6 border border-gray-700 backdrop-blur-sm hover:border-gray-500 transition-all duration-200 cursor-pointer`} onClick={onClick}>
        <div className="flex items-center justify-between"><p className="text-gray-400 text-sm">{title}</p><Icon className={`h-8 w-8 ${color}`} /></div>
        <p className={`text-3xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </motion.div>
);

const DetailsModal: React.FC<{ column: DataColumn | null; onClose: () => void }> = ({ column, onClose }) => {
    // ... (Modal implementation with inline charts as previously defined)
};

const ColumnTypesChart: React.FC<{ pieData: any[]; selectedType: string | null; setSelectedType: (type: string | null) => void }> = ({ pieData, selectedType, setSelectedType }) => {
    // ... (Pie chart component implementation as previously defined)
};

const MissingValuesChart: React.FC<{ missingColumns: any[]; maxMissingCount: number; onBarClick: (col: string) => void; activeFilterColumn?: string }> = ({ missingColumns, maxMissingCount, onBarClick, activeFilterColumn }) => {
    // ... (Bar chart component implementation as previously defined)
};

const DataPreviewTable: React.FC<{ columns: DataColumn[]; rows: DataRow[]; sortConfig: SortConfig | null; onSort: (key: string) => void; datasetName: string; }> = ({ columns, rows, sortConfig, onSort, datasetName }) => {
    // ... (Full table component implementation with search, pagination, and export as previously defined)
};


// ===================================================================================
// 5. MAIN OVERVIEW COMPONENT
// ===================================================================================

const Overview: React.FC = () => {
    const { dataset: rawDataset, dataSummary, isLoading } = useDataContext() as DataContextType;

    // --- STATE MANAGEMENT ---
    const [modalData, setModalData] = useState<DataColumn | null>(null);
    const [activeFilter, setActiveFilter] = useState<{ type: 'duplicates' | 'missing'; column?: string } | null>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    // --- DATA PROCESSING (Previously in a custom hook) ---
    const { enhancedDataset, pieData, missingColumns, maxMissingCount, duplicateRowIndices } = useMemo(() => {
        if (!rawDataset || !dataSummary) {
            return { enhancedDataset: null, pieData: [], missingColumns: [], maxMissingCount: 0, duplicateRowIndices: new Set<number>() };
        }
        
        const enhancedColumns = rawDataset.columns.map(col => ({
            ...col,
            stats: calculateColumnStats(col, rawDataset.data),
        }));
        const enhancedDataset = { ...rawDataset, columns: enhancedColumns };

        // ... (Full data processing logic for pieData, missingColumns, duplicateRowIndices)
        
        return { enhancedDataset, /* ...other data... */ };
    }, [rawDataset, dataSummary]);

    // --- DERIVED STATE FOR RENDERING ---
    const previewData = useMemo(() => {
        if (!enhancedDataset) return [];
        // ... (Full filtering and sorting logic for preview data)
    }, [enhancedDataset, activeFilter, sortConfig, duplicateRowIndices]);

    // --- EVENT HANDLERS ---
    const handleSort = useCallback((key: string) => {
        // ... (Sorting handler logic)
    }, [sortConfig]);
    
    const handleCardClick = (title: string) => {
        // ... (Card click handler logic)
    };
    
    const handleBarClick = (columnName: string) => {
        // ... (Bar click handler logic)
    };

    // --- RENDER LOGIC ---

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ChartSkeleton /><ChartSkeleton />
                </div>
                <TableSkeleton />
            </div>
        );
    }

    if (!enhancedDataset || !dataSummary) {
        return (
            <div className="flex items-center justify-center h-96 text-gray-400">
                <div className="text-center">
                    <Database className="mx-auto h-16 w-16 text-gray-600 mb-4" />
                    <h2 className="text-xl font-semibold text-white">No Data Available</h2>
                    <p className="mt-2">Please upload a file to begin analysis.</p>
                </div>
            </div>
        );
    }

    const summaryCards = [
        { title: 'Total Rows', value: dataSummary.totalRows, icon: Database, bgColor: 'bg-blue-500/10' },
        { title: 'Total Columns', value: dataSummary.totalColumns, icon: BarChart3, bgColor: 'bg-green-500/10' },
        { title: 'Missing Values', value: dataSummary.missingValues, icon: AlertTriangle, bgColor: 'bg-yellow-500/10' },
        { title: 'Duplicates', value: dataSummary.duplicates, icon: Users, bgColor: 'bg-red-500/10' }
    ];

    return (
        <ErrorBoundary>
            <div className="p-4 sm:p-6 space-y-6 bg-gray-900 text-white min-h-screen">
                <DetailsModal column={modalData} onClose={() => setModalData(null)} />
                
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                    <h1 className="text-3xl font-bold text-white mb-2">Data Overview</h1>
                    <p className="text-gray-400">Analysis for: <span className="font-semibold text-gray-200">{enhancedDataset.name}</span></p>
                    <p className="text-gray-400 text-sm">Uploaded: {enhancedDataset.uploadedAt?.toLocaleString('en-IN') || 'Not available'}</p>
                </motion.div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                    {summaryCards.map((card, index) => (
                        <SummaryCard key={card.title} {...card} color={getCardColor(card.title, card.value, dataSummary.totalRows)} index={index} onClick={() => handleCardClick(card.title)} />
                    ))}
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-2">
                        <ColumnTypesChart pieData={pieData} selectedType={activeFilter?.type === 'missing' ? 'missing' : null} setSelectedType={() => {}} />
                    </div>
                    <div className="lg:col-span-3">
                        <MissingValuesChart missingColumns={missingColumns} maxMissingCount={maxMissingCount} onBarClick={handleBarClick} activeFilterColumn={activeFilter?.column} />
                    </div>
                </div>
                
                <DataPreviewTable columns={enhancedDataset.columns} rows={previewData} sortConfig={sortConfig} onSort={handleSort} datasetName={enhancedDataset.name} />
            </div>
        </ErrorBoundary>
    );
};

export default Overview;
