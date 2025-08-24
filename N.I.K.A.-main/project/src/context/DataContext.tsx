import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Dataset, DataSummary, AIInsight, ColumnInfo } from "../types";
import { generateAIInsights, analyzeColumns } from "../utils/dataProcessor";

interface DataContextType {
  rawDataset: Dataset | null;
  dataset: Dataset | null;
  dataSummary: DataSummary | null;
  aiInsights: AIInsight[];
  isLoading: boolean;
  setDataset: (dataset: Dataset | null) => void;
  setRawDataset: (dataset: Dataset | null) => void;
  setDataSummary: (summary: DataSummary | null) => void;
  setAIInsights: (insights: AIInsight[]) => void;
  setIsLoading: (loading: boolean) => void;
  updateCleanedData: (cleanedData: any[], summary?: DataSummary) => void;
  forceDatasetUpdate: (newData: any[]) => void; // Add force update function
  updateCounter: number; // Add update counter to force re-renders
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useDataContext = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useDataContext must be used within a DataProvider");
  }
  return context;
};

interface DataProviderProps {
  children: ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const [rawDataset, setRawDataset] = useState<Dataset | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [aiInsights, setAIInsights] = useState<AIInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialUpload, setIsInitialUpload] = useState(true);
  const [updateCounter, setUpdateCounter] = useState(0); // Force update counter

  // Function to update cleaned data and ensure all components get updated
  const updateCleanedData = (cleanedData: any[], summary?: DataSummary) => {
    if (!dataset || isInitialUpload) {
      console.log("Skipping updateCleanedData - no dataset or initial upload");
      return;
    }
    
    console.log("Updating cleaned data:", { cleanedDataLength: cleanedData.length, summary });
    console.log("Previous dataset data length:", dataset.data.length);
    
    // Create new dataset with cleaned data - ensure it's a completely new object
    const updatedDataset = {
      ...dataset,
      data: [...cleanedData], // Create new array reference
      updatedAt: new Date() // Add timestamp to force object change
    };
    
    console.log("New dataset object created:", updatedDataset !== dataset);
    console.log("New data array created:", updatedDataset.data !== dataset.data);
    
    // Update the main dataset (this will trigger re-renders in all components)
    setDataset(updatedDataset);
    
    // Force a re-render by incrementing the counter
    setUpdateCounter(prev => prev + 1);
    
    // Update summary if provided
    if (summary) {
      setDataSummary(summary);
    }
    
    console.log("Dataset updated, new length:", updatedDataset.data.length);
    console.log("Dataset object reference changed:", dataset !== updatedDataset);
    console.log("Update counter incremented to force re-render");
    
    // Force immediate re-render of all components
    setTimeout(() => {
      console.log("Forcing additional re-render...");
      setUpdateCounter(prev => prev + 1);
      
      // Also force a summary update to trigger re-renders
      if (summary) {
        setDataSummary({...summary});
      }
      
      // Force one more update to ensure all components get the new data
      setTimeout(() => {
        console.log("Final force update...");
        setUpdateCounter(prev => prev + 1);
        
        // Force one final dataset update to ensure all components get the new data
        setTimeout(() => {
          console.log("Ultimate force update...");
          const finalDataset = {
            ...updatedDataset,
            data: [...cleanedData],
            updatedAt: new Date()
          };
          setDataset(finalDataset);
          setUpdateCounter(prev => prev + 1);
        }, 50);
      }, 50);
    }, 100);
  };

  // Direct function to force dataset update (for debugging)
  const forceDatasetUpdate = (newData: any[]) => {
    if (!dataset) return;
    
    console.log("Force dataset update called with data length:", newData.length);
    
    const forcedDataset = {
      ...dataset,
      data: [...newData],
      updatedAt: new Date(),
      forced: true
    };
    
    setDataset(forcedDataset);
    setUpdateCounter(prev => prev + 1);
    
    console.log("Force dataset update completed");
  };

  // Wrapper for setDataset that handles initial upload flag
  const handleSetDataset = (newDataset: Dataset | null) => {
    console.log("handleSetDataset called:", { 
      hasNewDataset: !!newDataset, 
      isInitialUpload, 
      newDatasetLength: newDataset?.data?.length 
    });
    
    if (newDataset && isInitialUpload) {
      console.log("Initial upload detected, setting isInitialUpload to false");
      setIsInitialUpload(false);
    }
    setDataset(newDataset);
  };

  // 🔥 Auto-generate insights whenever dataset (cleaned/active) changes
  useEffect(() => {
    const fetchInsights = async () => {
      if (!dataset) {
        setAIInsights([]);
        return;
      }

      setIsLoading(true);
      try {
        // Step 1: Analyze columns from dataset.data
        const columns: ColumnInfo[] = analyzeColumns(dataset.data);

        // Step 2: Generate AI insights using dataset.data + column info
        const insights = await generateAIInsights(dataset.data, columns);

        // Step 3: Update state
        setAIInsights(insights);
      } catch (error) {
        console.error("Error generating AI insights:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInsights();
  }, [dataset]);

  // Debug: Log when dataset changes
  useEffect(() => {
    console.log("Dataset changed in context:", { 
      hasData: !!dataset, 
      dataLength: dataset?.data?.length,
      columns: dataset?.columns?.length 
    });
  }, [dataset]);

  // Debug: Log when isInitialUpload changes
  useEffect(() => {
    console.log("isInitialUpload changed:", isInitialUpload);
  }, [isInitialUpload]);

  // Debug: Log when update counter changes
  useEffect(() => {
    console.log("Update counter changed:", updateCounter);
  }, [updateCounter]);

  return (
    <DataContext.Provider
      value={{
        rawDataset,
        dataset,
        dataSummary,
        aiInsights,
        isLoading,
        setDataset: handleSetDataset,
        setRawDataset,
        setDataSummary,
        setAIInsights,
        setIsLoading,
        updateCleanedData,
        forceDatasetUpdate,
        updateCounter,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
