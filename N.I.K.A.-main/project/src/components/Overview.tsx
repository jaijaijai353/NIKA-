// src/pages/Overview.tsx

import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Database, 
  AlertTriangle, 
  Users, 
  BarChart3,
  Loader,
  X
} from 'lucide-react';
import { useDataContext } from '../context/DataContext';
import { 
  DataContextType, 
  DataColumn, 
  DataRow, 
  SortConfig, 
  NumericColumnStats, 
  CategoricalColumnStats 
} from '../types/data';

// Import modular components
import { SummaryCard } from '../components/overview/SummaryCard';
import { ColumnTypesChart } from '../components/overview/ColumnTypesChart';
import { MissingValuesChart } from '../components/overview/MissingValuesChart';
import { DataPreviewTable } from '../components/overview/DataPreviewTable';
import { CardSkeleton, ChartSkeleton, TableSkeleton } from '../components/overview/SkeletonLoaders';
import ErrorBoundary from '../components/overview/ErrorBoundary';
import { DetailsModal } from '../components/overview/DetailsModal';

// --- UTILITY FUNCTIONS (Scoped to this file or moved to a utils file) ---

/**
 * Calculates detailed statistics for a given column based on its type.
 * @param column - The column object.
 * @param data - The full dataset array.
 * @returns An object containing stats, or null if type is unknown.
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
    
    return {
      valueCounts,
      uniqueValues: Object.keys(valueCounts).length,
    };
  }

  return null;
};

/**
 * Determines the appropriate color for a summary card based on its value.
 * @param title - The title of the card.
 * @param value - The numeric value of the card.
 * @param totalRows - The total number of rows in the dataset for context.
 * @returns A Tailwind CSS color class string.
 */
const getCardColor = (title: string, value: number, totalRows: number): string => {
  switch (title) {
    case 'Missing Values':
    case 'Duplicates':
      if (value === 0) return 'text-green-400';
      // Warning if over 5% of rows are affected
      if (value <= (totalRows * 0.05)) return 'text-yellow-400';
      return 'text-red-400';
    default:
      return 'text-blue-400';
  }
};


// --- MAIN OVERVIEW COMPONENT ---

