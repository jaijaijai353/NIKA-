// src/context/DataContext.tsx
import React, { 
  createContext, 
  useContext, 
  useState, 
  useEffect, 
  ReactNode 
} from "react";

// Import project-specific types
import { Dataset, DataSummary, AIInsight, ColumnInfo } from "../types";

// Import utility functions for processing
import { generateAIInsights, analyzeColumns } from "../utils/dataProcessor";

/* -------------------------------------------------------------------------- */
/*                                TYPE DEFINITIONS                            */
/* -------------------------------------------------------------------------- */

interface DataContextType {
  rawDataset: Dataset | null;
  dataset: Dataset | null;
  dataSummary: DataSummary | null;
  aiInsights: AIInsight[];
  isLoading: boolean;

  // State setters
  setDataset: (dataset: Dataset | null) => void;
  setRawDataset: (dataset: Dataset | null) => void;
  setDataSummary: (summary: DataSummary | null) => void;
  setAIInsights: (insights: AIInsight[]) => void;
  setIsLoading: (loading: boolean) => void;

  // Custom update helpers
  updateCleanedData: (cleanedData: any[], summary?: DataSummary) => void;
  forceDatasetUpdate: (newData: any[]) => void;

  // Debug helper to force re-renders
  updateCounter: number;
}

/* -------------------------------------------------------------------------- */
/*                              CONTEXT CREATION                              */
/* -------------------------------------------------------------------------- */

const DataContext = createContext<DataContextType | undefined>(undefined);

/**
 * Hook to consume DataContext safely
 */
export const useDataContext = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("❌ useDataContext must be used within a DataProvider");
  }
  return context;
};

/* -------------------------------------------------------------------------- */
/*                             PROVIDER COMPONENT                             */
/* -------------------------------------------------------------------------- */

interface DataProviderProps {
  children: ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  /* ------------------------------ STATE HOOKS ----------------------------- */
  const [rawDataset, setRawDataset] = useState<Dataset | null>(null);

  const [dataset, setDataset] = useState<Dataset | null>(null);

  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);

  const [aiInsights, setAIInsights] = useState<AIInsight[]>([]);

  const [isLoading, setIsLoading] = useState(false);

  const [isInitialUpload, setIsInitialUpload] = useState(true);

  const [updateCounter, setUpdateCounter] = useState(0);

  /* -------------------------------------------------------------------------- */
  /*                       FUNCTION: updateCleanedData                          */
  /* -------------------------------------------------------------------------- */
  const updateCleanedData = (cleanedData: any[], summary?: DataSummary) => {
    if (!dataset || isInitialUpload) {
      console.log("⚠️ Skipping updateCleanedData - dataset missing or still initial upload");
      return;
    }

    console.log("🧹 Updating cleaned dataset");
    console.log("Previous length:", dataset.data.length);
    console.log("New length:", cleanedData.length);

    const updatedDataset = {
      ...dataset,
      data: [...cleanedData],
      updatedAt: new Date()
    };

    setDataset(updatedDataset);
    setUpdateCounter(prev => prev + 1);

    if (summary) {
      setDataSummary(summary);
    }

    // Force extra re-renders just in case
    setTimeout(() => {
      setUpdateCounter(prev => prev + 1);
      if (summary) {
        setDataSummary({ ...summary });
      }

      setTimeout(() => {
        const finalDataset = {
          ...updatedDataset,
          data: [...cleanedData],
          updatedAt: new Date()
        };
        setDataset(finalDataset);
        setUpdateCounter(prev => prev + 1);
      }, 50);
    }, 100);
  };

  /* -------------------------------------------------------------------------- */
  /*                     FUNCTION: forceDatasetUpdate                           */
  /* -------------------------------------------------------------------------- */
  const forceDatasetUpdate = (newData: any[]) => {
    if (!dataset) {
      console.log("⚠️ No dataset to force update");
      return;
    }

    console.log("🔄 Force dataset update called, new length:", newData.length);

    const forcedDataset = {
      ...dataset,
      data: [...newData],
      updatedAt: new Date(),
      forced: true
    };

    setDataset(forcedDataset);
    setUpdateCounter(prev => prev + 1);

    console.log("✅ Force dataset update completed");
  };

  /* -------------------------------------------------------------------------- */
  /*                  WRAPPER: handleSetDataset (for uploads)                   */
  /* -------------------------------------------------------------------------- */
  const handleSetDataset = (newDataset: Dataset | null) => {
    console.log("📂 handleSetDataset called");
    console.log("Has new dataset:", !!newDataset);
    console.log("Is initial upload:", isInitialUpload);
    console.log("New dataset length:", newDataset?.data?.length);

    if (newDataset && isInitialUpload) {
      console.log("🎉 First upload detected, turning off initialUpload flag");
      setIsInitialUpload(false);
    }

    setDataset(newDataset);
  };

  /* -------------------------------------------------------------------------- */
  /*             SIDE EFFECT: auto-generate AI insights on change               */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    const fetchInsights = async () => {
      if (!dataset) {
        setAIInsights([]);
        return;
      }

      setIsLoading(true);

      try {
        console.log("🤖 Generating AI insights...");

        const columns: ColumnInfo[] = analyzeColumns(dataset.data);

        const insights = await generateAIInsights(dataset.data, columns);

        setAIInsights(insights);

        console.log("✅ AI insights generated:", insights.length);
      } catch (error) {
        console.error("❌ Error generating AI insights:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInsights();
  }, [dataset]);

  /* -------------------------------------------------------------------------- */
  /*                            DEBUGGING LOGS                                  */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    console.log("📊 Dataset changed in context");
    console.log("Has data:", !!dataset);
    console.log("Length:", dataset?.data?.length);
    console.log("Columns:", dataset?.columns?.length);
  }, [dataset]);

  useEffect(() => {
    console.log("🟡 isInitialUpload changed:", isInitialUpload);
  }, [isInitialUpload]);

  useEffect(() => {
    console.log("🔄 Update counter changed:", updateCounter);
  }, [updateCounter]);

  /* -------------------------------------------------------------------------- */
  /*                             CONTEXT PROVIDER                               */
  /* -------------------------------------------------------------------------- */
  return (
    <DataContext.Provider
      value={{
        rawDataset,
        dataset,
        dataSummary,
        aiInsights,
        isLoading,

        // Setters
        setDataset: handleSetDataset,
        setRawDataset,
        setDataSummary,
        setAIInsights,
        setIsLoading,

        // Helpers
        updateCleanedData,
        forceDatasetUpdate,

        updateCounter
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
