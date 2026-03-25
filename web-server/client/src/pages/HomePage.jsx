import React, { useState, useRef, useEffect, useCallback } from 'react';
import BarcodeScanner from 'react-qr-barcode-scanner';
import { useNavigate } from 'react-router';
import apiClient from '../config/axios';
import { jwtDecode } from 'jwt-decode';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlert } from '../context/AlertContext';
import { API_ENDPOINTS } from '../config/api';
import ModelConfigModal, { MODEL_DEFAULTS } from '../components/ModelConfigModal';
import { clearUserData } from '../config/auth';


function HomePage() {
    const navigate = useNavigate();
    const Swal = useAlert();
    const defaultForm = {
        measurementPoint: '', measurementTime: '',
        user_id: parseInt(localStorage.getItem('user_id')), machine_id: '',
        device_id: localStorage.getItem('selected_device_id') || '',
        sensitivity: localStorage.getItem('selected_sensitivity') || '100.0'
    };
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const scannerRef = useRef(null);
    const [formData, setFormData] = useState(defaultForm);
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [measurementMode, setMeasurementMode] = useState(null);
    const [modelName, setModelName] = useState('baseline');
    const [trainDataCount, setTrainDataCount] = useState(20);
    const [modelConfigs, setModelConfigs] = useState({
        AE: { ...MODEL_DEFAULTS.AE },
        VAE: { ...MODEL_DEFAULTS.VAE },
        PCA: { ...MODEL_DEFAULTS.PCA },
    });
    const [configModalOpen, setConfigModalOpen] = useState(null); // 'AE' | 'VAE' | 'PCA' | null
    const [dbDevices, setDbDevices] = useState([]);
    const [userRole, setUserRole] = useState(null);
    const [searchResults, setSearchResults] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = useRef(null);

    // Auto search effect
    useEffect(() => {
        const query = formData.KKSNumber?.trim();
        if (!query || query.length < 2) {
            setSearchResults([]);
            setShowSuggestions(false);
            return;
        }

        // Only search if user is typing, not when we've just selected a result
        // We can check if the current machineName matches what it would be if found
        // but it's simpler to just debounce it.
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
    }, [formData.KKSNumber]);

    // Close suggestions on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const modes = [
        {
            id: 'create_model',
            label: 'Create New ML Model',
            description: 'Record data to train a new model',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
            )
        },
        {
            id: 'measurement',
            label: 'Measurement',
            description: 'Production — data saved to server',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            )
        }
    ];

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            clearUserData();
            navigate('/login');
            return;
        }

        try {
            const decoded = jwtDecode(token);
            if (decoded.exp < Date.now() / 1000) {
                clearUserData();
                navigate('/login');
                return;
            }
            setUserRole(decoded.role);
        } catch (e) {
            console.error("Invalid token:", e);
            clearUserData();
            navigate('/login');
            return;
        }

        // Fetch Devices
        const fetchDevices = async () => {
            try {
                const response = await apiClient.get('/api/devices', {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                setDbDevices(response.data);
                
                // If only one device exists, select it automatically
                if (response.data.length === 1 && !formData.device_id) {
                    setFormData(f => ({ ...f, device_id: response.data[0].id.toString() }));
                }
            } catch (err) {
                console.error('Error fetching devices:', err);
            }
        };
        fetchDevices();
    }, [navigate, formData.device_id]);

    const fetchMachine = async (kks) => {
        try {
            const { data } = await apiClient.get(API_ENDPOINTS.MACHINES.GET_BY_KKS(kks), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setFormData({
                ...formData,
                KKSNumber: kks,
                machineName: data.name,
                measurementType: data.mtype,
                measurementPoint: data.mpoint.toString(),
                measurementTime: data.mtime.toString(),
                machine_id: data.id
            });
            setErrors({});
        } catch (error) {
            setErrors(e => ({
                ...e,
                KKSNumber: error?.response?.status === 404
                    ? 'Machine not found'
                    : 'Error fetching machine data'
            }));
            setFormData(f => ({
                ...f,
                machineName: '',
                measurementType: f.measurementType || 'vibration',
                measurementPoint: '',
                measurementTime: ''
            }));
        }
    };

    useEffect(() => {
        if (!formData.measurementType) return;
        const type = formData.measurementType;
        
        const savedDevice = localStorage.getItem(`selected_device_id_${type}`);
        const savedSens = localStorage.getItem(`selected_sensitivity_${type}`);
        
        setFormData(f => ({
            ...f,
            device_id: savedDevice || f.device_id,
            sensitivity: savedSens || f.sensitivity
        }));
    }, [formData.measurementType]);

    const handleScan = () => {
        setIsScannerOpen(true);
    };

    const handleCloseScan = () => {
        setIsScannerOpen(false);
    };

    const handleScanResult = (err, result) => {
        if (result?.text?.trim() && !isProcessing) {
            setIsProcessing(true);
            fetchMachine(result.text.trim());
            setIsScannerOpen(false);
            setTimeout(() => setIsProcessing(false), 2000);
        }
    };

    const handleSearch = () => {
        const kks = formData.KKSNumber.trim();
        if (kks) fetchMachine(kks);
        else setErrors(e => ({ ...e, KKSNumber: 'KKS Code is required to search' }));
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        let v = value;
        if (name === "measurementPoint") v = /^\d+$/.test(value) ? Math.max(1, +value).toString() : '';
        setFormData(f => ({ ...f, [name]: v }));
        
        if (name === 'device_id') {
            localStorage.setItem('selected_device_id', v);
            if (formData.measurementType) {
                localStorage.setItem(`selected_device_id_${formData.measurementType}`, v);
            }
        }
        if (name === 'sensitivity') {
            localStorage.setItem('selected_sensitivity', v);
            if (formData.measurementType) {
                localStorage.setItem(`selected_sensitivity_${formData.measurementType}`, v);
            }
        }
        if (errors[name]) setErrors(e => { const n = { ...e }; delete n[name]; return n; });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const newErrors = {};
        if (!formData.KKSNumber.trim()) newErrors.KKSNumber = 'KKS Code is required';
        if (!formData.machineName.trim()) newErrors.machineName = 'Machine Name is required';
        if (!formData.measurementPoint) newErrors.measurementPoint = 'Measurement point is required';
        if (!formData.measurementTime) newErrors.measurementTime = 'Duration is required';
        if (!formData.device_id) newErrors.device_id = 'Device selection is required';
        if (!measurementMode) newErrors.measurementMode = 'Please select a measurement mode';
        
        if (measurementMode === 'create_model') {
            if (!modelName.trim()) newErrors.modelName = 'Model Name is required';
            if (!trainDataCount || trainDataCount < 10) newErrors.trainDataCount = 'Minimum 10 training samples required';
        }
        
        setErrors(newErrors);
        
        if (!Object.keys(newErrors).length) {
            setTimeout(() => {
                setIsSubmitting(false);
                const selectedDevice = dbDevices.find(d => d.id.toString() === formData.device_id.toString());
                let targetPath = '/MeasurementPage';
                if (measurementMode === 'create_model') {
                    targetPath = '/CreateModelPage';
                } else if (measurementMode === 'measurement') {
                    targetPath = '/MeasurementPage';
                }
                navigate(targetPath, { state: { formData, measurementMode, modelName, trainDataCount, modelConfigs, selectedDevice } });
            }, 1000);
        } else {
            setIsSubmitting(false);
        }
    };

    const logout = useCallback(() => {
        Swal.fire({
            title: 'Sign Out?',
            text: 'Are you sure you want to log out?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Sign Out',
        }).then((result) => {
            if (result.isConfirmed) {
                clearUserData();
                navigate('/login');
            }
        });
    }, [Swal, navigate]);

    useEffect(() => {
        const handleLogoutEvent = () => {
            logout();
        };

        window.addEventListener('egat:logout', handleLogoutEvent);
        window.hasLogoutListener = true;

        return () => {
            window.removeEventListener('egat:logout', handleLogoutEvent);
            window.hasLogoutListener = false;
        };
    }, [logout]);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8">
            {/* Barcode Scanner Modal */}
            <AnimatePresence>
                {isScannerOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/90 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-md"
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl overflow-hidden"
                        >
                            <div className="flex justify-between items-center mb-4 sm:mb-6">
                                <h2 className="text-lg sm:text-xl font-black text-slate-900">Scan QR Code</h2>
                                <button onClick={handleCloseScan} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 cursor-pointer">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="relative rounded-2xl overflow-hidden aspect-square border-2 border-primary ring-4 ring-primary/10">
                                <BarcodeScanner
                                    ref={scannerRef}
                                    width="100%"
                                    height="100%"
                                    onUpdate={handleScanResult}
                                    facingMode="environment"
                                    stopStream={!isScannerOpen}
                                />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="border-2 border-white/50 rounded-2xl w-2/3 h-2/3 relative">
                                        <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-secondary rounded-tl-sm"></div>
                                        <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-secondary rounded-tr-sm"></div>
                                        <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-secondary rounded-bl-sm"></div>
                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-secondary rounded-br-sm"></div>
                                        
                                        <motion.div 
                                            animate={{ top: ['10%', '90%'] }}
                                            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                                            className="absolute left-0 right-0 h-0.5 bg-secondary shadow-[0_0_15px_rgba(250,204,21,0.8)]"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <p className="text-center text-slate-400 text-sm mt-6 font-medium tracking-wide">
                                Center the QR code within the frame
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Panel - Status & Navigation */}
                <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="lg:col-span-4 space-y-6"
                >
                    <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xl shadow-slate-200/50 border border-white">
                        <div className="flex items-center justify-between mb-5 sm:mb-6">
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base">Health Dashboard</h3>
                            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></div>
                        </div>
                        <button 
                            onClick={() => navigate('/Dashboard')}
                            id="dashboard-btn"
                            className="w-full p-4 bg-gradient-to-br from-primary to-primary-dark text-secondary rounded-2xl font-bold text-sm flex items-center justify-between group transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg shadow-primary/20"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-secondary/10 rounded-lg shrink-0">
                                    <svg className="w-5 h-5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </div>
                                <div className="text-left">
                                    <p className="font-black text-[13px] sm:text-sm">View Active Alerts</p>
                                </div>
                            </div>
                            <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>

                    {userRole === 'admin' && (
                        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xl shadow-slate-200/50 border border-white">
                            <div className="flex items-center justify-between mb-5 sm:mb-6">
                                <h3 className="font-bold text-slate-900 text-sm sm:text-base">Command Center</h3>
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            </div>
                            
                            <div className="space-y-3">
                                <button 
                                    onClick={() => navigate('/DatabaseManagerPage')}
                                    id="admin-db-btn"
                                    className="w-full p-4 bg-primary/5 hover:bg-primary text-primary hover:text-secondary rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-between group transition-all active:scale-[0.98] cursor-pointer border border-primary/10"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 group-hover:bg-white/10 rounded-lg transition-colors">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                                            </svg>
                                        </div>
                                        <span>Database Admin</span>
                                    </div>
                                    <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>

                                <button 
                                    onClick={() => navigate('/CalibratePage')}
                                    id="calibrate-btn"
                                    className="w-full p-4 bg-primary/5 hover:bg-primary text-primary hover:text-secondary rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-between group transition-all active:scale-[0.98] cursor-pointer border border-primary/10"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 group-hover:bg-white/10 rounded-lg transition-colors">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                            </svg>
                                        </div>
                                        <span>Sensor Calibration</span>
                                    </div>
                                    <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>

                                <button 
                                    onClick={() => navigate('/TrainMLPage')}
                                    id="train-ml-minio-btn"
                                    className="w-full p-4 bg-primary/5 hover:bg-primary text-primary hover:text-secondary rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-between group transition-all active:scale-[0.98] cursor-pointer border border-primary/10 shadow-sm hover:shadow-primary/20"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 group-hover:bg-white/10 rounded-lg transition-colors">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                            </svg>
                                        </div>
                                        <span>Train ML</span>
                                    </div>
                                    <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>

                                <button 
                                    onClick={() => navigate('/PredictMLPage')}
                                    id="predict-ml-btn"
                                    className="w-full p-4 bg-secondary/5 hover:bg-secondary text-secondary-dark hover:text-primary rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-between group transition-all active:scale-[0.98] cursor-pointer border border-secondary/20 shadow-sm hover:shadow-secondary/20"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-secondary/10 group-hover:bg-white/10 rounded-lg transition-colors">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <span>Predict ML</span>
                                    </div>
                                    <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}

                </motion.div>

                {/* Right Panel - Configuration Form */}
                <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="lg:col-span-8"
                >
                    <form onSubmit={handleSubmit} id="measurement-form" className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 md:p-10 shadow-xl shadow-slate-200/50 border border-white">
                        <div className="flex items-center gap-3 mb-6 sm:mb-10">
                            <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary shrink-0">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Measurement Config</h2>
                        </div>

                        {/* Mode Selection */}
                        <div className="mb-10">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-4 block">Select Mode</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {modes.map((mode) => (
                                    <motion.button
                                        key={mode.id}
                                        type="button"
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => {
                                            setMeasurementMode(mode.id);
                                            if (errors.measurementMode) {
                                                setErrors(e => { const n = { ...e }; delete n.measurementMode; return n; });
                                            }
                                        }}
                                        className={`p-5 rounded-[1.5rem] border-2 text-left transition-all cursor-pointer relative overflow-hidden ${
                                            measurementMode === mode.id
                                                ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                                                : errors.measurementMode 
                                                    ? 'border-red-300 bg-red-50/30' 
                                                    : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                                        }`}
                                    >
                                        {measurementMode === mode.id && (
                                            <div className="absolute top-0 right-0 p-4">
                                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                            </div>
                                        )}
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                                            measurementMode === mode.id
                                                ? 'bg-primary text-secondary shadow-lg shadow-primary/20'
                                                : 'bg-white text-slate-400 border border-slate-200'
                                        }`}>
                                            {mode.icon}
                                        </div>
                                        <h4 className={`font-bold text-base mb-1.5 transition-colors ${
                                            measurementMode === mode.id ? 'text-primary' : 'text-slate-700'
                                        }`}>{mode.label}</h4>
                                        <p className="text-xs text-slate-400 font-medium leading-relaxed">{mode.description}</p>
                                    </motion.button>
                                ))}
                            </div>
                            {errors.measurementMode && (
                                <p className="text-xs text-red-500 font-bold mt-2 ml-1 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    {errors.measurementMode}
                                </p>
                            )}
                        </div>

                        {/* Form fields — revealed after mode selection */}
                        <AnimatePresence>
                        {measurementMode && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className="overflow-hidden"
                        >
                        {/* Model Name — only for Create ML Model mode */}
                         {measurementMode === 'create_model' && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-8"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Model Name</label>
                                        <input
                                            id="model-name-input"
                                            name="modelName"
                                            type="text"
                                            value={modelName}
                                            onChange={(e) => {
                                                setModelName(e.target.value);
                                                if (errors.modelName) setErrors(prev => { const n = {...prev}; delete n.modelName; return n; });
                                            }}
                                            className={`w-full pl-4 pr-4 py-4 rounded-2xl bg-slate-50 border ${errors.modelName ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100'} text-slate-900 font-bold focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none placeholder:text-slate-300`}
                                            placeholder="Enter model name"
                                        />
                                        {errors.modelName && <p className="text-red-500 text-[10px] font-bold mt-1 ml-1">{errors.modelName}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Training Data (per point)</label>
                                        <input
                                            id="train-data-count-input"
                                            name="trainDataCount"
                                            type="number"
                                            min={10}
                                            max={1000}
                                            value={trainDataCount}
                                            onChange={(e) => {
                                                const v = Math.max(0, parseInt(e.target.value) || 0);
                                                setTrainDataCount(v);
                                                if (errors.trainDataCount && v >= 10) setErrors(prev => { const n = {...prev}; delete n.trainDataCount; return n; });
                                            }}
                                            className={`w-full pl-4 pr-4 py-4 rounded-2xl bg-slate-50 border ${errors.trainDataCount ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100'} text-slate-900 font-bold focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none placeholder:text-slate-300`}
                                            placeholder="30"
                                        />
                                        {errors.trainDataCount && <p className="text-red-500 text-[10px] font-bold mt-1 ml-1">{errors.trainDataCount}</p>}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Model Config Buttons — only for Create ML Model mode */}
                        {measurementMode === 'create_model' && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="mb-8"
                            >
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-3 block">Model Configurations</label>
                                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                    {[{ id: 'AE', label: 'Autoencoder', color: 'from-blue-500 to-indigo-600', icon: (
                                            <svg className="w-5 h-5 sm:w-5 sm:h-5 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                        )},
                                        { id: 'VAE', label: 'Variational AE', color: 'from-violet-500 to-purple-600', icon: (
                                            <svg className="w-5 h-5 sm:w-5 sm:h-5 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                        )},
                                        { id: 'PCA', label: 'PCA', color: 'from-emerald-500 to-teal-600', icon: (
                                            <svg className="w-5 h-5 sm:w-5 sm:h-5 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                        )}
                                    ].map((m) => (
                                        <motion.button
                                            key={m.id}
                                            type="button"
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.97 }}
                                            onClick={() => setConfigModalOpen(m.id)}
                                            className="p-2 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-slate-200 hover:border-primary/20 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/5 transition-all cursor-pointer text-center group flex flex-col items-center justify-center"
                                        >
                                            <div className={`w-8 h-8 sm:w-10 sm:h-10 mx-auto rounded-lg sm:rounded-xl bg-gradient-to-br ${m.color} text-white flex items-center justify-center mb-1 sm:mb-2 shadow-lg group-hover:scale-110 transition-transform`}>
                                                {m.icon}
                                            </div>
                                            <p className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 group-hover:text-primary transition-colors">{m.id}</p>
                                            <p className="text-[9px] sm:text-xs font-bold text-slate-700 leading-tight block truncate w-full group-hover:text-primary transition-colors">{m.label}</p>
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

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

                        <div className="space-y-8 mb-10">
                            {/* KKS Identification */}
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-3 block">KKS Code</label>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <div className="relative flex-grow" ref={searchRef}>
                                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                        </div>
                                        <input
                                            id="kks-input"
                                            name="KKSNumber"
                                            type="text"
                                            value={formData.KKSNumber}
                                            onChange={handleInputChange}
                                            onFocus={() => searchResults.length > 0 && setShowSuggestions(true)}
                                            autoComplete="off"
                                            className={`w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border ${errors.KKSNumber ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100 group-focus-within:border-primary hover:border-slate-200'} text-slate-900 font-bold focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none placeholder:text-slate-300`}
                                            placeholder="Enter KKS Code"
                                        />

                                        {/* Suggestions Dropdown */}
                                        <AnimatePresence>
                                            {showSuggestions && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
                                                >
                                                    <div className="max-h-60 overflow-y-auto">
                                                        {searchResults.map((machine) => (
                                                            <button
                                                                key={machine.kks}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFormData(f => ({ ...f, KKSNumber: machine.kks }));
                                                                    fetchMachine(machine.kks);
                                                                    setShowSuggestions(false);
                                                                }}
                                                                className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors flex flex-col border-b border-slate-50 last:border-0 cursor-pointer"
                                                            >
                                                                <span className="font-bold text-slate-900 text-sm">{machine.kks}</span>
                                                                <span className="text-xs text-slate-500 truncate">{machine.name}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                        
                                        {errors.KKSNumber && (
                                            <p className="absolute -bottom-6 left-1 text-xs text-red-500 font-bold flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                                {errors.KKSNumber}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-2 sm:gap-3">
                                        <button
                                            type="button"
                                            onClick={handleScan}
                                            id="scan-kks-btn"
                                            className="flex-1 sm:flex-none px-4 sm:px-6 py-4 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-95"
                                        >
                                            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                            </svg>
                                            <span className="text-[13px] sm:text-base">Scan</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSearch}
                                            id="search-kks-btn"
                                            className="flex-1 sm:flex-none px-4 sm:px-6 py-4 bg-primary text-secondary rounded-2xl font-black hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <span className="text-[13px] sm:text-base uppercase tracking-widest">Search</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Machine Specifications Card */}
                            <div className="bg-slate-50/50 rounded-3xl p-6 md:p-8 border border-slate-100 relative overflow-hidden">
                                {formData.machineName && (
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10" />
                                )}
                                
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`p-2 rounded-xl transition-all ${formData.machineName ? 'bg-emerald-100 text-emerald-600 shadow-sm' : 'bg-slate-200 text-slate-500'}`}>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                        </svg>
                                    </div>
                                    <h3 className="font-bold text-sm text-slate-800 tracking-wide uppercase">Machine Specifications</h3>
                                    {formData.machineName && (
                                        <motion.span 
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider border border-emerald-100"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                            Ready
                                        </motion.span>
                                    )}
                                </div>

                                <div className="space-y-4 sm:space-y-6 relative z-10">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                                        <div className="md:col-span-2 space-y-2">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Machine Name</label>
                                            <div className="relative">
                                                <input
                                                    disabled={true}
                                                    type="text"
                                                    value={formData.machineName}
                                                    className="w-full pl-4 pr-10 py-4 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold outline-none shadow-sm disabled:opacity-80 transition-all placeholder:text-slate-300"
                                                    placeholder="Waiting to retrieve detailed specifications..."
                                                />
                                                {formData.machineName && (
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 bg-white/50 backdrop-blur-sm rounded-full p-0.5">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Type</label>
                                            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 relative h-[56px] shadow-sm">
                                                {['vibration', 'sound'].map((type) => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        id={`type-btn-${type}`}
                                                        onClick={() => setFormData(f => ({ ...f, measurementType: type }))}
                                                        className={`flex-1 relative z-10 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
                                                            formData.measurementType === type
                                                                ? 'text-primary'
                                                                : 'text-slate-400 hover:text-slate-600'
                                                        } cursor-pointer`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                                <motion.div
                                                    className="absolute bg-primary/10 rounded-xl border border-primary/20 z-0 top-1.5 bottom-1.5"
                                                    initial={false}
                                                    animate={{
                                                        left: formData.measurementType === 'vibration' ? '6px' : 'calc(50% + 1px)',
                                                        width: 'calc(50% - 7px)'
                                                    }}
                                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 sm:gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Points</label>
                                            <div className="relative">
                                                <input
                                                    disabled={true}
                                                    type="text"
                                                    value={formData.measurementPoint ? `${formData.measurementPoint} Pts` : ''}
                                                    className="w-full pl-3 sm:pl-4 pr-3 py-4 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold outline-none shadow-sm disabled:opacity-80 placeholder:text-slate-300 text-sm sm:text-base text-center sm:text-left"
                                                    placeholder="-"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Duration</label>
                                            <div className="relative">
                                                <input
                                                    disabled={true}
                                                    type="text"
                                                    value={formData.measurementTime ? `${formData.measurementTime} Sec` : ''}
                                                    className="w-full pl-3 sm:pl-4 pr-3 py-4 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold outline-none shadow-sm disabled:opacity-80 placeholder:text-slate-300 text-sm sm:text-base text-center sm:text-left"
                                                    placeholder="-"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                 </div>
                        </div>

                        {/* Device & Sensitivity Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">Measurement Device</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-primary">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                        </svg>
                                    </div>
                                    <select
                                        name="device_id"
                                        value={formData.device_id}
                                        onChange={handleInputChange}
                                        className={`w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border ${errors.device_id ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100'} text-slate-900 font-bold focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none appearance-none`}
                                    >
                                        <option value="">Select Device...</option>
                                        {dbDevices.map(d => (
                                            <option key={d.id} value={d.id}>{d.device_name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                                {errors.device_id && <p className="text-red-500 text-[10px] font-bold mt-2 ml-1">{errors.device_id}</p>}
                            </div>

                            {formData.measurementType === 'vibration' ? (
                                <motion.div 
                                    key="vib-sens"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="space-y-3"
                                >
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">Sensor Sensitivity</label>
                                    <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100 relative h-[60px]">
                                        {[100, 10].map((val) => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => {
                                                    const v = val.toFixed(1);
                                                    setFormData(f => ({ ...f, sensitivity: v }));
                                                    localStorage.setItem('selected_sensitivity', v);
                                                    localStorage.setItem('selected_sensitivity_vibration', v);
                                                }}
                                                className={`flex-1 relative z-10 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 ${
                                                    parseFloat(formData.sensitivity) === val
                                                        ? 'text-primary'
                                                        : 'text-slate-400 hover:text-slate-600'
                                                } cursor-pointer`}
                                            >
                                                {val} <span className="text-[9px] opacity-70">mV/g</span>
                                            </button>
                                        ))}
                                        <motion.div
                                            className="absolute bg-white rounded-xl border border-slate-200 z-0 top-1.5 bottom-1.5 shadow-sm"
                                            initial={false}
                                            animate={{
                                                left: parseFloat(formData.sensitivity) === 100 ? '6px' : 'calc(50% + 1px)',
                                                width: 'calc(50% - 7px)'
                                            }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                        />
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="snd-sens"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="space-y-3"
                                >
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">Mic Sensitivity</label>
                                    <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100 relative h-[60px]">
                                        {[100, 10].map((val) => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => {
                                                    const v = val.toFixed(1);
                                                    setFormData(f => ({ ...f, sensitivity: v }));
                                                    localStorage.setItem('selected_sensitivity', v);
                                                    localStorage.setItem('selected_sensitivity_sound', v);
                                                }}
                                                className={`flex-1 relative z-10 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-300 ${
                                                    parseFloat(formData.sensitivity) === val
                                                        ? 'text-primary'
                                                        : 'text-slate-400 hover:text-slate-600'
                                                } cursor-pointer`}
                                            >
                                                {val} <span className="text-[9px] opacity-70">mV/Pa</span>
                                            </button>
                                        ))}
                                        <motion.div
                                            className="absolute bg-white rounded-xl border border-slate-200 z-0 top-1.5 bottom-1.5 shadow-sm"
                                            initial={false}
                                            animate={{
                                                left: parseFloat(formData.sensitivity) === 100 ? '6px' : 'calc(50% + 1px)',
                                                width: 'calc(50% - 7px)'
                                            }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        <motion.button
                            whileHover={isSubmitting || !formData.machine_id ? {} : { scale: 1.01, y: -2 }}
                            whileTap={isSubmitting || !formData.machine_id ? {} : { scale: 0.98 }}
                            type="submit"
                            id="start-measurement-btn"
                            disabled={isSubmitting || !formData.machine_id}
                            className={`w-full py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer ${
                                isSubmitting || !formData.machine_id
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                                    : 'bg-primary text-secondary hover:bg-primary-dark shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40'
                            }`}
                        >
                            {isSubmitting ? (
                                <svg className="animate-spin h-6 w-6 text-secondary" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <>
                                    <span>{measurementMode === 'create_model' ? 'Start Training' : 'Start Measurement'}</span>
                                    <svg className="w-5 h-5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </>
                            )}
                        </motion.button>
                        </motion.div>
                        )}
                        </AnimatePresence>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}

export default HomePage;
