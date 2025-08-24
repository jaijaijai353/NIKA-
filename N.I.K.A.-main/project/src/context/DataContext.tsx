// src/context/DataContext.tsx

import React, { 
  createContext, 
  useContext, 
  useState, 
  ReactNode, 
  useEffect,
  useMemo 
} from "react";
import { Dataset, DataSummary, AIInsight, ColumnInfo } from "../types";
import { generateAIInsights, analyzeColumns } from "../utils/dataProcessor";

// --------------------------------------------------------------------------
// TYPE DEFINITIONS
// --------------------------------------------------------------------------

interface DataContextType {
  rawDataset: Dataset | null;      // The original, unmodified dataset
  dataset: Dataset | null;         // The current, working dataset (can be cleaned)
  dataSummary: DataSummary | null;
  aiInsights: AIInsight[];
  isLoading: boolean;

  // Actions
  loadNewDataset: (newDataset: Dataset) => void;
  updateCleanedData: (cleanedData: any[], newSummary?: DataSummary) => void;
  resetDataset: () => void;
  setDataSummary: (summary: DataSummary | null) => void;
}

// --------------------------------------------------------------------------
// CONTEXT CREATION
// --------------------------------------------------------------------------

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useDataContext = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("❌ useDataContext must be used within a DataProvider");
  }
  return context;
};

// --------------------------------------------------------------------------
// PROVIDER COMPONENT
// --------------------------------------------------------------------------

interface DataProviderProps {
  children: ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const [rawDataset, setRawDataset] = useState<Dataset | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [aiInsights, setAIInsights] = useState<AIInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // REMOVED: isInitialUpload, updateCounter, and forceDatasetUpdate are not needed.

  // --------------------------------------------------------------------------
  // CONTEXT ACTIONS
  // --------------------------------------------------------------------------

  /**
   * Loads a new dataset, setting both the raw (original) and working copies.
   * This should be called from your file upload component.
   */
  const loadNewDataset = (newDataset: Dataset) => {
    console.log("📂 Loading new dataset. Rows:", newDataset.data.length);
    setRawDataset(newDataset);
    setDataset(newDataset);
  };

  /**
   * Updates the working dataset with cleaned data.
   */
  const updateCleanedData = (cleanedData: any[], summary?: DataSummary) => {
    // FIX: The buggy 'isInitialUpload' check is removed.
    if (!dataset) {
      console.warn("⚠️ updateCleanedData called but no dataset is loaded.");
      return;
    }

    console.log("🧹 Applying cleaned data. New row count:", cleanedData.length);

    // A simple, direct, and reliable state update.
    setDataset(prevDataset => ({
      ...prevDataset!,
      data: cleanedData,
    }));

    if (summary) {
      setDataSummary(summary);
    }
  };
  
  /**
   * Resets the working dataset back to the original raw version.
   */
  const resetDataset = () => {
    if (rawDataset) {
      console.log("⏪ Resetting dataset to original version.");
      setDataset(rawDataset);
    }
  };

  // --------------------------------------------------------------------------
  // SIDE EFFECTS (e.g., AI Insights)
  // --------------------------------------------------------------------------

  useEffect(() => {
    const fetchInsights = async () => {
      if (!dataset) {
        setAIInsights([]);
        return;
      }
      setIsLoading(true);
      try {
        const columns: ColumnInfo[] = analyzeColumns(dataset.data);
        const insights = await generateAIInsights(dataset.data, columns);
        setAIInsights(insights);
      } catch (error) {
        console.error("❌ Error generating AI insights:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInsights();
  }, [dataset]);

  // --------------------------------------------------------------------------
  // CONTEXT PROVIDER AND VALUE
  // --------------------------------------------------------------------------
  
  // FIX: useMemo prevents all child components from re-rendering unnecessarily.
  const value = useMemo(() => ({
    rawDataset,
    dataset,
    dataSummary,
    aiInsights,
    isLoading,
    loadNewDataset,
    updateCleanedData,
    resetDataset,
    setDataSummary,
  }), [rawDataset, dataset, dataSummary, aiInsights, isLoading]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};
