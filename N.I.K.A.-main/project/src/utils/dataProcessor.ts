import { Dataset, ColumnInfo, DataSummary, AIInsight } from '../types';
import Papa from 'papaparse';

// ✅ Parse CSV file
export const parseCSV = (file: File): Promise<Record<string, any>[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(`CSV parsing error: ${results.errors[0].message}`));
        } else {
          resolve(results.data as Record<string, any>[]);
        }
      },
      error: (error) => reject(error)
    });
  });
};

// ✅ Analyze columns
export const analyzeColumns = (data: Record<string, any>[]): ColumnInfo[] => {
  if (data.length === 0) return [];
  
  const columns = Object.keys(data[0]);
  
  return columns.map(columnName => {
    const values = data.map(row => row[columnName]).filter(val => val !== null && val !== undefined && val !== '');
    const nonMissingCount = values.length;
    const missingCount = data.length - nonMissingCount;
    const uniqueValues = new Set(values);
    
    // Detect column type
    const numericValues = values.filter(val => typeof val === 'number' && !isNaN(val));
    const isNumeric = numericValues.length > values.length * 0.8;
    
    let type: ColumnInfo['type'] = 'text';
    if (isNumeric) {
      type = 'numeric';
    } else if (uniqueValues.size < values.length * 0.1) {
      type = 'categorical';
    } else if (values.some(val => !isNaN(Date.parse(val)))) {
      type = 'date';
    }
    
    const columnInfo: ColumnInfo = {
      name: columnName,
      type,
      missingCount,
      uniqueCount: uniqueValues.size
    };
    
    if (type === 'numeric' && numericValues.length > 0) {
      columnInfo.min = Math.min(...numericValues);
      columnInfo.max = Math.max(...numericValues);
      columnInfo.mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      columnInfo.median = numericValues.sort((a, b) => a - b)[Math.floor(numericValues.length / 2)];
      columnInfo.std = Math.sqrt(
        numericValues.reduce((acc, val) => acc + Math.pow(val - columnInfo.mean!, 2), 0) / numericValues.length
      );
    }
    
    return columnInfo;
  });
};

// ✅ Data summary
export const generateDataSummary = (data: Record<string, any>[]): DataSummary => {
  const totalRows = data.length;
  const totalColumns = data.length > 0 ? Object.keys(data[0]).length : 0;
  
  let missingValues = 0;
  const seen = new Set();
  let duplicates = 0;
  
  data.forEach(row => {
    const rowString = JSON.stringify(row);
    if (seen.has(rowString)) {
      duplicates++;
    } else {
      seen.add(rowString);
    }
    
    Object.values(row).forEach(value => {
      if (value === null || value === undefined || value === '') {
        missingValues++;
      }
    });
  });
  
  const memoryUsage = `${(JSON.stringify(data).length / 1024).toFixed(2)} KB`;
  
  return {
    totalRows,
    totalColumns,
    missingValues,
    duplicates,
    memoryUsage
  };
};

// ✅ AI Insights
export const generateAIInsights = (data: Record<string, any>[], columns: ColumnInfo[]): AIInsight[] => {
  const insights: AIInsight[] = [];
  
  // Missing values
  const highMissingColumns = columns.filter(col => col.missingCount > data.length * 0.2);
  if (highMissingColumns.length > 0) {
    insights.push({
      id: `missing-${Date.now()}`,
      title: 'High Missing Values Detected',
      description: `Columns ${highMissingColumns.map(c => c.name).join(', ')} have more than 20% missing values.`,
      importance: 'high',
      type: 'anomaly',
      confidence: 0.9
    });
  }
  
  // Correlation
  const numericColumns = columns.filter(col => col.type === 'numeric');
  if (numericColumns.length >= 2) {
    insights.push({
      id: `correlation-${Date.now()}`,
      title: 'Potential Correlations Found',
      description: `Found ${numericColumns.length} numeric columns. Explore correlations in visualization.`,
      importance: 'medium',
      type: 'correlation',
      confidence: 0.7
    });
  }
  
  // Categorical distribution
  const categoricalColumns = columns.filter(col => col.type === 'categorical');
  categoricalColumns.forEach(col => {
    if (col.uniqueCount < 10) {
      insights.push({
        id: `category-${col.name}-${Date.now()}`,
        title: `${col.name} Distribution`,
        description: `Column "${col.name}" has ${col.uniqueCount} unique categories.`,
        importance: 'medium',
        type: 'trend',
        confidence: 0.8
      });
    }
  });
  
  // Data quality
  const completeness = (1 - columns.reduce((sum, col) => sum + col.missingCount, 0) / (data.length * columns.length)) * 100;
  if (completeness > 90) {
    insights.push({
      id: `quality-${Date.now()}`,
      title: 'Excellent Data Quality',
      description: `Your dataset has ${completeness.toFixed(1)}% completeness.`,
      importance: 'high',
      type: 'recommendation',
      confidence: 0.95
    });
  }
  
  return insights;
};

// ✅ File validation
export const validateFile = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'text/csv',
    'application/json',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be less than 10MB' };
  }
  
  if (!allowedTypes.includes(file.type) && !file.name.endsWith('.csv')) {
    return { valid: false, error: 'Only CSV, Excel, and JSON files are supported' };
  }
  
  return { valid: true };
};
