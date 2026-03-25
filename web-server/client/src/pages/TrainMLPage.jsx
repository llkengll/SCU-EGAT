import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import apiClient from '../config/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlert } from '../context/AlertContext';
import { API_ENDPOINTS } from '../config/api';
import Plot from 'react-plotly.js';
import ModelConfigModal, { MODEL_DEFAULTS } from '../components/ModelConfigModal';
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

function TrainMLPage() {
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
    const [isTraining, setIsTraining] = useState(false);
    const [trainingLogs, setTrainingLogs] = useState([]);
    const [allSelectedPsdData, setAllSelectedPsdData] = useState({});
    const [isFetchingPsd, setIsFetchingPsd] = useState(false);
    const [modelName, setModelName] = useState('baseline');
    const [modelConfigs, setModelConfigs] = useState({
        AE: { ...MODEL_DEFAULTS.AE },
        VAE: { ...MODEL_DEFAULTS.VAE },
        PCA: { ...MODEL_DEFAULTS.PCA },
    });
    const [configModalOpen, setConfigModalOpen] = useState(null);
    const terminalEndRef = useRef(null);
    const [searchResults, setSearchResults] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);
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
    }, [trainingLogs]);

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
            
            // Group files by Point and then by Folder (train / rawData / models)
            const grouped = {};
            response.data.forEach(file => {
                const parts = file.name.split('/');
                // Path structure: [kks] / P[point] / [type] / [context] / ... / [filename]
                const kksIndex = parts.indexOf(machineKks);
                if (kksIndex !== -1 && parts.length > kksIndex + 3) {
                    const point = parts[kksIndex + 1];
                    const type = parts[kksIndex + 2];
                    const context = parts[kksIndex + 3];
                    
                    // ONLY process if context is 'rawData'
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
            if (points.length > 0 && selectedPoint === 'All') {
                // Keep 'All' or auto-select first? Let's keep 'All' for flexibility
            }
        } catch (error) {
            console.error("Error fetching files:", error);
            Swal.fire('Error', 'Failed to fetch files from MinIO', 'error');
        } finally {
            setIsLoadingFiles(false);
        }
    };

    const fetchMachine = async (machineKks) => {
        try {
            const { data } = await apiClient.get(API_ENDPOINTS.MACHINES.GET_BY_KKS(machineKks), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setMachineName(data.name);
            setMeasurementType(data.mtype);
            handleFetchFiles(machineKks);
        } catch (error) {
            console.error("Machine not found:", error);
            setMachineName('');
        }
    };

    const handleSelectResult = (machine) => {
        setKks(machine.kks);
        setMachineName(machine.name);
        setMeasurementType(machine.mtype);
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
                // Remove PSD data when deselecting
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
            // Filter by Point
            if (selectedPoint !== 'All' && pt !== selectedPoint) return;
            
            Object.entries(typeGroups).forEach(([type, contextGroups]) => {
                // Filter by Measurement Type
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
            // Merge with existing but only add if not already there
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

    const handleStartTraining = async () => {
        if (selectedFiles.length === 0) {
            Swal.fire('No Files Selected', 'Please select at least one file for training.', 'warning');
            return;
        }

        const confirm = await Swal.fire({
            title: 'Start Training?',
            text: `Training will begin using ${selectedFiles.length} selected files.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Start Training',
            confirmButtonColor: '#1e3a8a'
        });

        if (!confirm.isConfirmed) return;

        setIsTraining(true);
        setShowTerminal(true);
        setTrainingLogs(["[SYSTEM] Preparing training data...", "[SYSTEM] Connecting to ML Server..."]);

        try {
            // we use the first selected file to determine the prefix folder for training if needed
            // but for "Train by select", we might need the ML server to support a list of files or a specific version
            // For now, let's assume we train by providing the prefix if they are in the same folder, 
            // OR we might need to modify the ML server to accept a list of file paths.
            
            // Reusing TRAIN_ALL pattern for now, assuming selected files are the ones we want.
            // In a real scenario, we might move these files to a 'v_current_train' folder.
            
            // To simplify for this demo, we'll just send the prefix of the FIRST selected file
            // and assume it's the folder we want.
            const firstFile = selectedFiles[0];
            const folderPrefix = firstFile.substring(0, firstFile.lastIndexOf('/') + 1);

            const response = await fetch(API_ENDPOINTS.ML.TRAIN_ALL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ 
                    bucket: 'scu-data', 
                    prefix: folderPrefix,
                    model_name: modelName || 'custom',
                    model_configs: modelConfigs,
                    selected_files: selectedFiles // Passing selected files if ML server supports it
                })
            });

            if (!response.body) {
                setTrainingLogs(prev => [...prev, "[ERROR] No response body from ML server"]);
                setIsTraining(false);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(l => l.trim());
                setTrainingLogs(prev => [...prev, ...lines]);
            }

            setTrainingLogs(prev => [...prev, "[SYSTEM] Training finished successfully!"]);
            Swal.fire('Training Complete', 'The model has been trained and saved.', 'success');
        } catch (error) {
            console.error("Training error:", error);
            setTrainingLogs(prev => [...prev, `[ERROR] ${error.message}`]);
            Swal.fire('Training Failed', error.message, 'error');
        } finally {
            setIsTraining(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8">
            <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Left Panel: Config & Search */}
                <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="lg:col-span-4 space-y-6"
                >
                    <div className="bg-white rounded-3xl p-6 shadow-xl border border-white">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-black text-slate-900">Find Training Data</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="relative" ref={searchRef}>
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">KKS Code</label>
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
                                    className="p-5 bg-emerald-50/50 backdrop-blur-sm rounded-[2rem] border border-emerald-100 shadow-sm"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">Target Asset</p>
                                            <p className="font-black text-slate-800 text-sm leading-tight">{machineName}</p>
                                        </div>
                                        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                                            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
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
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Monitoring Point</label>
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
                                    </div>
                                </motion.div>
                            )}

                            <div className="pt-4 space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Model Name</label>
                                    <input
                                        type="text"
                                        value={modelName}
                                        onChange={(e) => setModelName(e.target.value)}
                                        className="w-full px-4 py-4 rounded-2xl bg-slate-50 border border-slate-100 font-bold focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none"
                                        placeholder="e.g. baseline"
                                    />
                                </div>
                                
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">Model Parameters</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['AE', 'VAE', 'PCA'].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setConfigModalOpen(type)}
                                            className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:border-primary hover:text-primary transition-all cursor-pointer"
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleStartTraining}
                        disabled={isTraining || selectedFiles.length === 0}
                        className={`w-full py-5 rounded-[2rem] font-black text-lg transition-all shadow-2xl flex items-center justify-center gap-3 relative overflow-hidden group ${
                            isTraining || selectedFiles.length === 0
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-primary text-secondary hover:scale-[1.02] active:scale-[0.98] shadow-primary/30 cursor-pointer hover:shadow-primary/50'
                        }`}
                    >
                        {!isTraining && !selectedFiles.length === 0 && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        )}
                        {isTraining ? (
                            <>
                                <div className="w-6 h-6 border-4 border-secondary/30 border-t-secondary rounded-full animate-spin" />
                                <span className="tracking-tight uppercase">Processing Pipeline...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <span className="tracking-tighter">EXECUTE TRAINING</span>
                            </>
                        )}
                    </button>
                </motion.div>

                {/* Right Panel: File List & Logs */}
                <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="lg:col-span-8 space-y-6"
                >
                    <div className="bg-white/70 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white flex flex-col h-[650px]">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Dataset</h2>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Hierarchical View: Point / Type / Source</p>
                            </div>
                            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                                <button onClick={selectAll} className="px-4 py-1.5 text-[10px] font-black text-primary uppercase tracking-widest hover:bg-white rounded-xl transition-all cursor-pointer">Select All</button>
                                <div className="w-px h-4 bg-slate-200" />
                                <button onClick={deselectAll} className="px-4 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-white rounded-xl transition-all cursor-pointer">Reset</button>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto pr-3 custom-scrollbar">
                            {isLoadingFiles ? (
                                <div className="h-full flex flex-col items-center justify-center space-y-6">
                                    <div className="relative">
                                        <div className="w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-8 h-8 bg-primary/10 rounded-full animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-slate-900 font-black text-sm uppercase tracking-widest">Synchronizing Metadata</p>
                                        <p className="text-slate-400 text-[10px] font-bold uppercase mt-1">Querying Distributed Storage Cluster...</p>
                                    </div>
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
                                                        <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg">
                                                            <span className="text-xs font-black">PT{pt.replace('P','')}</span>
                                                        </div>
                                                        <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
                                                    </div>
                                                    
                                                    {filteredTypes.map(([type, contextGroups]) => (
                                                        <div key={type} className="space-y-4 ml-6">
                                                            {Object.entries(contextGroups).map(([context, fileList]) => (
                                                                <div key={context} className="space-y-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className={`w-2 h-2 rounded-full ${context === 'rawData' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                                                                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">{type} / {context}</span>
                                                                        <span className="text-[10px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded-lg">{fileList.length}</span>
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
                                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-200 mb-6 shadow-sm">
                                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                        </svg>
                                    </div>
                                    <p className="text-slate-900 font-black uppercase tracking-tight text-lg">Empty Dataset</p>
                                    <p className="text-slate-400 text-xs font-medium max-w-[240px] mt-2">Enter a valid KKS code above to synchronize training samples from the storage cluster.</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between bg-white/50 -mx-8 px-8 -mb-8 rounded-b-[2.5rem]">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-3 h-3 rounded-full bg-primary" />
                                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-primary animate-ping opacity-40" />
                                </div>
                                <span className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedFiles.length} Samples Selected</span>
                            </div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] bg-slate-100 px-3 py-1 rounded-full">
                                Pipeline Ready
                            </div>
                        </div>
                    </div>

                    {/* Terminal Logs Modal */}
                    <AnimatePresence>
                        {showTerminal && (
                             <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12 md:p-24"
                            >
                                {/* Backdrop */}
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => !isTraining && setShowTerminal(false)}
                                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl"
                                />

                                {/* Modal Content */}
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.9, y: 30 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.99, y: 10 }}
                                    className="bg-[#020617] w-full max-w-4xl h-[70vh] rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col border border-white/10"
                                >
                                    <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                                        <svg className="w-64 h-64 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </div>

                                    {/* Modal Header */}
                                    <div className="flex items-center justify-between p-8 relative border-b border-white/5 bg-white/[0.02]">
                                        <div className="flex items-center gap-6">
                                            <div className="flex gap-2 bg-white/5 p-2.5 rounded-full px-4 border border-white/5">
                                                <div className="w-3 h-3 rounded-full bg-[#ff5f56] animate-pulse shadow-[0_0_10px_rgba(255,95,86,0.3)]" />
                                                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                                                <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-1">Compute Instance</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-black text-white tracking-widest">NEURAL_SYNC_MODE</span>
                                                    <div className="px-2 py-0.5 bg-primary/20 text-primary text-[8px] font-black rounded border border-primary/20">v1.4.0-STABLE</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            {isTraining && (
                                                <div className="flex items-center gap-3 px-5 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Active Pipeline</span>
                                                </div>
                                            )}
                                            {!isTraining && (
                                                <button 
                                                    onClick={() => setShowTerminal(false)}
                                                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all group border border-white/5"
                                                >
                                                    <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Terminal Area */}
                                    <div className="flex-grow overflow-y-auto font-mono text-xs p-10 leading-relaxed space-y-2.5 custom-scrollbar-dark scroll-smooth relative">
                                        {trainingLogs.map((log, i) => (
                                            <div key={i} className="flex gap-6 group/line">
                                                <span className="text-slate-800 shrink-0 font-bold opacity-30 group-hover/line:opacity-100 transition-opacity w-8 text-right select-none">{i + 1}</span>
                                                <span className={
                                                    log.includes('[ERROR]') ? 'text-rose-400 font-bold drop-shadow-[0_0_8px_rgba(251,113,133,0.3)]' : 
                                                    log.includes('[SYSTEM]') ? 'text-cyan-400 font-black tracking-wide' : 
                                                    log.includes('epoch') ? 'text-emerald-400/90' : 
                                                    log.includes('SUCCESS') ? 'text-emerald-300 font-black' :
                                                    'text-slate-400 font-medium'
                                                }>
                                                    {log.startsWith('[') ? log : (
                                                        <span className="flex gap-3">
                                                            <span className="opacity-30 text-emerald-500">➜</span>
                                                            <span className="flex-1">{log}</span>
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                        <div ref={terminalEndRef} />
                                    </div>

                                    {/* Modal Footer */}
                                    <div className="p-6 px-10 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
                                        <div className="flex items-center gap-6">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Selected Samples</span>
                                                <span className="text-xs font-black text-slate-400">{selectedFiles.length} Path Definitions</span>
                                            </div>
                                            <div className="w-px h-6 bg-white/5" />
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Model Context</span>
                                                <span className="text-xs font-black text-slate-400 uppercase">{modelName} / {measurementType}</span>
                                            </div>
                                        </div>
                                        {isTraining ? (
                                            <div className="text-[10px] font-black text-primary animate-pulse tracking-[0.2em] uppercase">Processing Tensor Operations...</div>
                                        ) : (
                                            <button 
                                                onClick={() => setShowTerminal(false)}
                                                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
                                            >
                                                Dismiss Console
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Bottom Panel: Plot Signature Map */}
                <div className="lg:col-span-12">
                    <AnimatePresence>
                        {selectedFiles.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="bg-white/80 backdrop-blur-2xl rounded-[3rem] p-10 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.1)] border border-white relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                                <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/5 rounded-full blur-3xl -ml-32 -mb-32 pointer-events-none" />
                                
                                <div className="flex items-center justify-between mb-10 relative">
                                    <div>
                                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Spectral <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Signature Analysis</span></h2>
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2 block ml-1">Comparative Visualization: {Object.keys(allSelectedPsdData).length} Data Channels</p>
                                    </div>
                                    {isFetchingPsd && (
                                        <div className="flex items-center gap-4 px-5 py-2.5 bg-primary/5 rounded-[1.5rem] border border-primary/10 backdrop-blur-md">
                                            <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin shadow-[0_0_15px_rgba(30,58,138,0.2)]" />
                                            <span className="text-[11px] font-black text-primary uppercase tracking-[0.2em]">Live Data Stream</span>
                                        </div>
                                    )}
                                </div>

                                <div className="w-full h-[500px] relative">
                                    <Plot
                                        data={(() => {
                                            const plotData = [];
                                            const colors = ['#1e3a8a', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];
                                            Object.entries(allSelectedPsdData).forEach(([fileName, psdPair], idx) => {
                                                const freqs = psdPair[0];
                                                const psdValues = psdPair[1];
                                                const shortName = fileName.split('/').pop().split('_').slice(-2).join('_');
                                                const correction = fileName.includes('vibration') ? 19.833 : 93.979;

                                                plotData.push({
                                                    x: freqs,
                                                    y: psdValues.map(v => 10 * Math.log10(v + 1e-12) + correction),
                                                    type: 'scatter',
                                                    mode: 'lines',
                                                    name: `<b>${shortName}</b>`,
                                                    line: { 
                                                        width: 2.5,
                                                        shape: 'spline', 
                                                        smoothing: 1.3,
                                                        color: colors[idx % colors.length]
                                                    },
                                                    opacity: 0.85,
                                                    hovertemplate: `<span style="font-family: Inter"><b>%{y:.2f} dB</b><br>%{x:.0f} Hz</span><extra></extra>`
                                                });
                                            });
                                            return plotData;
                                        })()}
                                        layout={{
                                            autosize: true,
                                            margin: { l: 70, r: 30, t: 10, b: 80 },
                                            paper_bgcolor: 'transparent',
                                            plot_bgcolor: 'transparent',
                                            font: { family: 'Outfit, Inter, sans-serif' },
                                            xaxis: { 
                                                gridcolor: 'rgba(0,0,0,0.03)', 
                                                tickfont: { size: 11, color: '#94a3b8', weight: 'bold' },
                                                title: { text: 'FREQUENCY DOMAIN (Hz)', font: { size: 10, color: '#64748b', weight: 'black' }, standoff: 30 },
                                                range: [0, 8000],
                                                linecolor: 'rgba(0,0,0,0.05)',
                                                zeroline: false,
                                                automargin: true
                                            },
                                            yaxis: { 
                                                gridcolor: 'rgba(0,0,0,0.03)', 
                                                tickfont: { size: 11, color: '#94a3b8', weight: 'bold' },
                                                title: { text: 'POWER DENSITY (dB)', font: { size: 10, color: '#64748b', weight: 'black' }, standoff: 30 },
                                                linecolor: 'rgba(0,0,0,0.05)',
                                                zeroline: false,
                                                automargin: true
                                            },
                                            legend: {
                                                orientation: 'h',
                                                y: -0.3,
                                                font: { size: 10, color: '#475569' },
                                                itemwidth: 40,
                                                bgcolor: 'rgba(255,255,255,0.5)'
                                            },
                                            hovermode: 'closest',
                                            showlegend: Object.keys(allSelectedPsdData).length < 24
                                        }}
                                        style={{ width: '100%', height: '100%' }}
                                        useResizeHandler={true}
                                        config={{ displayModeBar: false, responsive: true }}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Model Config Modals */}
            {['AE', 'VAE', 'PCA'].map(type => (
                <ModelConfigModal
                    key={type}
                    isOpen={configModalOpen === type}
                    onClose={() => setConfigModalOpen(null)}
                    modelType={type}
                    config={modelConfigs[type]}
                    onConfigChange={(newCfg) => setModelConfigs(prev => ({ ...prev, [type]: newCfg }))}
                />
            ))}
        </div>
    );
}

export default TrainMLPage;
