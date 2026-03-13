import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Default configs extracted from the ML model Python files
const MODEL_DEFAULTS = {
    AE: {
        SR: 48000, N_FREQ_BINS: 1024, N_PERSEG: 2048, N_FFT: 2048,
        USE_LOG: true, MANUAL_THRESHOLD: 20,
        AE_LATENT_DIM: 4, EPOCHS: 200, BATCH_SIZE: 4,
    },
    VAE: {
        SR: 48000, N_FREQ_BINS: 1024, N_PERSEG: 2048, N_FFT: 2048,
        USE_LOG: true, MANUAL_THRESHOLD: 20,
        VAE_LATENT_DIM: 8, EPOCHS: 200, BATCH_SIZE: 4,
    },
    PCA: {
        SR: 48000, N_FREQ_BINS: 1024, N_PERSEG: 2048, N_FFT: 2048,
        USE_LOG: true, MANUAL_THRESHOLD: 20,
        PCA_N_COMPONENTS: 16, PCA_MIN_SAMPLES: 10,
    },
};

// Schema for rendering correct inputs
const SCHEMA = {
    SR: { label: 'Sample Rate (Hz)', type: 'int', min: 8000, max: 96000, group: 'Signal' },
    N_FREQ_BINS: { label: 'Frequency Bins', type: 'select', choices: [256, 512, 1024, 2048, 4096], group: 'Signal' },
    N_PERSEG: { label: 'N Per Segment', type: 'select', choices: [256, 512, 1024, 2048, 4096], group: 'Signal' },
    N_FFT: { label: 'N FFT', type: 'select', choices: [256, 512, 1024, 2048, 4096], group: 'Signal' },
    EPOCHS: { label: 'Epochs', type: 'int', min: 10, max: 2000, group: 'Training' },
    BATCH_SIZE: { label: 'Batch Size', type: 'int', min: 1, max: 256, group: 'Training' },
    AE_LATENT_DIM: { label: 'AE Latent Dim', type: 'int', min: 2, max: 64, group: 'Model' },
    VAE_LATENT_DIM: { label: 'VAE Latent Dim', type: 'int', min: 2, max: 64, group: 'Model' },
    PCA_N_COMPONENTS: { label: 'PCA Components', type: 'int', min: 1, max: 128, group: 'Model' },
    PCA_MIN_SAMPLES: { label: 'Min Samples', type: 'int', min: 1, max: 1000, group: 'Model' },
    MANUAL_THRESHOLD: { label: 'Manual Threshold', type: 'float', min: 0.0, max: 100.0, group: 'Threshold' },
};

const GROUP_ICONS = {
    Signal: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
        </svg>
    ),
    Training: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
    ),
    Model: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
    ),
    Threshold: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
    ),
};

const ModelConfigModal = ({ isOpen, onClose, modelType, config, onConfigChange }) => {
    const [localConfig, setLocalConfig] = useState({});

    useEffect(() => {
        if (isOpen) {
            setLocalConfig({ ...config });
        }
    }, [isOpen, config]);

    const handleChange = (key, value) => {
        setLocalConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        onConfigChange(localConfig);
        onClose();
    };

    const handleReset = () => {
        setLocalConfig({ ...MODEL_DEFAULTS[modelType] });
    };

    // Group the keys
    const groups = {};
    Object.keys(localConfig).forEach(key => {
        const schema = SCHEMA[key];
        if (!schema) return;
        const group = schema.group;
        if (!groups[group]) groups[group] = [];
        groups[group].push(key);
    });

    const renderInput = (key) => {
        const schema = SCHEMA[key];
        if (!schema) return null;
        const value = localConfig[key];

        if (schema.type === 'bool') {
            return (
                <button
                    type="button"
                    onClick={() => handleChange(key, !value)}
                    className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${value ? 'bg-primary' : 'bg-slate-300'}`}
                >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
            );
        }

        if (schema.type === 'select') {
            return (
                <select
                    value={value}
                    onChange={(e) => handleChange(key, parseInt(e.target.value))}
                    className="w-full px-4 py-3 sm:py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-bold text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 cursor-pointer transition-all"
                >
                    {schema.choices.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            );
        }

        return (
            <input
                type="number"
                value={value}
                min={schema.min}
                max={schema.max}
                step={schema.type === 'float' ? 0.01 : 1}
                onChange={(e) => {
                    const v = schema.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value);
                    if (!isNaN(v)) handleChange(key, v);
                }}
                className="w-full px-4 py-3 sm:py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-bold text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
            />
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9990] flex items-end sm:items-center justify-center sm:p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ y: "100%", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="relative w-full max-w-lg max-h-[90vh] sm:max-h-[85vh] bg-white rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                    >
                        {/* Drag Handle for Mobile */}
                        <div className="sm:hidden flex justify-center pt-3 pb-1">
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 sm:p-8 pb-4 sm:pb-6 border-b border-slate-100">
                            <div>
                                <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                                    <span className="text-primary">{modelType}</span> Configuration
                                </h2>
                                <p className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider mt-1">Parameters Setup</p>
                            </div>
                            <button 
                                onClick={onClose} 
                                className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all cursor-pointer text-slate-400 hover:text-slate-600 border border-slate-100"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 custom-scrollbar">
                            {Object.entries(groups).map(([groupName, keys]) => (
                                <div key={groupName} className="relative">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center shadow-sm">
                                            {GROUP_ICONS[groupName]}
                                        </div>
                                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{groupName} Settings</h3>
                                        <div className="flex-1 h-px bg-slate-100" />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 gap-4">
                                        {keys.map(key => (
                                            <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 p-4 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-primary/20 hover:bg-white transition-all group">
                                                <div className="flex flex-col">
                                                    <label className="text-sm font-bold text-slate-700 group-hover:text-primary transition-colors">
                                                        {SCHEMA[key].label}
                                                    </label>
                                                    {SCHEMA[key].group === 'Signal' && (
                                                        <span className="text-[10px] text-slate-400 font-medium">Digital Signal Processing</span>
                                                    )}
                                                    {SCHEMA[key].group === 'Training' && (
                                                        <span className="text-[10px] text-indigo-400 font-medium">Neural Network Training</span>
                                                    )}
                                                    {SCHEMA[key].group === 'Model' && (
                                                        <span className="text-[10px] text-emerald-400 font-medium">Model Architecture</span>
                                                    )}
                                                    {SCHEMA[key].group === 'Threshold' && (
                                                        <span className="text-[10px] text-orange-400 font-medium">Sensitivity Control</span>
                                                    )}
                                                </div>
                                                <div className="w-full sm:w-40 flex-shrink-0">
                                                    {renderInput(key)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="p-6 sm:p-8 pt-4 sm:pt-6 border-t border-slate-100 bg-white/80 backdrop-blur-md">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={handleReset}
                                    className="flex-1 sm:flex-initial px-6 py-4 text-sm font-black text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all cursor-pointer border border-slate-100 uppercase tracking-widest"
                                >
                                    Reset
                                </button>
                                <div className="flex-1 flex gap-3">
                                    <button
                                        onClick={onClose}
                                        className="flex-1 px-6 py-4 text-sm font-black text-slate-500 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all cursor-pointer uppercase tracking-widest"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="flex-[1.5] px-6 py-4 text-sm font-black text-white bg-primary rounded-2xl hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 cursor-pointer uppercase tracking-widest"
                                    >
                                        Apply Config
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export { MODEL_DEFAULTS };
export default ModelConfigModal;
