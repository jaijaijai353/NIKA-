// src/context/DataContext.tsx

import React, { 
  createContext, 
  useContext, 
  useState, 
  ReactNode, 
  useMemo 
} from "react";
import { Dataset, DataSummary, AIInsight } from "../types"; // Assuming types are defined here

/* -------------------------------------------------------------------------- */
/* TYPE DEFINITIONS                              */
/* -------------------------------------------------------------------------- */

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
}

/* -------------------------------------------------------------------------- */
/* CONTEXT CREATION                              */
/* -------------------------------------------------------------------------- */

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useDataContext = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("❌ useDataContext must be used within a DataProvider");
  }
  return context;
};

/* -------------------------------------------------------------------------- */
/* PROVIDER COMPONENT                             */
/* -------------------------------------------------------------------------- */

interface DataProviderProps {
  children: ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const [rawDataset, setRawDataset] = useState<Dataset | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [aiInsights, setAIInsights] = useState<AIInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /* -------------------------------------------------------------------------- */
  /* CONTEXT ACTIONS                              */
  /* -------------------------------------------------------------------------- */

  /**
   * Loads a completely new dataset, setting both the raw and working copies.
   * This should be called when a user uploads a new file.
   */
  const loadNewDataset = (newDataset: Dataset) => {
    console.log("📂 Loading new dataset. Rows:", newDataset.data.length);
    setRawDataset(newDataset); // Save the original
    setDataset(newDataset);     // Set the working copy
    // NOTE: You might want to generate summary/insights here as well
  };

  /**
   * Updates the working dataset with cleaned data.
   * This is called by the cleaning components.
   */
  const updateCleanedData = (cleanedData: any[], newSummary?: DataSummary) => {
    // FIX: The check for 'isInitialUpload' is removed, as it was the main bug.
    if (!dataset) {
      console.warn("⚠️ updateCleanedData called but no dataset is loaded.");
      return;
    }

    console.log("🧹 Applying cleaned data. New row count:", cleanedData.length);

    // A simple, direct state update. No timeouts or counters needed.
    setDataset(prevDataset => ({
      ...prevDataset!,
      data: cleanedData,
    }));

    if (newSummary) {
      setDataSummary(newSummary);
    }
  };

  /**
   * Resets the working dataset back to the original raw version.
   */
  const resetDataset = () => {
    if (rawDataset) {
      console.log("⏪ Resetting dataset to original version.");
      setDataset(rawDataset);
      // NOTE: You'll likely want to re-calculate the summary here too.
    }
  };

  // --- Side effects like AI insight generation can remain here ---
  // useEffect(() => {
  //   if (dataset) {
  //     // your async AI insight generation logic
  //   }
  // }, [dataset]);


  /* -------------------------------------------------------------------------- */
  /* CONTEXT PROVIDER AND VALUE                         */
  /* -------------------------------------------------------------------------- */
  
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
  }), [rawDataset, dataset, dataSummary, aiInsights, isLoading]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};
