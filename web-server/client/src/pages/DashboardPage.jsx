import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import apiClient from '../config/axios';
import { motion, AnimatePresence } from 'framer-motion';
import Plot from 'react-plotly.js';
import { useAlert } from '../context/AlertContext';
import { API_ENDPOINTS } from '../config/api';
import { jwtDecode } from 'jwt-decode';
import { clearUserData } from '../config/auth';


function DashboardPage() {
    const navigate = useNavigate();
    const Swal = useAlert();
    const [alerts, setAlerts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [selectedPopupStep, setSelectedPopupStep] = useState(null);
    const [activePlotMethod, setActivePlotMethod] = useState('ae');
    const [lastUpdated, setLastUpdated] = useState(new Date());

    const fetchAlerts = async () => {
        setIsLoading(true);
        try {
            const { data } = await apiClient.get(API_ENDPOINTS.MACHINES.GET_ALERTS);
            setAlerts(data);
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Error fetching alerts:', error);
            Swal.fire('Error', 'Failed to fetch alert logs', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleMainMenuClick = () => {
        navigate('/');
    };

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
        } catch (e) {
            clearUserData();
            navigate('/login');
            return;
        }

        fetchAlerts();
        const interval = setInterval(fetchAlerts, 10000);
        
        const handleRefreshEvent = () => {
            fetchAlerts();
        };
        window.addEventListener('egat:refresh', handleRefreshEvent);

        return () => {
            clearInterval(interval);
            window.removeEventListener('egat:refresh', handleRefreshEvent);
        };
    }, [navigate]);

    const parseDate = (date) => {
        if (!date) return null;
        if (date instanceof Date) return date;
        
        let sanitized = String(date).trim();
        // Handle "YYYY-MM-DD HH:mm:ss.sssss" -> "YYYY-MM-DDTHH:mm:ss.sss"
        sanitized = sanitized.replace(' ', 'T');
        
        // Truncate fractional seconds
        if (sanitized.includes('.')) {
            const [main, fract] = sanitized.split('.');
            sanitized = main + '.' + fract.substring(0, 3);
        }
        
        // IF the string does NOT contain a timezone indicator (Z or +/-, or T-relative)
        // we append 'Z' to force it to be treated as UTC, then convert to ICT
        if (!sanitized.includes('Z') && !sanitized.match(/[+-]\d{2}:?\d{2}$/)) {
            sanitized += 'Z';
        }
        
        const d = new Date(sanitized);
        return isNaN(d.getTime()) ? null : d;
    };

    const formatInBangkok = (date) => {
        const d = parseDate(date);
        if (!d) return '---';
        return d.toLocaleString('en-GB', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: false,
            timeZone: 'Asia/Bangkok' 
        });
    };

    const getTimeAgo = (date) => {
        return formatInBangkok(date);
    };

    const formatDateTime = (date) => {
        const d = parseDate(date);
        if (!d) return '---';
        return d.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Asia/Bangkok',
            timeZoneName: 'short'
        }).replace(',', '');
    };

    const renderVerificationTree = (chain) => {
        if (!chain || !Array.isArray(chain)) return (
            <div className="py-12 text-center text-white/20 font-black uppercase tracking-[0.2em] text-[10px] bg-white/5 rounded-3xl border border-white/5">
                No verification data available
            </div>
        );

        return (
            <div className="relative pt-2">
                {/* Vertical Connector Line */}
                <div className="absolute left-4 top-0 bottom-0 w-px bg-white/10 ml-[-0.5px]"></div>
                
                {chain.map((step, idx) => {
                    const availableMethods = ['ae', 'pca', 'vae'];
                    return (
                        <motion.div 
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="relative pl-10 mb-4 last:mb-0 cursor-pointer group/card"
                            onClick={() => {
                                // Use lowercase measurement_type for robust comparison in calculations
                                const mType = selectedAlert?.measurement_type?.toLowerCase() || 'vibration';
                                setSelectedPopupStep({ ...step, measurement_type: mType });
                                
                                // Reset to 'ae' if available, otherwise pick first available (matching MeasurementPage logic)
                                const availableMethods = ['ae', 'vae', 'pca', 'AE', 'VAE', 'PCA'];
                                const actualKey = availableMethods.find(m => step.results && step.results[m]);
                                setActivePlotMethod(actualKey || 'ae');
                            }}
                        >
                            {/* Circle Indicator */}
                            <div className={`absolute left-0 top-1.5 w-8 h-8 rounded-full border-4 bg-white z-10 flex items-center justify-center shadow-lg transition-all duration-300 ${step.isAbnormal ? 'border-secondary' : 'border-emerald-500'} group-hover/card:scale-110`}>
                                {step.isAbnormal ? (
                                    <svg className="w-3.5 h-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                ) : (
                                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                )}
                            </div>
                            
                            {/* Compact Card UI - MeasurementPage Style */}
                            <div className={`bg-white rounded-2xl p-4 border-2 transition-all shadow-xl ${step.isAbnormal ? 'border-secondary shadow-secondary/5' : 'border-white/90 shadow-sm'}`}>
                                <div className="flex justify-between items-start mb-2.5">
                                    <div className="min-w-0 flex-1 pr-2">
                                         <h4 className="font-black text-primary text-[11px] sm:text-[13px] tracking-tight leading-none mb-1 group-hover/card:text-secondary-dark transition-colors truncate">{step.projectName || 'Baseline'}</h4>
                                         <div className="flex items-center gap-1.5 flex-wrap">
                                             <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">v{step.version || '1.0'}</span>
                                             <div className="hidden xs:block w-1 h-1 rounded-full bg-slate-100"></div>
                                             <span className="text-[8px] sm:text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Step #{idx + 1}</span>
                                         </div>
                                     </div>
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[7px] sm:text-[8px] font-black uppercase tracking-wider ${step.isAbnormal ? 'bg-secondary text-primary shadow-sm' : 'bg-emerald-500 text-white shadow-sm'}`}>
                                            {step.isAbnormal ? 'Anomaly' : 'Good'}
                                        </span>
                                        {step.matchRate > 0 && (
                                            <span className={`px-1.5 py-0.5 rounded-lg text-[7px] sm:text-[8px] font-black uppercase tracking-tighter ${step.isAbnormal ? 'bg-secondary/10 text-primary' : 'bg-emerald-50 text-emerald-700'}`}>
                                                {step.matchRate.toFixed(0)}% Match
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-1 sm:gap-1.5 mt-2.5">
                                    {availableMethods.map(mType => {
                                        const res = step.results && step.results[mType];
                                        if (!res) return null;
                                        const isMAbnormal = res.detection?.toLowerCase().includes('anomaly') || res.detection?.toLowerCase().includes('abnormal');
                                        return (
                                            <div key={mType} className={`flex flex-col items-center justify-center py-1 sm:py-1.5 rounded-lg border-1.5 transition-all ${isMAbnormal ? 'bg-rose-50 text-rose-700 border-rose-100 shadow-sm shadow-rose-500/5' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                                                <span className="text-[6px] sm:text-[7px] font-black uppercase tracking-widest opacity-40 leading-none mb-0.5 sm:mb-1">{mType}</span>
                                                <span className="text-[7.5px] sm:text-[8.5px] font-black uppercase leading-none tracking-tight">{isMAbnormal ? 'FAIL' : 'PASS'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 flex flex-col items-center font-sans selection:bg-primary/10">

            <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="lg:col-span-7 xl:col-span-8 bg-white/70 backdrop-blur-xl rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl shadow-slate-200/50 border border-white relative overflow-hidden"
                >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 relative z-10 gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 text-primary rounded-xl sm:rounded-2xl flex items-center justify-center border border-primary/5 shadow-inner flex-shrink-0">
                                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Detection <span className="text-primary/70">Logs</span></h2>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">Historical Anomaly Feed</p>
                            </div>
                        </div>
                    </div>

                    {/* Mobile View: Card List */}
                    <div className="md:hidden flex flex-col gap-4">
                        {alerts.length === 0 ? (
                            <div className="py-12 flex flex-col items-center gap-4 text-center">
                                <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center shadow-inner border border-emerald-100/50">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div className="space-y-1 px-4">
                                    <p className="font-black text-slate-900 text-base uppercase tracking-tight">System Fully Operational</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-8">All machine signatures match baseline parameters.</p>
                                </div>
                            </div>
                        ) : (
                            alerts.map((alert) => (
                                <motion.div
                                    key={alert.id}
                                    className={`p-5 rounded-2xl border-2 transition-all active:scale-95 ${selectedAlert?.id === alert.id ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5' : 'bg-slate-50 border-white shadow-sm'}`}
                                    onClick={() => setSelectedAlert(alert)}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="font-black text-slate-900 text-lg leading-none mb-1.5">{alert.kks}</p>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${Math.round(parseFloat(alert.percent_match)) > 80 ? 'bg-red-500' : 'bg-orange-400'} animate-pulse`}></div>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                                                    {getTimeAgo(alert.updated_at || alert.UpdatedAt || alert.created_at || alert.CreatedAt) || 'Recent'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${alert.measurement_type === 'sound' ? 'bg-primary/5 text-primary border-primary/10' : 'bg-cyan-50 text-cyan-700 border-cyan-100'}`}>
                                                {alert.measurement_type}
                                            </span>
                                            <span className="text-[8px] font-black text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">ST.{alert.measurement_point}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <p className="text-[12px] font-black text-slate-700 leading-snug">{alert.abnormal_case}</p>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-grow bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${alert.percent_match}%` }}
                                                    className={`h-full ${alert.percent_match > 80 ? 'bg-red-500' : 'bg-orange-500'}`}
                                                />
                                            </div>
                                            <span className={`text-[10px] font-black min-w-[30px] text-right ${Math.round(parseFloat(alert.percent_match)) > 80 ? 'text-red-500' : 'text-orange-500'}`}>
                                                {Math.round(parseFloat(alert.percent_match))}%
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>

                    {/* Desktop View: Table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left border-b border-slate-100/50">
                                    <th className="pb-5 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">KKS Code</th>
                                    <th className="pb-5 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Type / Pnt</th>
                                    <th className="pb-5 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Diagnosis Result</th>
                                    <th className="pb-5 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {alerts.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="py-24 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center shadow-inner border border-emerald-100/50">
                                                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="font-black text-slate-900 text-lg uppercase tracking-tight">System Fully Operational</p>
                                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">All machine signatures match baseline parameters.</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    alerts.map((alert) => (
                                        <motion.tr 
                                            key={alert.id}
                                            role="button"
                                            tabIndex="0"
                                            className={`group transition-all duration-300 transform cursor-pointer border-l-4 ${selectedAlert?.id === alert.id ? 'bg-primary/5 border-primary scale-[0.985] shadow-sm ring-1 ring-primary/10' : 'hover:bg-slate-50 border-transparent active:scale-95'}`}
                                            onClick={() => setSelectedAlert(alert)}
                                        >
                                            <td className="py-6 px-3">
                                                <p className="font-black text-slate-900 group-hover:text-primary transition-colors text-base tracking-tight leading-none mb-2">{alert.kks}</p>
                                                <div className="flex items-center gap-2" title={formatDateTime(alert.updated_at || alert.UpdatedAt || alert.created_at || alert.CreatedAt)}>
                                                    <div className={`w-2 h-2 rounded-full ${Math.round(parseFloat(alert.percent_match)) > 80 ? 'bg-red-500' : 'bg-orange-400'} animate-pulse`}></div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                        {getTimeAgo(alert.updated_at || alert.UpdatedAt || alert.created_at || alert.CreatedAt) || 'Recent'}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="py-6 px-3">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${alert.measurement_type === 'sound' ? 'bg-primary/5 text-primary border-primary/10' : 'bg-cyan-50 text-cyan-700 border-cyan-100'}`}>
                                                        {alert.measurement_type}
                                                    </span>
                                                    <span className="text-[10px] font-black text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-1 rounded-md">ST.{alert.measurement_point}</span>
                                                </div>
                                            </td>
                                            <td className="py-6 px-3 max-w-[240px]">
                                                <p className="text-[13px] font-black text-slate-700 leading-snug line-clamp-1">{alert.abnormal_case}</p>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className="flex-grow bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                                        <motion.div 
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${alert.percent_match}%` }}
                                                            transition={{ duration: 1, ease: "easeOut" }}
                                                            className={`h-full ${alert.percent_match > 80 ? 'bg-red-500' : 'bg-orange-500'}`}
                                                        />
                                                    </div>
                                                    <span className={`text-[10px] font-black ${Math.round(parseFloat(alert.percent_match)) > 80 ? 'text-red-500' : 'text-orange-500'}`}>
                                                        {Math.round(parseFloat(alert.percent_match))}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-6 px-3 text-right">
                                                <div className={`w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-300 group-hover:text-primary group-hover:border-primary transition-all group-hover:bg-white shadow-sm ml-auto ${selectedAlert?.id === alert.id ? 'bg-primary text-white border-primary rotate-90' : ''}`}>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                <div className="lg:col-span-5 xl:col-span-4 sticky top-8">
                    <AnimatePresence mode="wait">
                        {selectedAlert ? (
                            <motion.div
                                key={selectedAlert.id}
                                initial={{ x: 30, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: 30, opacity: 0 }}
                                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                                className="bg-primary rounded-3xl sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl shadow-slate-900/20 border border-slate-800 text-white overflow-hidden"
                            >
                                <div className="flex justify-between items-center mb-6 sm:mb-8">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-6 bg-secondary-dark rounded-full"></div>
                                        <h3 className="text-lg sm:text-xl font-black tracking-tight uppercase tracking-widest text-[13px] sm:text-[14px]">System Audit</h3>
                                    </div>
                                    <button onClick={() => setSelectedAlert(null)} className="p-2 hover:bg-white/10 rounded-2xl transition-colors text-white/40 hover:text-white">
                                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="bg-white/5 rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-6 sm:mb-8 border border-white/10 relative group backdrop-blur-md">
                                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-secondary/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    
                                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                                        <div>
                                            <p className="text-[9px] sm:text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">KKS Code</p>
                                            <h4 className="text-xl sm:text-2xl font-black text-secondary tracking-tight truncate max-w-[180px] xs:max-w-none">{selectedAlert.kks}</h4>
                                        </div>
                                        <div className="bg-white/10 p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border border-white/5 shadow-xl flex-shrink-0">
                                             <svg className="w-5 h-5 sm:w-6 sm:h-6 text-secondary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.47 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4 sm:mt-6">
                                        <div className="bg-white/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/5 group/info transition-all hover:bg-white/10">
                                            <p className="text-[9px] sm:text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Point ID</p>
                                            <p className="text-base sm:text-lg text-white font-black">#{selectedAlert.measurement_point}</p>
                                        </div>
                                        <div className="bg-white/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/5 group/info transition-all hover:bg-white/10">
                                            <p className="text-[9px] sm:text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Confidence</p>
                                            <p className="text-base sm:text-lg font-black text-secondary">{Math.round(parseFloat(selectedAlert.percent_match))}%</p>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-6 pt-4 border-t border-white/5">
                                        <p className="text-[9px] sm:text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Final Diagnostic</p>
                                        <p className="text-xl sm:text-2xl md:text-3xl font-extrabold leading-tight sm:leading-relaxed text-secondary-light/90">{selectedAlert.abnormal_case}</p>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h4 className="font-black text-white flex items-center gap-2 uppercase tracking-[0.2em] text-[13px]">
                                            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse shadow-[0_0_8px_rgba(253,199,0,0.6)]"></div>
                                            Verification Trace
                                        </h4>
                                    </div>
                                    <div className="max-h-[320px] sm:max-h-[420px] overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
                                        {renderVerificationTree(selectedAlert.details)}
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="bg-white/5 rounded-3xl sm:rounded-[2.5rem] p-8 sm:p-16 border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-center backdrop-blur-sm group"
                            >
                                <div className="w-16 h-16 sm:w-24 sm:h-24 bg-white/5 rounded-full flex items-center justify-center mb-4 sm:mb-6 text-white/20 group-hover:scale-110 transition-transform duration-500">
                                    <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                                    </svg>
                                </div>
                                <h4 className="text-base sm:text-lg font-black text-white/90 mb-2 uppercase tracking-widest">Analysis Panel</h4>
                                <p className="font-bold text-white/30 text-[9px] sm:text-[10px] max-w-[180px] mx-auto uppercase tracking-widest leading-relaxed">Select a detected anomaly from the log to view its validation chain.</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <AnimatePresence>
                {selectedPopupStep && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
                        onClick={() => setSelectedPopupStep(null)}
                    >
                        <motion.div 
                            initial={{ y: "100%", opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: "100%", opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white w-full max-w-5xl rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh]"
                        >
                            {/* Handle for mobile bottom sheet */}
                            <div className="w-full flex justify-center pt-3 pb-1 sm:hidden">
                                <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
                            </div>

                            <div className="px-5 py-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${selectedPopupStep.isAbnormal ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`}></div>
                                        <h3 className="text-sm sm:text-lg font-black text-primary uppercase tracking-widest truncate">{selectedPopupStep.projectName}</h3>
                                    </div>
                                    <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Diagnostic Profile v{selectedPopupStep.version}</p>
                                </div>
                                <button 
                                    onClick={() => setSelectedPopupStep(null)}
                                    className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-primary transition-all ml-4"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            
                            <div className="p-4 sm:p-8 flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center">
                                {/* Navigation for AE / PCA / VAE */}
                                <div className="flex gap-2 sm:gap-3 mb-6 sm:mb-8 w-full max-w-3xl justify-center">
                                    {['ae', 'pca', 'vae'].map(type => {
                                        const res = selectedPopupStep.results[type];
                                        if (!res) return null;
                                        const isActive = activePlotMethod === type;
                                        const isNormal = res.detection?.toLowerCase().includes('normal');
                                        return (
                                            <button 
                                                key={type}
                                                onClick={() => setActivePlotMethod(type)}
                                                className={`flex-1 py-3 px-2 sm:px-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center min-w-0 ${
                                                    isActive 
                                                        ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20 scale-[1.05]' 
                                                        : 'border-slate-100 bg-white text-slate-400 hover:border-primary/20 hover:bg-slate-50'
                                                }`}
                                            >
                                                <span className={`text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] mb-1 ${isActive ? 'text-white' : 'text-slate-400'}`}>{type}</span>
                                                <div className={`text-[8px] sm:text-[10px] font-black px-2 py-0.5 rounded-full uppercase truncate ${
                                                    isActive 
                                                        ? 'bg-white/20 text-white' 
                                                        : isNormal ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                                }`}>
                                                    {res.detection || 'NIL'}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Status Details Cards */}
                                {selectedPopupStep.results[activePlotMethod] && (
                                    <div className="w-full max-w-4xl grid grid-cols-2 gap-3 sm:gap-6 mb-6 sm:mb-8">
                                        <div className="bg-slate-50 p-4 sm:p-6 rounded-[1.5rem] border border-slate-100 flex flex-col">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
                                                <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest">MSE</span>
                                            </div>
                                            <span className="text-base sm:text-2xl font-black text-primary tabular-nums break-all">
                                                {typeof selectedPopupStep.results[activePlotMethod].mse === 'number' 
                                                    ? (selectedPopupStep.results[activePlotMethod].mse > 0.0001 
                                                        ? selectedPopupStep.results[activePlotMethod].mse.toFixed(6) 
                                                        : selectedPopupStep.results[activePlotMethod].mse.toExponential(3)) 
                                                    : 'N/A'}
                                            </span>
                                        </div>
                                        <div className="bg-slate-50 p-4 sm:p-6 rounded-[1.5rem] border border-slate-100 flex flex-col">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                                <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest">Threshold</span>
                                            </div>
                                            <span className="text-base sm:text-2xl font-black text-slate-600 tabular-nums break-all">
                                                {typeof selectedPopupStep.results[activePlotMethod].threshold === 'number' 
                                                    ? selectedPopupStep.results[activePlotMethod].threshold.toFixed(6) 
                                                    : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Plot Container */}
                                {selectedPopupStep.results[activePlotMethod]?.psd_pair && Array.isArray(selectedPopupStep.results[activePlotMethod].psd_pair[0]) ? (
                                    <div className="w-full max-w-4xl bg-white rounded-[2rem] border border-slate-100 p-2 sm:p-4 shadow-xl shadow-slate-200/50 flex flex-col group relative">
                                        {/* Chart Overlay info for mobile */}
                                        <div className="absolute top-6 left-6 z-10 hidden sm:block">
                                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Spectral Power Distribution</p>
                                        </div>

                                        <div className="w-full h-[300px] sm:h-[450px]">
                                            <Plot
                                                data={(() => {
                                                    const res = selectedPopupStep.results[activePlotMethod];
                                                    const psd = res?.psd_pair || [[], [], []];
                                                    const freqs = psd[0] || [];
                                                    const actual = psd[1] || [];
                                                    const recon = psd[2] || [];
                                                    const mType = selectedPopupStep.measurement_type?.toLowerCase();
                                                    const correction = mType === 'vibration' ? 19.833 : 93.979;

                                                    // Filter up to 10kHz for better visualization
                                                    const filteredIndices = freqs.map((f, i) => f <= 10000 ? i : -1).filter(i => i !== -1);
                                                    const x = filteredIndices.map(i => freqs[i]);
                                                    const yActual = filteredIndices.map(i => {
                                                        const v = actual[i] || 0;
                                                        return 10 * Math.log10(v + 1e-12) + correction;
                                                    });
                                                    const yRecon = filteredIndices.map(i => {
                                                        const v = recon[i] || 0;
                                                        return 10 * Math.log10(v + 1e-12) + correction;
                                                    });

                                                    return [
                                                        {
                                                            x: x,
                                                            y: yActual,
                                                            type: 'scatter',
                                                            mode: 'lines',
                                                            name: 'Actual Signal',
                                                            line: { color: 'rgba(148, 163, 184, 0.3)', width: 2, shape: 'spline', smoothing: 1.3 },
                                                            hovertemplate: '<b>%{y:.1f} dB</b> at %{x} Hz <extra></extra>'
                                                        },
                                                        {
                                                            x: x,
                                                            y: yRecon,
                                                            type: 'scatter',
                                                            mode: 'lines',
                                                            name: 'Model Reconstruct',
                                                            line: { color: '#1e3a8a', width: 3, shape: 'spline', smoothing: 1.3 },
                                                            hovertemplate: '<b>%{y:.1f} dB</b> (pred) <extra></extra>'
                                                        }
                                                    ];
                                                })()}
                                                    layout={{
                                                        autosize: true,
                                                        margin: { l: 45, r: 15, t: 30, b: 60 },
                                                        paper_bgcolor: 'transparent',
                                                        plot_bgcolor: 'transparent',
                                                        font: { family: 'Inter, sans-serif' },
                                                        xaxis: { 
                                                            gridcolor: 'rgba(0,0,0,0.03)', 
                                                            tickfont: { size: 10, color: '#94a3b8', weight: 'bold' },
                                                            title: { text: 'FREQUENCY (Hz)', font: { size: 9, color: '#94a3b8', weight: 'black' }, standoff: 20 },
                                                            range: [0, 10000],
                                                            zeroline: false,
                                                            fixedrange: true,
                                                            linecolor: 'rgba(0,0,0,0.05)'
                                                        },
                                                        yaxis: { 
                                                            type: 'linear',
                                                            gridcolor: 'rgba(0,0,0,0.03)', 
                                                            tickfont: { size: 10, color: '#94a3b8', weight: 'bold' },
                                                            title: { 
                                                                text: selectedPopupStep.measurement_type?.toLowerCase() === 'vibration' 
                                                                    ? 'PSD [dB re (m/s²)²/Hz]' 
                                                                    : 'PSD [dB re (20µPa)²/Hz]', 
                                                                font: { size: 9, color: '#94a3b8', weight: 'black' }, 
                                                                standoff: 20 
                                                            },
                                                            zeroline: false,
                                                            fixedrange: true,
                                                            linecolor: 'rgba(0,0,0,0.05)'
                                                        },
                                                        legend: { 
                                                            orientation: 'h', 
                                                            y: -0.3, 
                                                            x: 0.5,
                                                            xanchor: 'center',
                                                            font: { size: 10, color: '#64748b', weight: 'bold' },
                                                            bgcolor: 'rgba(255,255,255,0.8)'
                                                        },
                                                        hovermode: 'x unified',
                                                        hoverlabel: {
                                                            bgcolor: '#1e293b',
                                                            font: { color: '#fff', size: 12, family: 'Inter' },
                                                            bordercolor: 'transparent'
                                                        }
                                                    }}
                                                style={{ width: '100%', height: '100%' }}
                                                useResizeHandler={true}
                                                config={{ displayModeBar: false, responsive: true }}
                                            />
                                        </div>

                                        <div className="px-4 pb-4 flex items-center justify-between">
                                            <div className="flex gap-4">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-3 h-0.5 bg-slate-200"></div>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Input</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-3 h-0.5 bg-primary"></div>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Recon</span>
                                                </div>
                                            </div>
                                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest hidden sm:block">Neural Spectral Analysis</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full h-64 flex flex-col items-center justify-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 p-8 text-center">
                                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                        </div>
                                        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Spectral Data Missing</p>
                                        <p className="text-xs text-slate-300 mt-2">The model did not return PSD coefficients for this prediction.</p>
                                    </div>
                                )}

                                {/* Footer Note */}
                                <div className="mt-8 mb-4 flex items-center gap-3 px-6 py-3 bg-blue-50/50 rounded-2xl border border-blue-100/50 max-w-2xl text-center">
                                    <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                                    <p className="text-[10px] sm:text-xs font-bold text-blue-600/70 leading-relaxed uppercase">
                                        This spectral comparison visualizes how closely the neural network was able to reconstruct the input vibration pattern. High discrepancies (MSE) indicate potential mechanical anomalies.
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}} />
        </div>
    );
}

export default DashboardPage;
