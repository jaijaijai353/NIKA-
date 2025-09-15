@@ .. @@
import Overview from './components/Overview';
import DataCleaning from './components/DataCleaning';
import Analytics from './components/Analytics';
import Visualizations from './components/Visualizations';
import AIInsights from './components/AIInsights';
import UnifiedVisualization from './components/UnifiedVisualization';
// QnA import removed
@@ .. @@
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview />;
      case 'cleaning':
        return <DataCleaning />;
      case 'analytics':
        return <Analytics />;
      case 'visualizations':
        return <Visualizations />;
      case 'unified':
        return <UnifiedVisualization />;
      case 'insights':
        return <AIInsights />;
      // QnA case removed
      default:
        return <Overview />;
    }
  };
@@ .. @@