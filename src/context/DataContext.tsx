@@ .. @@
 import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
 import { Dataset, DataSummary, AIInsight, ColumnInfo } from "../types";
 import { generateAIInsights, analyzeColumns } from "../utils/dataProcessor";

+// Backend API base URL
+const API_BASE = 'http://localhost:5000';
+
 interface DataContextType {
   rawDataset: Dataset | null;
   dataset: Dataset | null;
@@ .. @@
   updateCleanedData: (cleanedData: any[], summary?: DataSummary) => void;
   forceDatasetUpdate: (newData: any[]) => void; // Add force update function
   updateCounter: number; // Add update counter to force re-renders
+  // Backend API helpers
+  fetchSummary: (id: string) => Promise<any>;
+  fetchPreview: (id: string, limit?: number) => Promise<any>;
+  fetchDatasets: () => Promise<any[]>;
 }

 const DataContext = createContext<DataContextType | undefined>(undefined);
@@ .. @@
   const [isInitialUpload, setIsInitialUpload] = useState(true);
   const [updateCounter, setUpdateCounter] = useState(0); // Force update counter

+  // Backend API helper functions
+  const fetchSummary = async (id: string) => {
+    try {
+      const response = await fetch(`${API_BASE}/summary/${id}`);
+      if (!response.ok) {
+        throw new Error('Failed to fetch summary');
+      }
+      return await response.json();
+    } catch (error) {
+      console.error('Error fetching summary:', error);
+      throw error;
+    }
+  };
+
+  const fetchPreview = async (id: string, limit: number = 500) => {
+    try {
+      const response = await fetch(`${API_BASE}/preview/${id}?limit=${limit}`);
+      if (!response.ok) {
+        throw new Error('Failed to fetch preview');
+      }
+      return await response.json();
+    } catch (error) {
+      console.error('Error fetching preview:', error);
+      throw error;
+    }
+  };
+
+  const fetchDatasets = async () => {
+    try {
+      const response = await fetch(`${API_BASE}/datasets`);
+      if (!response.ok) {
+        throw new Error('Failed to fetch datasets');
+      }
+      return await response.json();
+    } catch (error) {
+      console.error('Error fetching datasets:', error);
+      throw error;
+    }
+  };
+
   // Function to update cleaned data and ensure all components get updated
   const updateCleanedData = (cleanedData: any[], summary?: DataSummary) => {
@@ .. @@
         updateCleanedData,
         forceDatasetUpdate,
         updateCounter,
+        fetchSummary,
+        fetchPreview,
+        fetchDatasets,
       }}
     >
       {children}