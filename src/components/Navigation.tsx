@@ .. @@
import React from 'react';
import { motion } from 'framer-motion';
import { 
  Home, 
  RectangleVertical as CleaningServices, 
  FlipVertical as Analytics, 
  BarChart3, 
  Brain, 
  Database,
  Maximize2
} from 'lucide-react';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'cleaning', label: 'Data Cleaning', icon: CleaningServices },
    { id: 'analytics', label: 'Analytics', icon: Analytics },
    { id: 'visualizations', label: 'Visualizations', icon: BarChart3 },
    { id: 'unified', label: 'Unified View', icon: Maximize2 },
    { id: 'insights', label: 'AI Insights', icon: Brain },
    // Q&A tab removed
  ];
@@ .. @@