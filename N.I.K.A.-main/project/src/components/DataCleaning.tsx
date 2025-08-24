import React, { useState, useEffect, useCallback, useMemo, useRef, useReducer, Reducer, KeyboardEvent } from "react";
import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import { 
    Loader2, CheckCircle, AlertTriangle, Trash2, Rows, Hash, Type, Puzzle, Wand2, 
    Undo, Redo, Pilcrow, Replace, History, Upload, Download, Save, FolderOpen,
    Lightbulb, BarChart2, Search, X
} from "lucide-react";
import { useDataContext } from "../context/DataContext";

// =============================================================
// --- 1. TYPES ---
// =============================================================
type ColumnType = "Text" | "Number" | "Integer" | "Float" | "Date" | "Boolean";
type DataRow = Record<string, any> & { __stableKey: string };
interface ColumnConfig { name: string; type: ColumnType; }
interface Suggestion { id: string; title: string; description: string; action: () => void; }
interface Command { id: string; name: string; section: string; icon: React.ReactNode; action: () => void; }
interface SavedSession { dataState: DataState; operations: Operation[]; columnConfigs: ColumnConfig[]; }
interface Operation { id: number; text: string; }
type DataState = { past: DataRow[][]; present: DataRow[]; future: DataRow[][]; };
type DataAction = { type: 'SET_DATA'; payload: DataRow[] } | { type: 'UNDO' } | { type: 'REDO' } | { type: 'RESET'; payload: DataRow[] } | { type: 'LOAD_STATE', payload: DataState };


