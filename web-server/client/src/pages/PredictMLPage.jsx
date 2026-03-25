import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import apiClient from '../config/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlert } from '../context/AlertContext';
import { API_ENDPOINTS } from '../config/api';
import Plot from 'react-plotly.js';
import { jwtDecode } from 'jwt-decode';
import { clearUserData } from '../config/auth';

const FileItem = React.memo(({ file, isSelected, onToggle }) => {
    const fileName = file.name.split('/').pop();
    const parts = fileName.split('_');
    const point = parts.find(p => p.startsWith('P'))?.replace('P', '') || '?';
    const dateStr = parts.find(p => /^\d{8}$/.test(p)) || '';
    const timeStr = parts.find(p => /^\d{6}$/.test(p)) || '';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.01, translateY: -2 }}
            className={`flex items-center justify-between p-4 rounded-[1.5rem] border transition-all cursor-default group ${
                isSelected 
                    ? 'bg-white border-primary shadow-[0_10px_30px_-10px_rgba(30,58,138,0.2)] ring-4 ring-primary/5' 
                    : 'bg-slate-50/50 border-slate-100/80 hover:bg-white hover:border-slate-200 hover:shadow-lg'
            }`}
        >
            <div className="flex items-center gap-4 min-w-0">
                <div 
                    onClick={(e) => onToggle(file.name, e)}
                    className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all cursor-pointer ${
                    isSelected ? 'bg-primary text-secondary shadow-lg rotate-12 scale-110' : 'bg-white border border-slate-200 text-slate-400 hover:border-primary/30 hover:text-primary'
                }`}>
                    {isSelected ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <span className="text-[10px] font-black tracking-tighter">PT{point}</span>
                    )}
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700 truncate group-hover:text-primary transition-colors">{fileName}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded">
                            {dateStr ? `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}` : 'UNKNOWN'}
                        </span>
                        <span className="text-[9px] text-slate-300 font-bold">•</span>
                        <span className="text-[9px] text-slate-400 font-bold">{timeStr ? `${timeStr.slice(0,2)}:${timeStr.slice(2,4)}` : ''}</span>
                    </div>
                </div>
            </div>
            <div className={`text-[10px] font-black px-3 py-1.5 rounded-xl transition-all ${
                isSelected ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400 group-hover:bg-primary/5 group-hover:text-primary'
            }`}>
                {(file.size / 1024).toFixed(0)} KB
            </div>
        </motion.div>
    );
});

function PredictMLPage() {
    const navigate = useNavigate();
    const Swal = useAlert();
    const [kks, setKks] = useState('');
    const [machineName, setMachineName] = useState('');
    const [measurementType, setMeasurementType] = useState('vibration');
    const [selectedPoint, setSelectedPoint] = useState('P1');
    const [files, setFiles] = useState([]);
    const [availablePoints, setAvailablePoints] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    
    // Model Selection
    const [rawModels, setRawModels] = useState([]);
    const [modelGroups, setModelGroups] = useState([]);
    const [selectedGroupKey, setSelectedGroupKey] = useState('');
    const [selectedModelTypes, setSelectedModelTypes] = useState([]); // ['ae', 'vae', 'pca']
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    const [isPredicting, setIsPredicting] = useState(false);
    const [predictionLogs, setPredictionLogs] = useState([]);
    const [allSelectedPsdData, setAllSelectedPsdData] = useState({});
    const [isFetchingPsd, setIsFetchingPsd] = useState(false);
    
    const terminalEndRef = useRef(null);
    const [searchResults, setSearchResults] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);
    const [viewingResult, setViewingResult] = useState(null); // { filename, predictions }
    const [activeResultTab, setActiveResultTab] = useState('ae');
    const [predictionResults, setPredictionResults] = useState([]); 
    const searchRef = useRef(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) { clearUserData(); navigate('/login'); return; }
        try {
            const decoded = jwtDecode(token);
            if (decoded.exp < Date.now() / 1000) { clearUserData(); navigate('/login'); }
        } catch { clearUserData(); navigate('/login'); }
    }, [navigate]);

    useEffect(() => {
        if (terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [predictionLogs]);

    // Clear selections and plot when filter changes
    useEffect(() => {
        setSelectedFiles([]);
        setAllSelectedPsdData({});
    }, [measurementType, selectedPoint]);

    useEffect(() => {
        const query = kks.trim();
        if (!query || query.length < 2) {
            setSearchResults([]);
            setShowSuggestions(false);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const response = await apiClient.get(API_ENDPOINTS.MACHINES.SEARCH(query), {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                setSearchResults(response.data);
                setShowSuggestions(response.data.length > 0);
            } catch (err) {
                console.error('Search error:', err);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [kks]);

    const handleFetchFiles = async (machineKks) => {
        setIsLoadingFiles(true);
        setFiles([]);
        setSelectedFiles([]);
        try {
            const response = await apiClient.get(API_ENDPOINTS.ML.GET_TRAINING_FILES(machineKks), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            
            const grouped = {};
            response.data.forEach(file => {
                const parts = file.name.split('/');
                const kksIndex = parts.indexOf(machineKks);
                if (kksIndex !== -1 && parts.length > kksIndex + 3) {
                    const point = parts[kksIndex + 1];
                    const type = parts[kksIndex + 2];
                    const context = parts[kksIndex + 3];
                    
                    if (context === 'rawData') {
                        if (!grouped[point]) grouped[point] = {};
                        if (!grouped[point][type]) grouped[point][type] = {};
                        if (!grouped[point][type][context]) grouped[point][type][context] = [];
                        
                        grouped[point][type][context].push(file);
                    }
                }
            });

            const points = Object.keys(grouped).sort();
            setAvailablePoints(points);
            setFiles(grouped);
            
            // Auto-fetch models for this machine
            fetchModels(machineKks);
        } catch (error) {
            console.error("Error fetching files:", error);
            Swal.fire('Error', 'Failed to fetch files from MinIO', 'error');
        } finally {
            setIsLoadingFiles(false);
        }
    };

    // Update model groups when filters or raw models change
    useEffect(() => {
        if (rawModels.length === 0) {
            setModelGroups([]);
            setSelectedGroupKey('');
            return;
        }

        // Group by project_name and version
        const groups = {};
        rawModels.forEach(m => {
            // Filter by Point and Measurement Type
            // Database might store point as "1" while frontend uses "P1"
            const mPoint = String(m.measurement_point).replace(/^P/, '');
            const sPoint = String(selectedPoint).replace(/^P/, '');
            const matchesPoint = selectedPoint === 'All' || mPoint === sPoint;
            
            // Case-insensitive measurement type check
            const matchesType = String(m.measurement_type || '').toLowerCase() === (measurementType || 'vibration').toLowerCase();

            if (!matchesPoint || !matchesType) return;

            const key = `${m.project_name}_v${m.version}`;
            if (!groups[key]) {
                groups[key] = {
                    key,
                    project_name: m.project_name,
                    version: m.version,
                    models: []
                };
            }
            groups[key].models.push({
                id: m.id,
                type: (m.method_name || 'unknown').toLowerCase(),
                path: m.model_path,
                parameters: typeof m.parameters === 'string' ? JSON.parse(m.parameters) : (m.parameters || {})
            });
        });

        const groupList = Object.values(groups).sort((a,b) => b.version - a.version);
        setModelGroups(groupList);
        
        // Auto-select first group if current selection is invalid or empty
        if (groupList.length > 0) {
            const currentGroupExists = groupList.some(g => g.key === selectedGroupKey);
            if (!currentGroupExists) {
                setSelectedGroupKey(groupList[0].key);
                setSelectedModelTypes(groupList[0].models.map(m => m.type));
            }
        } else {
            setSelectedGroupKey('');
            setSelectedModelTypes([]);
        }
    }, [rawModels, selectedPoint, measurementType]);

    const fetchModels = async (machineKks) => {
        setIsLoadingModels(true);
        try {
            const response = await apiClient.get(API_ENDPOINTS.ML.GET_MODELS_BY_KKS(machineKks), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setRawModels(response.data || []);
        } catch (error) {
            console.error("Error fetching models:", error);
        } finally {
            setIsLoadingModels(false);
        }
    };

    const handleSelectResult = (machine) => {
        setKks(machine.kks);
        setMachineName(machine.name);
        setMeasurementType(machine.mtype || 'vibration');
        setShowSuggestions(false);
        handleFetchFiles(machine.kks);
    };

    const fetchFilePsd = async (fileName) => {
        if (allSelectedPsdData[fileName]) return;
        setIsFetchingPsd(true);
        try {
            const response = await apiClient.post('/api/ml/v1/psd_preview', {
                bucket: 'scu-data',
                filename: fileName
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setAllSelectedPsdData(prev => ({
                ...prev,
                [fileName]: response.data.psd_pair
            }));
        } catch (error) {
            console.error("Error fetching PSD:", error);
        } finally {
            setIsFetchingPsd(false);
        }
    };

    const toggleFileSelection = (fileName, e) => {
        if (e) e.stopPropagation();
        setSelectedFiles(prev => {
            if (prev.includes(fileName)) {
                setAllSelectedPsdData(curr => {
                    const next = { ...curr };
                    delete next[fileName];
                    return next;
                });
                return prev.filter(f => f !== fileName);
            } else {
                fetchFilePsd(fileName);
                return [...prev, fileName];
            }
        });
    };

    const selectAll = () => {
        const allFiles = [];
        Object.entries(files).forEach(([pt, typeGroups]) => {
            if (selectedPoint !== 'All' && pt !== selectedPoint) return;
            Object.entries(typeGroups).forEach(([type, contextGroups]) => {
                if (type !== measurementType) return;
                Object.values(contextGroups).forEach(cList => {
                    cList.forEach(file => {
                        allFiles.push(file.name);
                        fetchFilePsd(file.name);
                    });
                });
            });
        });
        setSelectedFiles(prev => {
            const next = [...prev];
            allFiles.forEach(f => {
                if (!next.includes(f)) next.push(f);
            });
            return next;
        });
    };

    const deselectAll = () => {
        setSelectedFiles([]);
        setAllSelectedPsdData({});
    };

    const handlePredict = async () => {
        if (selectedFiles.length === 0) {
            Swal.fire('No Files Selected', 'Please select files to predict.', 'warning');
            return;
        }
        if (!selectedGroupKey) {
            Swal.fire('No Model Selected', 'Please select a model group to use for prediction.', 'warning');
            return;
        }

        const group = modelGroups.find(g => g.key === selectedGroupKey);
        if (!group) return;

        const modelsToRun = group.models.filter(m => selectedModelTypes.includes(m.type));
        if (modelsToRun.length === 0) {
            Swal.fire('No Methods Selected', 'Please select at least one method (AE, VAE, or PCA).', 'warning');
            return;
        }

        setIsPredicting(true);
        setShowTerminal(true);
        setPredictionResults([]);
        setPredictionLogs([
            `[SYSTEM] Starting Bulk Prediction Session...`,
            `[SYSTEM] Target Project: ${group.project_name} (v${group.version})`,
            `[SYSTEM] Selected Methods: ${selectedModelTypes.join(', ').toUpperCase()}`,
            `[SYSTEM] Total Samples: ${selectedFiles.length}`,
            `-------------------------------------------`
        ]);

        try {
            const response = await apiClient.post('/api/ml/v1/predict_bulk', {
                bucket: 'scu-data',
                filenames: selectedFiles,
                models: modelsToRun
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });

            if (response.data.status === 'success') {
                const results = response.data.results;
                setPredictionResults(results);
                
                const logs = results.map(res => {
                    const shortName = res.filename.split('/').pop();
                    if (res.predictions) {
                        const methods = Object.keys(res.predictions);
                        const summary = methods.map(m => {
                            const p = res.predictions[m];
                            const emoji = p.detection.includes('Normal') ? '✅' : '🚨';
                            return `${m.toUpperCase()}: ${emoji}`;
                        }).join(' | ');
                        return `[RESULT] ${shortName} -> ${summary}`;
                    } else {
                        return `[ERROR] ${shortName} -> ${res.error || 'Failed'}`;
                    }
                });
                setPredictionLogs(prev => [...prev, ...logs, `-------------------------------------------`, `[SYSTEM] Prediction Complete. Results are available in visual dashboard.`]);
            }
        } catch (error) {
            console.error("Prediction error:", error);
            setPredictionLogs(prev => [...prev, `[ERROR] Simulation failed: ${error.message}`]);
        } finally {
            setIsPredicting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8">
            <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Left Panel: Config & Model */}
                <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="lg:col-span-4 space-y-6"
                >
                    <div className="bg-white rounded-3xl p-6 shadow-xl border border-white">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-black text-slate-900">Predict Session</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="relative" ref={searchRef}>
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Machine KKS</label>
                                <input
                                    type="text"
                                    value={kks}
                                    onChange={(e) => setKks(e.target.value)}
                                    autoComplete="off"
                                    className="w-full px-4 py-4 rounded-2xl bg-slate-50 border border-slate-100 font-bold focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none"
                                    placeholder="Enter KKS"
                                />
                                
                                <AnimatePresence>
                                    {showSuggestions && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute z-50 left-0 right-0 mt-3 bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.1)] border border-white/20 overflow-hidden ring-1 ring-black/5"
                                        >
                                            <div className="max-h-72 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                                {searchResults.map((machine) => (
                                                    <button
                                                        key={machine.kks}
                                                        onClick={() => handleSelectResult(machine)}
                                                        className="w-full text-left px-4 py-3 hover:bg-primary hover:text-white rounded-2xl transition-all flex items-center gap-4 group cursor-pointer"
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                                                            <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="font-black text-sm tracking-tight">{machine.kks}</span>
                                                            <span className="text-[10px] font-bold opacity-70 truncate">{machine.name}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {machineName && (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="p-5 bg-primary/5 backdrop-blur-sm rounded-[2rem] border border-primary/10 shadow-sm"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Source Model</p>
                                            <p className="font-black text-slate-800 text-sm leading-tight">{machineName}</p>
                                        </div>
                                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                                            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.673.337a4 4 0 01-2.574.344l-2.387-.477a2 2 0 00-1.022.547l-2.387 2.387a2 2 0 000 2.828l.172.172a2 2 0 001.414.586h12.828a2 2 0 001.414-.586l.172-.172a2 2 0 000-2.828l-2.387-2.387zM12 9V3M12 3L9 6M12 3l3 3" /></svg>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Measurement Type</label>
                                            <div className="flex p-1 bg-white rounded-2xl border border-slate-100 shadow-inner">
                                                {['vibration', 'sound'].map(type => (
                                                    <button
                                                        key={type}
                                                        onClick={() => setMeasurementType(type)}
                                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                            measurementType === type 
                                                                ? 'bg-primary text-secondary shadow-lg' 
                                                                : 'text-slate-400 hover:text-slate-600'
                                                        }`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Point</label>
                                            <select
                                                value={selectedPoint}
                                                onChange={(e) => setSelectedPoint(e.target.value)}
                                                className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-100 font-bold text-xs focus:ring-4 focus:ring-primary/5 transition-all outline-none appearance-none cursor-pointer pr-10"
                                                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                            >
                                                {availablePoints.map(pt => (
                                                    <option key={pt} value={pt}>Point {pt.replace('P','')}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="h-px bg-primary/10 mx-2" />

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Project Version</label>
                                            <select
                                                value={selectedGroupKey}
                                                onChange={(e) => {
                                                    const key = e.target.value;
                                                    setSelectedGroupKey(key);
                                                    const group = modelGroups.find(g => g.key === key);
                                                    if (group) setSelectedModelTypes(group.models.map(m => m.type));
                                                }}
                                                className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-100 font-bold text-xs focus:ring-4 focus:ring-primary/5 transition-all outline-none appearance-none cursor-pointer pr-10"
                                                disabled={isLoadingModels}
                                                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                            >
                                                {modelGroups.length === 0 ? (
                                                    <option value="">No models available</option>
                                                ) : (
                                                    modelGroups.map(g => (
                                                        <option key={g.key} value={g.key}>
                                                            {g.project_name} (v{g.version})
                                                        </option>
                                                    ))
                                                )}
                                            </select>
                                        </div>

                                        {selectedGroupKey && (
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Verify Methods</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {['ae', 'vae', 'pca'].map(type => {
                                                        const group = modelGroups.find(g => g.key === selectedGroupKey);
                                                        const exists = group?.models.some(m => m.type === type);
                                                        const isSelected = selectedModelTypes.includes(type);
                                                        
                                                        return (
                                                            <button
                                                                key={type}
                                                                disabled={!exists}
                                                                onClick={() => {
                                                                    setSelectedModelTypes(prev => 
                                                                        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                                                                    );
                                                                }}
                                                                className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                                    !exists ? 'opacity-20 cursor-not-allowed border-slate-100 text-slate-300' :
                                                                    isSelected ? 'bg-primary border-primary text-secondary shadow-lg' :
                                                                    'bg-white border-slate-200 text-slate-400 hover:border-primary/30'
                                                                }`}
                                                            >
                                                                {type}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handlePredict}
                        disabled={isPredicting || selectedFiles.length === 0 || !selectedGroupKey || selectedModelTypes.length === 0}
                        className={`w-full py-5 rounded-[2rem] font-black text-lg transition-all shadow-2xl flex items-center justify-center gap-3 relative overflow-hidden group ${
                            isPredicting || selectedFiles.length === 0 || !selectedGroupKey || selectedModelTypes.length === 0
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-primary text-secondary hover:scale-[1.02] active:scale-[0.98] shadow-primary/30 cursor-pointer hover:shadow-primary/50'
                        }`}
                    >
                        {!isPredicting && selectedFiles.length > 0 && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        )}
                        {isPredicting ? (
                            <>
                                <div className="w-6 h-6 border-4 border-secondary/30 border-t-secondary rounded-full animate-spin" />
                                <span className="tracking-tight uppercase">Quantizing Tensors...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <span className="tracking-tighter uppercase">START PREDICT TEST</span>
                            </>
                        )}
                    </button>
                </motion.div>

                {/* Right Panel: File List */}
                <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="lg:col-span-8 space-y-6"
                >
                    <div className="bg-white/70 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white flex flex-col h-[650px]">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Validation <span className="text-secondary-dark">Data</span></h2>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Select samples for testing</p>
                            </div>
                            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                                <button onClick={selectAll} className="px-4 py-1.5 text-[10px] font-black text-primary uppercase tracking-widest hover:bg-white rounded-xl transition-all cursor-pointer">Select Group</button>
                                <div className="w-px h-4 bg-slate-200" />
                                <button onClick={deselectAll} className="px-4 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-white rounded-xl transition-all cursor-pointer">Reset</button>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto pr-3 custom-scrollbar">
                            {isLoadingFiles ? (
                                <div className="h-full flex flex-col items-center justify-center space-y-6">
                                    <div className="w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
                                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Querying Cloud Registry...</p>
                                </div>
                            ) : Object.keys(files).length > 0 ? (
                                <div className="space-y-8">
                                    {Object.entries(files)
                                        .filter(([pt]) => selectedPoint === 'All' || pt === selectedPoint)
                                        .map(([pt, typeGroups]) => {
                                            const filteredTypes = Object.entries(typeGroups).filter(([type]) => type === measurementType);
                                            if (filteredTypes.length === 0) return null;

                                            return (
                                                <div key={pt} className="space-y-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-2xl bg-secondary-dark text-white flex items-center justify-center shadow-lg">
                                                            <span className="text-xs font-black">PT{pt.replace('P','')}</span>
                                                        </div>
                                                        <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
                                                    </div>
                                                    
                                                    {filteredTypes.map(([type, contextGroups]) => (
                                                        <div key={type} className="space-y-4 ml-6">
                                                            {Object.entries(contextGroups).map(([context, fileList]) => (
                                                                <div key={context} className="space-y-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-2 h-2 rounded-full bg-secondary" />
                                                                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">{type} / {context}</span>
                                                                        <span className="text-[10px] font-black text-secondary bg-secondary/5 px-2 py-0.5 rounded-lg">{fileList.length}</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                                                                        {fileList.map(file => (
                                                                            <FileItem 
                                                                                key={file.name} 
                                                                                file={file} 
                                                                                isSelected={selectedFiles.includes(file.name)}
                                                                                onToggle={toggleFileSelection}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                                    <p className="text-slate-400 text-xs font-medium max-w-[240px]">Enter KKS to load test samples.</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between bg-white/50 -mx-8 px-8 -mb-8 rounded-b-[2.5rem]">
                            <div className="flex items-center gap-3 text-sm font-black text-slate-900 uppercase tracking-tighter">
                                {selectedFiles.length} Selection Entries
                            </div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] bg-slate-100 px-3 py-1 rounded-full">
                                Ready
                            </div>
                        </div>
                    </div>

                    {/* Prediction Modal */}
                    <AnimatePresence>
                        {showTerminal && (
                             <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-24"
                            >
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => !isPredicting && setShowTerminal(false)}
                                    className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl"
                                />

                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.98, y: 10 }}
                                    className="bg-[#020617] w-full max-w-4xl h-[70vh] rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col border border-white/10"
                                >
                                    <div className="flex items-center justify-between p-8 relative border-b border-white/5 bg-white/[0.02]">
                                        <div className="flex items-center gap-6">
                                            <div className="flex gap-2 bg-white/5 p-2 rounded-full px-4">
                                                <div className="w-3 h-3 rounded-full bg-secondary shadow-[0_0_10px_rgba(30,58,138,0.3)] animate-pulse" />
                                                <div className="w-3 h-3 rounded-full bg-slate-700" />
                                                <div className="w-3 h-3 rounded-full bg-slate-700" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-1">Engine</span>
                                                <span className="text-sm font-black text-white tracking-widest">BULK_PREDICT_VISUALIZER</span>
                                            </div>
                                        </div>

                                        {!isPredicting && (
                                            <button 
                                                onClick={() => setShowTerminal(false)}
                                                className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all group"
                                            >
                                                <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex-grow overflow-y-auto font-mono text-xs p-10 leading-relaxed space-y-3 custom-scrollbar-dark scroll-smooth">
                                        {predictionLogs.map((log, i) => (
                                            <div key={i} className="flex gap-6 group/line">
                                                <span className="text-slate-800 shrink-0 font-bold opacity-30 w-8 text-right select-none">{i + 1}</span>
                                                <span className={
                                                    log.includes('[ERROR]') ? 'text-rose-400 font-bold' : 
                                                    log.includes('[SYSTEM]') ? 'text-cyan-400 font-black' : 
                                                    log.includes('NORMAL') ? 'text-emerald-400 font-bold' : 
                                                    log.includes('ANOMALY') ? 'text-rose-500 font-black tracking-widest drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]' :
                                                    'text-slate-400'
                                                }>
                                                    {log}
                                                </span>
                                            </div>
                                        ))}
                                        <div ref={terminalEndRef} />
                                    </div>

                                    <div className="p-8 border-t border-white/5 bg-white/[0.01] flex items-center justify-center">
                                        {!isPredicting && (
                                            <button 
                                                onClick={() => setShowTerminal(false)}
                                                className="px-12 py-3 bg-primary text-secondary rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all hover:scale-105"
                                            >
                                                Close Console
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>

            {/* Results Dashboard or File List */}
            <div className="w-full max-w-6xl mt-8">
                <AnimatePresence mode="wait">
                    {predictionResults.length > 0 ? (
                        <motion.div
                            key="results"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="bg-white/90 backdrop-blur-2xl rounded-[3rem] p-10 shadow-2xl border border-white"
                        >
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter"><span className="text-primary italic">Results</span></h2>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Multi-method diagnostic breakdown</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setPredictionResults([])}
                                    className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                                >
                                    Back to selection
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {predictionResults.map((res, idx) => {
                                    const fileName = res.filename.split('/').pop();
                                    const predictions = res.predictions || {};
                                    const methods = Object.keys(predictions);
                                    
                                    return (
                                        <motion.div 
                                            key={idx}
                                            whileHover={{ y: -5 }}
                                            className="bg-slate-50 border border-slate-100 rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:bg-white transition-all group overflow-hidden relative"
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-black text-slate-800 truncate">{fileName}</span>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Vibration Signal</span>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2">
                                                {['ae', 'vae', 'pca'].map(mType => {
                                                    const p = predictions[mType];
                                                    if (!p) return (
                                                        <div key={mType} className="bg-slate-100/50 rounded-xl p-3 flex flex-col items-center opacity-30">
                                                            <span className="text-[8px] font-black uppercase">{mType}</span>
                                                            <span className="text-[8px] mt-1 font-bold">-</span>
                                                        </div>
                                                    );
                                                    const isNormal = p.detection.includes('Normal');
                                                    return (
                                                        <button 
                                                            key={mType}
                                                            onClick={() => {
                                                                setViewingResult(res);
                                                                setActiveResultTab(mType);
                                                            }}
                                                            className={`rounded-xl p-3 flex flex-col items-center border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                                                                isNormal ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
                                                            }`}
                                                        >
                                                            <span className="text-[8px] font-black uppercase">{mType}</span>
                                                            <span className={`text-[8px] mt-1 font-black ${isNormal ? 'text-emerald-500' : 'text-rose-500 animate-pulse'}`}>
                                                                {isNormal ? 'OK' : 'FAIL'}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <button 
                                                onClick={() => {
                                                    setViewingResult(res);
                                                    const firstType = Object.keys(res.predictions || {})[0] || 'ae';
                                                    setActiveResultTab(firstType);
                                                }}
                                                className="w-full mt-4 py-3 bg-white border border-slate-100 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:bg-primary group-hover:text-secondary group-hover:border-primary transition-all cursor-pointer"
                                            >
                                                Visual Analysis
                                            </button>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    ) : selectedFiles.length > 0 ? (
                        <motion.div
                            key="signature"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="bg-white/80 backdrop-blur-2xl rounded-[3rem] p-10 shadow-2xl border border-white"
                        >
                            <h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-8 italic">Pattern <span className="text-primary italic">Signature</span></h2>
                            <div className="w-full h-[400px]">
                                <Plot
                                    data={(() => {
                                        const plotData = [];
                                        const colors = ['#1e3a8a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
                                        Object.entries(allSelectedPsdData).forEach(([fileName, psdPair], idx) => {
                                            const freqs = psdPair[0];
                                            const psdValues = psdPair[1];
                                            const correction = fileName.includes('vibration') ? 19.833 : 93.979;
                                            plotData.push({
                                                x: freqs,
                                                y: psdValues.map(v => 10 * Math.log10(v + 1e-12) + correction),
                                                type: 'scatter',
                                                mode: 'lines',
                                                name: fileName.split('/').pop().slice(-14),
                                                line: { width: 2, color: colors[idx % colors.length] }
                                            });
                                        });
                                        return plotData;
                                    })()}
                                    layout={{
                                        autosize: true,
                                        margin: { l: 60, r: 20, t: 10, b: 60 },
                                        paper_bgcolor: 'transparent',
                                        plot_bgcolor: 'transparent',
                                        xaxis: { gridcolor: '#f1f5f9', title: 'FREQ (Hz)', range: [0, 8000] },
                                        yaxis: { gridcolor: '#f1f5f9', title: 'PWR (dB)' },
                                        legend: { orientation: 'h', y: -0.2 }
                                    }}
                                    style={{ width: '100%', height: '100%' }}
                                    useResizeHandler={true}
                                />
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>

            {/* Visual Analysis Modal (Like MeasurementPage) */}
            <AnimatePresence>
                {viewingResult && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 sm:p-12"
                        onClick={() => setViewingResult(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 30 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex flex-col">
                                    <h3 className="text-2xl font-black text-slate-800 tracking-tight">{viewingResult.filename.split('/').pop()}</h3>
                                </div>
                                <button onClick={() => setViewingResult(null)} className="p-4 rounded-2xl bg-slate-50 text-slate-400 hover:text-rose-500 transition-all cursor-pointer">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="p-8 flex-grow overflow-y-auto custom-scrollbar flex flex-col items-center">
                                <div className="flex gap-4 mb-8 w-full max-w-xl">
                                    {['ae', 'vae', 'pca'].map(type => {
                                        const p = viewingResult.predictions?.[type];
                                        if (!p) return null;
                                        const isActive = activeResultTab === type;
                                        const isNormal = p.detection.includes('Normal');
                                        return (
                                            <button 
                                                key={type}
                                                onClick={() => setActiveResultTab(type)}
                                                className={`flex-1 py-4 px-6 rounded-3xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                                                    isActive 
                                                        ? 'bg-primary border-primary text-secondary shadow-2xl scale-105' 
                                                        : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                                                }`}
                                            >
                                                <span className="text-xs font-black uppercase tracking-[0.2em]">{type}</span>
                                                <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${
                                                    isActive ? 'bg-secondary/20 text-secondary' : isNormal ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                                }`}>
                                                    {isNormal ? 'NORMAL' : 'ANOMALY'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {viewingResult.predictions?.[activeResultTab] && (
                                    <div className="w-full space-y-6">
                                        <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto">
                                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col items-center text-center">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Reconstruction MSE</span>
                                                <span className="text-3xl font-black text-primary font-mono tracking-tighter">
                                                    {viewingResult.predictions[activeResultTab].mse.toFixed(8)}
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col items-center text-center">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Anomaly Threshold</span>
                                                <span className="text-3xl font-black text-slate-600 font-mono tracking-tighter">
                                                    {viewingResult.predictions[activeResultTab].threshold.toFixed(8)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="w-full h-[400px] bg-white rounded-[2rem] border border-slate-100 p-6 shadow-inner relative group">
                                            <Plot
                                                data={(() => {
                                                    const res = viewingResult.predictions[activeResultTab];
                                                    const psd = res?.psd_pair || [[], [], []];
                                                    const freqs = psd[0] || [];
                                                    const actual = psd[1] || [];
                                                    const recon = psd[2] || [];
                                                    const correction = viewingResult.filename.includes('vibration') ? 19.833 : 93.979;

                                                    // Filter for visualization
                                                    const filteredIndices = freqs.map((f, i) => f <= 10000 ? i : -1).filter(i => i !== -1);
                                                    const x = filteredIndices.map(i => freqs[i]);
                                                    const yActual = filteredIndices.map(i => 10 * Math.log10(actual[i] + 1e-12) + correction);
                                                    const yRecon = filteredIndices.map(i => 10 * Math.log10(recon[i] + 1e-12) + correction);

                                                    return [
                                                        {
                                                            x: x, y: yActual, type: 'scatter', mode: 'lines', name: 'Input Pattern',
                                                            line: { color: 'rgba(148, 163, 184, 0.4)', width: 2, shape: 'spline' }
                                                        },
                                                        {
                                                            x: x, y: yRecon, type: 'scatter', mode: 'lines', name: 'Model Recon',
                                                            line: { color: '#1e3a8a', width: 4, shape: 'spline' }
                                                        }
                                                    ];
                                                })()}
                                                layout={{
                                                    autosize: true,
                                                    margin: { l: 60, r: 20, t: 20, b: 60 },
                                                    paper_bgcolor: 'transparent',
                                                    plot_bgcolor: 'transparent',
                                                    font: { family: 'Inter, sans-serif' },
                                                    xaxis: { gridcolor: '#f8fafc', title: 'FREQUENCY (Hz)', range: [0, 8000] },
                                                    yaxis: { gridcolor: '#f8fafc', title: 'POWER DENSITY (dB)' },
                                                    legend: { orientation: 'h', y: -0.2, x: 0.5, xanchor: 'center' },
                                                    hovermode: 'x unified'
                                                }}
                                                style={{ width: '100%', height: '100%' }}
                                                useResizeHandler={true}
                                                config={{ displayModeBar: false }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default PredictMLPage;