const Overview: React.FC = () => {
  const { dataset: rawDataset, dataSummary, isLoading } = useDataContext() as DataContextType;
  
  // --- STATE MANAGEMENT ---

  // State for interactive chart filtering
  const [selectedType, setSelectedType] = useState<string | null>(null);
  
  // State for the preview table's sorting configuration
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // State for managing the details modal
  const [modalData, setModalData] = useState<DataColumn | null>(null);

  // State for filtering the preview table from chart interactions
  const [previewFilter, setPreviewFilter] = useState<{ column: string; value: any } | null>(null);


  // --- MEMOIZED DATA PROCESSING ---

  /**
   * The "brain" of the dashboard. This comprehensive useMemo hook performs all
   * expensive calculations only when the source data changes. It now calculates
   * detailed statistics for every column.
   */
  const { 
    dataset,
    pieData, 
    missingColumns, 
    maxMissingCount, 
    previewData
  } = useMemo(() => {
    if (!rawDataset || !dataSummary) {
      return { dataset: null, pieData: [], missingColumns: [], maxMissingCount: 0, previewData: [], columnTotals: {} };
    }

    // Enhance dataset with detailed stats for each column
    const enhancedColumns = rawDataset.columns.map(col => ({
      ...col,
      stats: calculateColumnStats(col, rawDataset.data),
    }));
    
    const enhancedDataset = { ...rawDataset, columns: enhancedColumns };

    // Pie Chart Data for Column Types
    const typeData = enhancedColumns.reduce<Record<string, number>>((acc, col) => {
      const type = col.type || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const totalCols = Object.values(typeData).reduce((sum, val) => sum + val, 0);
    const calculatedPieData = Object.entries(typeData).map(([name, value]) => ({
      name,
      value,
      percentage: totalCols > 0 ? ((value / totalCols) * 100).toFixed(1) : '0.0',
    }));

    // Bar Chart Data for Missing Values (with added percentage for enhanced tooltip)
    const calculatedMissingColumns = enhancedColumns
      .filter(col => col.missingCount > 0)
      .map(col => ({
        ...col,
        highlight: selectedType ? col.type === selectedType : true,
        missingPercentage: ((col.missingCount / dataSummary.totalRows) * 100).toFixed(1),
      }));

    const calculatedMaxMissing = Math.max(0, ...calculatedMissingColumns.map(col => col.missingCount));
    
    // Process Preview Data (Sorting and Filtering)
    let processedPreviewData = [...rawDataset.data];

    // Apply filter from chart interactions
    if (previewFilter) {
      processedPreviewData = processedPreviewData.filter(row => {
        const value = row[previewFilter.column];
        return value === null || value === undefined || value === '';
      });
    }

    // Apply sorting
    if (sortConfig !== null) {
      processedPreviewData.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    
    return {
      dataset: enhancedDataset,
      pieData: calculatedPieData,
      missingColumns: calculatedMissingColumns,
      maxMissingCount: calculatedMaxMissing,
      previewData: processedPreviewData,
    };
  }, [rawDataset, dataSummary, selectedType, sortConfig, previewFilter]);


  // --- EVENT HANDLERS ---
  
  /** Toggles the sorting configuration for the preview table. */
  const handleSort = useCallback((key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  /** Sets a filter for the preview table based on a clicked bar chart column. */
  const handleBarClick = useCallback((columnName: string) => {
    // If clicking the same bar again, clear the filter
    if (previewFilter && previewFilter.column === columnName) {
      setPreviewFilter(null);
    } else {
      setPreviewFilter({ column: columnName, value: null });
    }
  }, [previewFilter]);


  // --- RENDER LOGIC ---

  // 1. Loading State using Skeleton Components
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <TableSkeleton />
      </div>
    );
  }

  // 2. Empty State (after loading is complete)
  if (!dataset || !dataSummary) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-400">
        <div className="text-center">
          <Database className="mx-auto h-16 w-16 text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-white">No Data Available</h2>
          <p className="mt-2">Please upload a file to begin the analysis.</p>
        </div>
      </div>
    );
  }

  const summaryCards = [
    { title: 'Total Rows', value: dataSummary.totalRows, icon: Database, bgColor: 'bg-blue-500/10' },
    { title: 'Total Columns', value: dataSummary.totalColumns, icon: BarChart3, bgColor: 'bg-green-500/10' },
    { title: 'Missing Values', value: dataSummary.missingValues, icon: AlertTriangle, bgColor: 'bg-yellow-500/10' },
    { title: 'Duplicates', value: dataSummary.duplicates, icon: Users, bgColor: 'bg-red-500/10' },
  ];

  // 3. Main Dashboard Render
  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Details Modal - rendered conditionally */}
        <DetailsModal column={modalData} onClose={() => setModalData(null)} />

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700"
        >
          <h1 className="text-3xl font-bold text-white mb-2">Data Overview</h1>
          <p className="text-gray-400">
            Analysis for: <span className="font-semibold text-gray-200">{dataset.name}</span>
          </p>
          <p className="text-gray-400 text-sm">
            Uploaded: {dataset.uploadedAt?.toLocaleString() || 'Not available'}
          </p>
        </motion.div>

        {/* Summary Cards Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {summaryCards.map((card, index) => (
            <SummaryCard
              key={card.title}
              title={card.title}
              value={card.value}
              icon={card.icon}
              bgColor={card.bgColor}
              color={getCardColor(card.title, card.value, dataSummary.totalRows)}
              index={index}
              onClick={() => {
                const relevantColumn = dataset.columns.find(c => c.name.toLowerCase().includes(card.title.toLowerCase().slice(0, 4)));
                if(relevantColumn) setModalData(relevantColumn);
              }}
            />
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ColumnTypesChart
            pieData={pieData}
            selectedType={selectedType}
            setSelectedType={setSelectedType}
          />
          <MissingValuesChart
            missingColumns={missingColumns}
            maxMissingCount={maxMissingCount}
            onBarClick={handleBarClick}
            activeFilterColumn={previewFilter?.column}
          />
        </div>

        {/* Data Preview Table Section with enhanced props */}
        <DataPreviewTable
          columns={dataset.columns}
          previewData={previewData}
          selectedType={selectedType}
          sortConfig={sortConfig}
          onSort={handleSort}
          activeFilterColumn={previewFilter?.column}
        />
      </div>
    </ErrorBoundary>
  );
};

export default Overview;