// =============================================================
// --- 2. SIMULATED EXTERNAL MODULES ---
// =============================================================
const fileHandler = {
  parseCSV: (fileContent: string): Promise<{ data: any[], columns: { name: string }[] }> => new Promise(resolve => {
    const rows = fileContent.split('\n').filter(Boolean);
    const headers = rows[0].split(',').map(h => h.trim());
    const data = rows.slice(1).map(rowStr => {
      const values = rowStr.split(',');
      return headers.reduce((obj, header, index) => ({ ...obj, [header]: values[index]?.trim() }), {});
    });
    const columns = headers.map(name => ({ name }));
    setTimeout(() => resolve({ data, columns }), 750);
  }),
  exportToCSV: (data: DataRow[], columns: string[]): void => {
    if (data.length === 0) return;
    const header = columns.join(',') + '\n';
    const body = data.map(row => columns.map(col => `"${String(row[col]).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `cleaned_data_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

const aiSuggestionEngine = {
  getSuggestions: (data: DataRow[], configs: ColumnConfig[], actions: any): Promise<Suggestion[]> => new Promise(resolve => {
    const suggestions: Suggestion[] = [];
    const textCols = configs.filter(c => c.type === 'Text').map(c => c.name);
    if (data.slice(0, 50).some(row => textCols.some(col => typeof row[col] === 'string' && row[col].trim() !== row[col]))) {
        suggestions.push({
            id: 'trim-whitespace', title: "Trim Whitespace",
            description: "Leading or trailing spaces detected. Trimming improves consistency.",
            action: actions.applyTrimWhitespace
        });
    }
    setTimeout(() => resolve(suggestions), 1200);
  })
};


// =============================================================
// --- 3. STATE MANAGEMENT & CORE HOOK ---
// =============================================================
const dataReducer: Reducer<DataState, DataAction> = (state, action) => {
    const { past, present, future } = state;
    switch (action.type) {
      case 'SET_DATA': if (JSON.stringify(present) === JSON.stringify(action.payload)) return state; return { past: [...past, present], present: action.payload, future: [] };
      case 'UNDO': if (past.length === 0) return state; return { past: past.slice(0, past.length - 1), present: past[past.length - 1], future: [present, ...future] };
      case 'REDO': if (future.length === 0) return state; return { past: [...past, present], present: future[0], future: future.slice(1) };
      case 'RESET': return { past: [], present: action.payload, future: [] };
      case 'LOAD_STATE': return action.payload;
      default: return state;
    }
};

const useDataCleaner = () => {
  const { setDataset: setGlobalDataset } = useDataContext();
  const workerRef = useRef<Worker>();
  
  const [dataState, dispatch] = useReducer(dataReducer, { past: [], present: [], future: [] });
  const { present: cleanedData } = dataState;

  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([]);
  const [isLoading, setIsLoading] = useState<{ [key: string]: boolean }>({});
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: "ok" | "warn" | "err"; }[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  
  // Initialize Worker
  useEffect(() => {
    // NOTE: Worker code (from previous responses) should be in `public/dataCleaner.worker.ts`
    // workerRef.current = new Worker('/dataCleaner.worker.ts');
    // return () => workerRef.current?.terminate();
  }, []);

  const showToast = useCallback((text: string, tone: "ok" | "warn" | "err") => {
    const id = Date.now();
    setToasts(t => [...t.slice(-4), { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(toast => toast.id !== id)), 5000);
  }, []);

  const addOperation = useCallback((text: string) => { setOperations(ops => [{id: Date.now(), text}, ...ops]); }, []);

  const runCleaningTask = async (taskName: string, config: any, loadingKey: string, opText: string) => {
    // Simulating worker task without actual worker for this example
    setIsLoading(p => ({ ...p, [loadingKey]: true, all: true }));
    return new Promise(resolve => setTimeout(resolve, 1000)).then(() => {
        // In a real implementation, you would post to the worker here
        // const result = await postTask(taskName, { data: cleanedData, ...config });
        const result = cleanedData; // Placeholder
        const changeCount = cleanedData.length - result.length;
        dispatch({ type: 'SET_DATA', payload: result });
        const fullOpText = changeCount > 0 ? `${opText} (${changeCount} rows removed)` : opText;
        showToast(fullOpText, "ok");
        addOperation(fullOpText);
    }).catch((error: any) => {
        showToast(`Failed: ${error.message}`, "err");
    }).finally(() => {
        setIsLoading(p => ({ ...p, [loadingKey]: false, all: false }));
    });
  };
  
  const applyTrimWhitespace = () => runCleaningTask('trimWhitespace', {}, 'suggestions', 'Trimmed whitespace');
  const removeDuplicates = () => runCleaningTask('removeDuplicates', {}, 'main', 'Removed duplicates');

  const handleImport = async (file: File) => {
    setIsLoading({ file: true, all: true });
    try {
        const content = await file.text();
        const { data, columns } = await fileHandler.parseCSV(content);
        const dataWithKeys: DataRow[] = data.map((row, i) => ({ ...row, __stableKey: `${i}-${JSON.stringify(row)}` }));
        dispatch({ type: 'RESET', payload: dataWithKeys });
        setColumnConfigs(columns.map(c => ({ name: c.name, type: "Text" as ColumnType })));
        setOperations([]);
        showToast("Successfully imported data", "ok");
    } catch(e: any) {
        showToast(`Failed to import data: ${e.message}`, "err");
    } finally {
        setIsLoading({ file: false, all: false });
    }
  };
  
  const handleExport = () => { handleExport && fileHandler.exportToCSV(cleanedData, columnConfigs.map(c => c.name)); showToast("Export initiated", "ok"); };
  const saveSession = () => { const session: SavedSession = { dataState, operations, columnConfigs }; localStorage.setItem('dataCleanerSession', JSON.stringify(session)); showToast("Session saved!", "ok"); };
  const loadSession = () => {
    const saved = localStorage.getItem('dataCleanerSession');
    if (saved) {
        const session: SavedSession = JSON.parse(saved);
        dispatch({ type: 'LOAD_STATE', payload: session.dataState });
        setOperations(session.operations);
        setColumnConfigs(session.columnConfigs);
        showToast("Session loaded!", "ok");
    } else { showToast("No saved session found", "warn"); }
  };
  
  useEffect(() => {
      setGlobalDataset(cleanedData);
      if (cleanedData.length > 0) {
          setIsLoading(p => ({...p, suggestions: true}));
          aiSuggestionEngine.getSuggestions(cleanedData, columnConfigs, { applyTrimWhitespace }).then(setSuggestions).finally(()=>setIsLoading(p=>({...p, suggestions: false})));
      }
  }, [cleanedData, columnConfigs, setGlobalDataset]);

  const commands: Command[] = useMemo(() => [
    { id: 'remove-dupes', name: 'Remove Duplicates', section: 'Cleaning', icon: <Puzzle size={16}/>, action: removeDuplicates },
    { id: 'trim-whitespace', name: 'Trim Whitespace', section: 'Cleaning', icon: <Pilcrow size={16}/>, action: applyTrimWhitespace },
    { id: 'export-csv', name: 'Export to CSV', section: 'Workflow', icon: <Download size={16}/>, action: handleExport },
    { id: 'save-session', name: 'Save Session', section: 'Workflow', icon: <Save size={16}/>, action: saveSession },
    { id: 'load-session', name: 'Load Session', section: 'Workflow', icon: <FolderOpen size={16}/>, action: loadSession },
  ], [removeDuplicates, applyTrimWhitespace, handleExport, saveSession, loadSession]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(p => !p); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  
  const undo = () => { if (dataState.past.length > 0) dispatch({ type: 'UNDO' }) };
  const redo = () => { if (dataState.future.length > 0) dispatch({ type: 'REDO' }) };
  
  return {
    cleanedData, columnConfigs, isLoading, toasts, operations, suggestions, commands, isPaletteOpen, setPaletteOpen,
    handleImport, handleExport, saveSession, loadSession, undo, redo,
    canUndo: dataState.past.length > 0, canRedo: dataState.future.length > 0
  };
};

// =============================================================
// --- 4. UI SUB-COMPONENTS ---
// =============================================================
const ShimmeringLoader = () => (
    <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-slate-700/50 -translate-x-full animate-[shimmer_1.5s_infinite]" style={{background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)'}}/>
    </div>
);

const Panel: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; isLoading?: boolean }> = ({ title, icon, children, isLoading }) => (
    <motion.div layout="position" className="bg-slate-800/50 border border-sky-900/50 rounded-xl shadow-lg backdrop-blur-xl relative overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-sky-900/50">
            <div className="text-sky-400">{icon}</div>
            <h3 className="text-lg font-bold text-slate-100">{title}</h3>
        </div>
        <div className="p-4 relative min-h-[5rem]">
             <AnimatePresence>
                {isLoading && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><ShimmeringLoader /></motion.div>}
            </AnimatePresence>
            {children}
        </div>
    </motion.div>
);

const CommandPalette: React.FC<{isOpen: boolean; setIsOpen: (b: boolean) => void; commands: Command[]}> = ({isOpen, setIsOpen, commands}) => {
    const [search, setSearch] = useState('');
    const filteredCommands = useMemo(() => commands.filter(c => c.name.toLowerCase().includes(search.toLowerCase())), [commands, search]);
    useEffect(() => { if(isOpen) setSearch(''); }, [isOpen]);
    const execute = (command: Command) => { command.action(); setIsOpen(false); };

    return (
        <AnimatePresence>
        {isOpen && (
            <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} onClick={() => setIsOpen(false)} className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-24 backdrop-blur-sm">
                <motion.div initial={{scale:0.9, y:-20}} animate={{scale:1, y:0}} exit={{scale:0.9, y:-20}} transition={{type: 'spring', stiffness: 300, damping: 25}} onClick={e => e.stopPropagation()} className="w-full max-w-2xl bg-slate-800/80 border border-sky-900/50 rounded-lg shadow-2xl">
                    <div className="p-4 border-b border-sky-900/50 flex items-center gap-3">
                        <Search size={18} className="text-sky-400"/>
                        <input type="text" autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Type a command or search..." className="w-full text-lg bg-transparent text-white placeholder-slate-500 outline-none"/>
                        <div className="text-xs text-slate-500 border border-slate-600 rounded px-1.5 py-0.5">ESC</div>
                    </div>
                    <motion.ul layout className="max-h-[28rem] overflow-y-auto p-2">
                        <AnimatePresence>
                        {filteredCommands.map((cmd, i) => (
                            <motion.li 
                                key={cmd.id} 
                                initial={{opacity:0, y:10}} 
                                animate={{opacity:1, y:0, transition: {delay: i * 0.03}}} 
                                exit={{opacity:0, x:-10}}
                                onClick={() => execute(cmd)} 
                                className="p-3 flex items-center gap-4 text-slate-200 hover:bg-sky-900/50 rounded-md cursor-pointer"
                            >
                                <div className="text-sky-400">{cmd.icon}</div>
                                <span className="font-medium">{cmd.name}</span>
                                <span className="ml-auto text-xs font-mono text-slate-500 bg-slate-700/50 px-2 py-1 rounded">{cmd.section}</span>
                            </motion.li>
                        ))}
                        </AnimatePresence>
                        {filteredCommands.length === 0 && <li className="p-10 text-center text-slate-500">No commands found.</li>}
                    </motion.ul>
                </motion.div>
            </motion.div>
        )}
        </AnimatePresence>
    );
};

const SuggestionsPanel: React.FC<{suggestions: Suggestion[], isLoading: boolean}> = ({ suggestions, isLoading }) => (
    <Panel title="AI Suggestions" icon={<Lightbulb size={20} />} isLoading={isLoading}>
        <div className="space-y-3">
        {suggestions.length > 0 ? suggestions.map(s => (
            <motion.div key={s.id} initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} className="p-3 bg-slate-700/50 border border-sky-900/30 rounded-lg">
                <h4 className="font-semibold text-sky-300">{s.title}</h4>
                <p className="text-sm text-slate-400 my-1">{s.description}</p>
                <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={s.action} className="mt-2 text-sm font-bold text-white bg-sky-600 px-3 py-1 rounded-md shadow-lg shadow-sky-900/50">Apply Fix</motion.button>
            </div>
        )) : <p className="text-sm text-center text-slate-500 py-4">No suggestions at the moment.</p>}
        </div>
    </Panel>
);

const ChartPanel: React.FC<{data: DataRow[], columns: string[]}> = ({data, columns}) => {
    const [xCol, setXCol] = useState<string | undefined>(columns.find(c=>!isNaN(parseFloat(String(data[0]?.[c])))) || columns[0]);
    return (
        <Panel title="Data Visualization" icon={<BarChart2 size={20}/>}>
            <div className="flex gap-2 items-center">
                <span className="text-sm text-slate-400">Analyze column:</span>
                <select value={xCol} onChange={e => setXCol(e.target.value)} className="bg-slate-700 text-sm p-2 rounded-lg border border-sky-900/50 w-full focus:ring-2 focus:ring-sky-500 focus:outline-none">
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            <div className="mt-4 p-4 bg-slate-900/50 rounded-lg h-full">
                <div className="flex items-center justify-center h-48 border-2 border-dashed border-slate-700 rounded-md mt-2 relative overflow-hidden">
                    <svg width="100%" height="100%" className="absolute inset-0">
                        <motion.path d="M 0 80 C 40 10, 60 10, 100 80 S 140 150, 180 80 S 220 10, 260 80 S 300 150, 340 80 S 380 10, 420 80" stroke="rgba(56, 189, 248, 0.4)" fill="none" strokeWidth="2"
                            initial={{pathLength: 0}} animate={{pathLength: 1}} transition={{duration: 1, ease:"easeInOut"}}/>
                    </svg>
                     <span className="text-slate-500 z-10">[ Interactive chart for <strong>{xCol}</strong> would render here ]</span>
                </div>
            </div>
        </Panel>
    );
};

// =============================================================
// --- 5. MAIN COMPONENT ---
// =============================================================
const DataCleaning: React.FC = () => {
    const hook = useDataCleaner();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const columnNames = useMemo(() => hook.columnConfigs.map(c => c.name), [hook.columnConfigs]);

    return (
        <div className="p-2 sm:p-4 bg-slate-900 text-white min-h-screen bg-grid-sky-900/[0.05]">
            <CommandPalette isOpen={hook.isPaletteOpen} setIsOpen={hook.setPaletteOpen} commands={hook.commands}/>
            
            <header className="flex flex-wrap justify-between items-center mb-6 p-3 bg-slate-800/70 rounded-xl border border-sky-900/50 backdrop-blur-xl sticky top-4 z-40">
                <h1 className="text-2xl font-bold text-white">Data Workbench</h1>
                <div className="flex items-center gap-2 flex-wrap">
                    <input type="file" ref={fileInputRef} onChange={e => e.target.files && hook.handleImport(e.target.files[0])} className="hidden" accept=".csv"/>
                    <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg font-semibold text-sm shadow-lg shadow-sky-900/50"><Upload size={16}/> Import CSV</motion.button>
                    <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={hook.handleExport} disabled={hook.cleanedData.length === 0} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-sm disabled:opacity-50"><Download size={16}/> Export</motion.button>
                    <div className="h-6 w-px bg-slate-600 mx-1"></div>
                    <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={hook.saveSession} disabled={hook.cleanedData.length === 0} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-sm disabled:opacity-50"><Save size={16}/> Save</motion.button>
                    <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={hook.loadSession} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-sm"><FolderOpen size={16}/> Load</motion.button>
                    <div className="h-6 w-px bg-slate-600 mx-1"></div>
                    <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} onClick={hook.undo} disabled={!hook.canUndo} className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 disabled:opacity-50"><Undo size={18}/></motion.button>
                    <motion.button whileHover={{scale:1.1}} whileTap={{scale:0.9}} onClick={hook.redo} disabled={!hook.canRedo} className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 disabled:opacity-50"><Redo size={18}/></motion.button>
                </div>
            </header>
            
            <AnimatePresence>
            {hook.isLoading.all && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-sky-400"/></motion.div>}
            </AnimatePresence>
            
            <main>
                {hook.cleanedData.length === 0 ? (
                    <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="flex flex-col items-center justify-center h-96 text-slate-400 bg-slate-800/30 rounded-lg text-center border border-dashed border-slate-700">
                        <Puzzle size={48} className="mb-4 text-slate-600" />
                        <h2 className="text-xl font-semibold text-slate-200">Workspace is Empty</h2>
                        <p className="mt-2 max-w-md">Import a CSV file to begin cleaning, or load a previously saved session to continue your work.</p>
                         <p className="mt-4 text-xs text-slate-500">You can also press <kbd className="font-sans border border-slate-600 rounded px-1.5 py-0.5">Ctrl</kbd> + <kbd className="font-sans border border-slate-600 rounded px-1.5 py-0.5">K</kbd> to open the command palette.</p>
                    </motion.div>
                ) : (
                    <motion.div initial={{opacity:0}} animate={{opacity:1, transition:{delay:0.2}}} className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                        <div className="xl:col-span-2 space-y-6">
                            <SuggestionsPanel suggestions={hook.suggestions} isLoading={hook.isLoading.suggestions} />
                            <ChartPanel data={hook.cleanedData} columns={columnNames} />
                        </div>
                        <div className="xl:col-span-3 space-y-6">
                             {/* Other main cleaning panels would go here */}
                             <div className="h-full min-h-[40rem] bg-slate-800/30 rounded-xl p-4 border border-dashed border-slate-700 flex items-center justify-center text-slate-500">Main Cleaning Panels (Text, Duplicates, etc.) would reside here.</div>
                        </div>
                    </motion.div>
                )}
            </main>
        </div>
    );
};

export default DataCleaning;
