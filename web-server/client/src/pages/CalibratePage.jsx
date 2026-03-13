import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlert } from '../context/AlertContext';
import apiClient from '../config/axios';
import { jwtDecode } from 'jwt-decode';
import { clearUserData } from '../config/auth';


const STEPS = [
    { id: 1, title: 'Hardware Config', icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z' },
    { id: 2, title: 'Sensor Settings', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 3, title: 'Live Calibration', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' },
    { id: 4, title: 'Finalize', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' }
];

export default function CalibratePage() {
    const navigate = useNavigate();
    const Swal = useAlert();

    const logout = useCallback(() => {
        clearUserData();
        navigate('/login');
    }, [navigate]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            logout();
            return;
        }
        try {
            const decoded = jwtDecode(token);
            if (decoded.exp < Date.now() / 1000) {
                logout();
            }
        } catch (e) {
            logout();
        }
    }, [logout]);

    
    const [currentStep, setCurrentStep] = useState(1);
    const [activeTab, setActiveTab] = useState('vibration');
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [isAutoCalibrating, setIsAutoCalibrating] = useState(false); 
    const [autoCalibRef, setAutoCalibRef] = useState(activeTab === 'vibration' ? '1.0' : '94.0');
    const [autoCalibCountdown, setAutoCalibCountdown] = useState(0);
    
    // Refs for non-UI/High-frequency data
    const rawRmsBufferRef = useRef([]);
    const isAutoCalibratingRef = useRef(false); 
    const activeTabRef = useRef(activeTab); 
    
    // Input Selection & Gain
    const [mediaDevices, setMediaDevices] = useState([]);
    const [selectedMediaId, setSelectedMediaId] = useState(localStorage.getItem('calib_device_id') || '');
    const [dbDevices, setDbDevices] = useState([]);
    const [selectedDbDeviceId, setSelectedDbDeviceId] = useState(localStorage.getItem('calib_db_device_id') || '');
    const [micGain, setMicGain] = useState(parseFloat(localStorage.getItem('calib_mic_gain')) || 1.0);
    const gainNodeRef = useRef(null);
    
    // Form state
    const [vibrationConfig, setVibrationConfig] = useState({
        sensitivity: localStorage.getItem('calib_vib_sens') || '100.0',
        offset: localStorage.getItem('calib_vib_off') || '0.0',
    });
    
    const [soundConfig, setSoundConfig] = useState({
        sensitivity: localStorage.getItem('calib_snd_sens') || '100.0',
        offset: localStorage.getItem('calib_snd_off') || '0.0',
    });

    const streamRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserTimeRef = useRef(null);
    const dataArrayTimeRef = useRef(null);
    const canvasTimeRef = useRef(null);
    const animationFrameIdTimeRef = useRef(null);
    const analyserFreqRef = useRef(null);
    const dataArrayFreqRef = useRef(null);
    const canvasFreqRef = useRef(null);
    const animationFrameIdFreqRef = useRef(null);
    const processMetricsIntervalRef = useRef(null);
    
    // Auto-scale State (Refs for smooth animation)
    const timeScaleRef = useRef(0.1); 
    const freqMaxLinearRef = useRef(0.01); // Standardized to linear units
    const SAMPLE_RATE = 48000;
    const FREQ_LIMIT = 3000; // 10kHz limit

    useEffect(() => {
        setAutoCalibRef(activeTab === 'vibration' ? '1.0' : '94.0');
        activeTabRef.current = activeTab;
    }, [activeTab]);

    const refreshDevices = async () => {
        try {
            const devs = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devs.filter(d => d.kind === 'audioinput');
            setMediaDevices(audioInputs);
            
            if (audioInputs.length > 0 && !selectedMediaId) {
                setSelectedMediaId(audioInputs[0].deviceId);
            }

            const response = await apiClient.get('/api/devices', {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setDbDevices(response.data);
        } catch (err) {
            console.error('Error fetching devices:', err);
        }
    };

    useEffect(() => {
        refreshDevices();
        navigator.mediaDevices.ondevicechange = refreshDevices;
        return () => { navigator.mediaDevices.ondevicechange = null; };
    }, []);


    useEffect(() => {
        localStorage.setItem('calib_db_device_id', selectedDbDeviceId);
    }, [selectedDbDeviceId]);

    useEffect(() => {
        const handleExitEvent = () => {
            stopMonitoring();
        };
        window.addEventListener('egat:exit', handleExitEvent);
        return () => {
            window.removeEventListener('egat:exit', handleExitEvent);
            stopMonitoring(); // Global fallback
        };
    }, []);

    const handleDbDeviceChange = (e) => {
        const id = e.target.value;
        setSelectedDbDeviceId(id);
        const device = dbDevices.find(d => d.id.toString() === id);
        if (device) {
            const gain = activeTab === 'vibration' ? device.device_gain_vibration : device.device_gain_sound;
            setMicGain(parseFloat(gain));
        }
    };

    // Auto-update gain when switching tabs if a device is linked
    useEffect(() => {
        if (selectedDbDeviceId) {
            const device = dbDevices.find(d => d.id.toString() === selectedDbDeviceId);
            if (device) {
                const gain = activeTab === 'vibration' ? device.device_gain_vibration : device.device_gain_sound;
                setMicGain(parseFloat(gain));
            }
        }
    }, [activeTab, selectedDbDeviceId, dbDevices]);

    const handleAutoCalibrate = async () => {
        if (!isMonitoring) {
            Swal.fire({ title: 'Monitor Required', text: 'Start Live Monitor first.', icon: 'warning' });
            return;
        }

        setIsAutoCalibrating(true);
        isAutoCalibratingRef.current = true;
        setAutoCalibCountdown(5);
        rawRmsBufferRef.current = [];

        const countdownInterval = setInterval(() => {
            setAutoCalibCountdown(prev => prev <= 1 ? 0 : prev - 1);
        }, 1000);

        setTimeout(() => {
            clearInterval(countdownInterval);
            setIsAutoCalibrating(false);
            isAutoCalibratingRef.current = false;
            
            const currentBuffer = rawRmsBufferRef.current;
            if (currentBuffer.length === 0) return;

            const avgRawRms = currentBuffer.reduce((a, b) => a + b, 0) / currentBuffer.length;
            const refVal = parseFloat(autoCalibRef);
            const currentGain = micGain || 1.0;
            const sens = activeTabRef.current === 'vibration' ? parseFloat(vibrationConfig.sensitivity) || 1 : parseFloat(soundConfig.sensitivity) || 1;

            let newGain = 1.0;
            if (activeTabRef.current === 'vibration') {
                newGain = currentGain * (refVal * sens) / (avgRawRms * 1000);
            } else {
                const pRef = 2e-5;
                const targetPa = Math.pow(10, refVal / 20) * pRef;
                newGain = currentGain * ((targetPa * sens) / 1000) / avgRawRms;
            }

            if (newGain > 100) {
                Swal.fire('Limit Exceeded', 'Gain calculation unstable (>100x).', 'error');
                return;
            }

            setMicGain(parseFloat(newGain.toFixed(4)));
            Swal.fire({
                title: 'Calibration Success',
                html: `Optimized Gain: <b>x${newGain.toFixed(4)}</b>`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
            setCurrentStep(4);
        }, 5000);
    };

    const handleSave = async () => {


        if (selectedDbDeviceId) {
            try {
                const updateData = {};
                if (activeTab === 'vibration') {
                    updateData.device_gain_vibration = micGain;
                } else {
                    updateData.device_gain_sound = micGain;
                }

                await apiClient.put(`/api/devices/${selectedDbDeviceId}`, updateData, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                
                // Refresh local device list to reflect changes
                refreshDevices();
            } catch (error) {
                console.error('Save failed:', error);
            }
        }

        Swal.fire({
            title: 'Config Exported',
            text: 'Device gain has been updated in the master database.',
            icon: 'success',
            confirmButtonColor: '#4f46e5'
        }).then(() => logout());
    };

    const drawTimeDomainPlot = useCallback(() => {
        const canvas = canvasTimeRef.current;
        if (!canvas || !analyserTimeRef.current || !dataArrayTimeRef.current || !isMonitoring) return;
        
        if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
        if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
        
        const ctx = canvas.getContext("2d");
        const data = dataArrayTimeRef.current;
        const W = canvas.width;
        const H = canvas.height;
        
        animationFrameIdTimeRef.current = requestAnimationFrame(drawTimeDomainPlot);
        analyserTimeRef.current.getFloatTimeDomainData(data);
        
        // --- Trigger Logic (Zero-crossing) ---
        let triggerIndex = 0;
        const triggerLevel = 0.01; // Slight offset to avoid noise triggering
        for (let i = 1; i < data.length / 2; i++) {
            if (data[i - 1] < triggerLevel && data[i] >= triggerLevel) {
                triggerIndex = i;
                break;
            }
        }
        // Slice the data starting from trigger point for stability
        const displayData = data.slice(triggerIndex, triggerIndex + data.length / 2);
        
        // --- Auto Scale Logic (Time) ---
        let framePeak = 0;
        for(let i=0; i<displayData.length; i++) {
            const abs = Math.abs(displayData[i]);
            if(abs > framePeak) framePeak = abs;
        }
        
        // Fast attack (0.2), Slow decay (0.02)
        const targetScale = Math.max(0.005, framePeak * 1.5); // at least 5mV floor
        const speed = targetScale > timeScaleRef.current ? 0.2 : 0.02;
        timeScaleRef.current += (targetScale - timeScaleRef.current) * speed;
        const currentYScale = timeScaleRef.current;

        // Clear with background
        ctx.fillStyle = "#0f172a"; 
        ctx.fillRect(0, 0, W, H);
        
        // Draw Grid
        ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
        ctx.lineWidth = 1;
        
        const gridLines = 4;
        for (let i = 0; i <= gridLines; i++) {
            const y = (i / gridLines) * H;
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        
        for (let i = 1; i < 10; i++) {
            const x = (i / 10) * W;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }

        const slice = W / displayData.length;
        const accentColor = activeTab === 'vibration' ? "#3b82f6" : "#0891b2";
        const baseColor = activeTab === 'vibration' ? "rgba(59, 130, 246, 0.1)" : "rgba(8, 145, 178, 0.1)";

        // Neon Glow Effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = accentColor;

        // Waveform Path
        ctx.beginPath();
        for (let i = 0; i < displayData.length; i++) {
            const x = i * slice;
            // Map displayData (-currentYScale to currentYScale) to (0 to H)
            const y = (0.5 - (displayData[i] / (currentYScale * 2))) * H;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        // Remove glow for fill and grid
        ctx.shadowBlur = 0;

        // Fill under the line (Gradient)
        const gradient = ctx.createLinearGradient(0, 0, 0, H);
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(0.5, "rgba(0,0,0,0)");
        gradient.addColorStop(1, baseColor);
        
        ctx.lineTo(W, H/2);
        ctx.lineTo(0, H/2);
        ctx.fillStyle = gradient;
        ctx.fill();






    }, [isMonitoring, activeTab]);

    const drawFreqPlot = useCallback(() => {
        const canvas = canvasFreqRef.current;
        if (!canvas || !analyserFreqRef.current || !dataArrayFreqRef.current || !isMonitoring) return;

        if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
        if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;

        const ctx = canvas.getContext("2d");
        const data = dataArrayFreqRef.current;
        const W = canvas.width;
        const H = canvas.height;
        
        animationFrameIdFreqRef.current = requestAnimationFrame(drawFreqPlot);
        analyserFreqRef.current.getFloatFrequencyData(data);
        
        const nyquist = SAMPLE_RATE / 2;
        const totalBins = data.length;
        const limitBin = Math.floor((FREQ_LIMIT / nyquist) * totalBins);
        
        // --- Auto Scale Logic (Linear FFT) ---
        let frameMaxLinear = 0.0001;
        for(let i=0; i<limitBin; i++) {
            // Convert dB to Linear: 10^(dB/20)
            const linearVal = Math.pow(10, data[i] / 20);
            if(linearVal > frameMaxLinear) frameMaxLinear = linearVal;
        }
        
        const targetMax = Math.max(0.001, frameMaxLinear * 1.2);
        // Smoothed linear scaling
        freqMaxLinearRef.current += (targetMax - freqMaxLinearRef.current) * 0.1;
        const currentMax = freqMaxLinearRef.current;

        ctx.fillStyle = "#0f172a"; 
        ctx.fillRect(0, 0, W, H);

        // Grid & Labels
        ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
        ctx.lineWidth = 1;

        // Vertical Grid (Hz)
        const hzSteps = 10;
        for (let i = 0; i <= hzSteps; i++) {
            const x = (i / hzSteps) * W;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            ctx.fillStyle = "rgba(148, 163, 184, 0.3)";
            ctx.font = "8px Inter";
        }

        // Horizontal Grid (Linear Amplitude)
        for (let i = 0; i <= 4; i++) {
            const y = (i / 4) * H;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        const barW = W / limitBin;
        const accentColor = activeTab === 'vibration' ? "#3b82f6" : "#0891b2";
        
        // Neon Glow Effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = accentColor;
        
        ctx.fillStyle = accentColor;
        for (let i = 0; i < limitBin; i++) {
            const linearVal = Math.pow(10, data[i] / 20);
            const normalized = linearVal / currentMax;
            const h = Math.max(0, normalized * H);
            
            // Draw bar with slight vertical gradient
            const barGradient = ctx.createLinearGradient(0, H - h, 0, H);
            barGradient.addColorStop(0, accentColor);
            barGradient.addColorStop(1, activeTab === 'vibration' ? "rgba(59, 130, 246, 0.3)" : "rgba(8, 145, 178, 0.3)");
            
            ctx.fillStyle = barGradient;
            ctx.fillRect(i * barW, H - h, barW - 1, h);
        }
        
        ctx.shadowBlur = 0; // Reset for next frame
    }, [isMonitoring, activeTab]);

    useEffect(() => {
        if (isMonitoring && currentStep === 3) {
            drawTimeDomainPlot();
            drawFreqPlot();
        }
        return () => {
            cancelAnimationFrame(animationFrameIdTimeRef.current);
            cancelAnimationFrame(animationFrameIdFreqRef.current);
        };
    }, [isMonitoring, currentStep, drawTimeDomainPlot, drawFreqPlot]);

    const calculateMetrics = () => {
        if (!analyserTimeRef.current || !dataArrayTimeRef.current) return;
        const data = dataArrayTimeRef.current;
        analyserTimeRef.current.getFloatTimeDomainData(data);
        
        if (isAutoCalibratingRef.current) {
            let sumSq = 0;
            for (let i = 0; i < data.length; i++) {
                const v = data[i];
                sumSq += v * v;
            }
            const rawRms = Math.sqrt(sumSq / data.length);
            rawRmsBufferRef.current.push(rawRms);
        }
    };

    // Auto-start monitoring when entering Step 3
    useEffect(() => {
        if (currentStep === 3 && !isMonitoring) {
            startMonitoring();
        } else if (currentStep !== 3 && isMonitoring) {
            stopMonitoring();
        }
    }, [currentStep]);

    const startMonitoring = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { deviceId: selectedMediaId ? { exact: selectedMediaId } : undefined, autoGainControl: false, noiseSuppression: false, echoCancellation: false } 
            });
            streamRef.current = stream;
            audioContextRef.current = new AudioContext({ sampleRate: 48000 });
            const source = audioContextRef.current.createMediaStreamSource(stream);
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.gain.value = micGain;
            analyserTimeRef.current = audioContextRef.current.createAnalyser();
            analyserTimeRef.current.fftSize = 8192;
            dataArrayTimeRef.current = new Float32Array(analyserTimeRef.current.frequencyBinCount);
            analyserFreqRef.current = audioContextRef.current.createAnalyser();
            analyserFreqRef.current.fftSize = 4096;
            dataArrayFreqRef.current = new Float32Array(analyserFreqRef.current.frequencyBinCount);
            source.connect(gainNodeRef.current);
            gainNodeRef.current.connect(analyserTimeRef.current);
            gainNodeRef.current.connect(analyserFreqRef.current);
            setIsMonitoring(true);
            processMetricsIntervalRef.current = setInterval(calculateMetrics, 100);
        } catch (err) {
            Swal.fire('Hardware Error', 'Could not access the selected input device.', 'error');
        }
    };

    const stopMonitoring = () => {
        setIsMonitoring(false);
        if (processMetricsIntervalRef.current) clearInterval(processMetricsIntervalRef.current);
        cancelAnimationFrame(animationFrameIdTimeRef.current);
        cancelAnimationFrame(animationFrameIdFreqRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (audioContextRef.current) audioContextRef.current.close();
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center">
            {/* Professional Header */}

            <main className="w-full max-w-4xl p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">
                {/* Stepper */}
                <div className="flex items-center justify-between bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100">
                    {STEPS.map((step, idx) => (
                        <React.Fragment key={step.id}>
                            <div className="flex flex-col items-center gap-2 sm:gap-3 relative px-1 sm:px-4">
                                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-500 ${
                                    currentStep >= step.id ? 'bg-primary text-white shadow-lg' : 'bg-slate-100 text-slate-400'
                                }`}>
                                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={step.icon} /></svg>
                                </div>
                                <span className={`text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-center max-w-[60px] sm:max-w-none ${currentStep >= step.id ? 'text-primary' : 'text-slate-400'}`}>
                                    {step.title.split(' ')[0]}<span className="hidden sm:inline"> {step.title.split(' ').slice(1).join(' ')}</span>
                                </span>
                            </div>
                            {idx < STEPS.length - 1 && <div className={`flex-1 h-0.5 rounded-full mx-1 sm:mx-2 ${currentStep > step.id ? 'bg-primary' : 'bg-slate-100'}`}></div>}
                        </React.Fragment>
                    ))}
                </div>

                <div className="w-full max-w-4xl mx-auto">
                    <div className="flex flex-col gap-6 sm:gap-8 min-w-0">
                        <AnimatePresence mode="wait">
                            {currentStep === 1 && (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 border border-slate-100 shadow-xl shadow-slate-200/20">
                                    <div className="mb-6 sm:mb-8">
                                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">System Configuration</h2>
                                        <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">Bind physical sensors to the master device database.</p>
                                    </div>
                                        <div className="space-y-6 sm:space-y-8">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-primary">Device</label>
                                            <select value={selectedDbDeviceId} onChange={handleDbDeviceChange} className="w-full h-14 sm:h-16 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl px-4 sm:px-6 font-bold text-slate-900 focus:bg-white focus:border-primary transition-all outline-none appearance-none text-xs sm:text-sm">
                                                <option value="">Select Target Device...</option>
                                                {dbDevices.map(d => (
                                                    <option key={d.id} value={d.id}>
                                                        {d.device_name} (Vib: x{parseFloat(d.device_gain_vibration).toFixed(2)}, Snd: x{parseFloat(d.device_gain_sound).toFixed(2)})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-primary">Hardware Input</label>
                                            <select value={selectedMediaId} onChange={(e) => setSelectedMediaId(e.target.value)} className="w-full h-14 sm:h-16 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl px-4 sm:px-6 font-bold text-slate-900 focus:bg-white focus:border-primary transition-all outline-none appearance-none text-xs sm:text-sm">
                                                {mediaDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Standard Mic Input'}</option>)}
                                            </select>
                                        </div>
                                        <button onClick={() => setCurrentStep(2)} disabled={!selectedDbDeviceId} className="w-full h-14 sm:h-16 bg-primary text-white rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-primary-dark transition-all disabled:opacity-30">Next</button>
                                    </div>
                                </motion.div>
                            )}

                            {currentStep === 2 && (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 border border-slate-100 shadow-xl shadow-slate-200/20">
                                    <div className="mb-6 sm:mb-8">
                                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Environmental Constants</h2>
                                        <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">Define the sensor's electronic characteristics.</p>
                                    </div>
                                    <div className="flex gap-2 sm:gap-4 p-1.5 sm:p-2 bg-slate-100 rounded-2xl mb-6 sm:mb-8">
                                        {['vibration', 'sound'].map(t => (
                                            <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-3 sm:py-4 rounded-xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] transition-all ${activeTab === t ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-8">
                                        {[100.0, 10.0].map(val => (
                                            <button 
                                                key={val} 
                                                onClick={() => {
                                                    if (activeTab === 'vibration') {
                                                        setVibrationConfig({...vibrationConfig, sensitivity: val.toFixed(1)});
                                                    } else {
                                                        setSoundConfig({...soundConfig, sensitivity: val.toFixed(1)});
                                                    }
                                                }} 
                                                className={`h-20 sm:h-24 rounded-[1.25rem] sm:rounded-[1.5rem] border-2 flex flex-col items-center justify-center transition-all ${
                                                    (activeTab === 'vibration' ? parseFloat(vibrationConfig.sensitivity) : parseFloat(soundConfig.sensitivity)) === val 
                                                        ? 'bg-primary/5 border-primary text-primary shadow-lg' 
                                                        : 'bg-white border-slate-100 text-slate-400'
                                                }`}
                                            >
                                                <span className="text-xl sm:text-2xl font-black leading-none">{val}</span>
                                                <span className="text-[9px] sm:text-[10px] font-bold uppercase mt-1">{activeTab === 'vibration' ? 'mV/g' : 'mV/Pa'}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button onClick={() => setCurrentStep(3)} className="w-full h-14 sm:h-16 bg-primary text-white rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-primary-dark transition-all">Next</button>
                                </motion.div>
                            )}

                            {currentStep === 3 && (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-6 border border-slate-100 shadow-xl shadow-slate-200/20">
                                    <div className="flex items-center justify-between mb-4 sm:mb-6 px-2 sm:px-4">
                                        <div>
                                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Signal Analysis</h2>
                                            <p className="text-slate-500 text-xs sm:text-sm font-medium">Real-time Plot</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-4 sm:gap-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="h-40 sm:h-48 bg-slate-900 rounded-[1.25rem] sm:rounded-[1.5rem] overflow-hidden relative border border-slate-800">                                                <canvas ref={canvasTimeRef} className="w-full h-full" />
                                            </div>
                                            <div className="h-40 sm:h-48 bg-slate-900 rounded-[1.25rem] sm:rounded-[1.5rem] overflow-hidden relative border border-slate-800">
                                                <canvas ref={canvasFreqRef} className="w-full h-full" />
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-slate-100">
                                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 sm:gap-0 mb-6">
                                                <div className="flex items-center gap-3">
                                                    <div>
                                                        <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest block">Reference Value</span>
                                                        <div className="flex items-center">
                                                            <input type="number" step="0.1" value={autoCalibRef} onChange={e => setAutoCalibRef(e.target.value)} className="bg-transparent text-xl font-black text-slate-900 outline-none w-20 sm:w-24" />
                                                            <span className="text-xs font-bold text-slate-400 ml-1">{activeTab === 'vibration' ? 'm/s²' : 'dB'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button disabled={!isMonitoring || isAutoCalibrating} onClick={handleAutoCalibrate} className={`w-full sm:w-auto h-12 sm:h-14 px-8 sm:px-10 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-xs transition-all ${isAutoCalibrating ? 'bg-primary/10 text-primary/40 animate-pulse' : 'bg-primary text-white shadow-lg shadow-primary/30 active:scale-95'}`}>
                                                    {isAutoCalibrating ? `Calibrating... (${autoCalibCountdown}s)` : 'Calibrate'}
                                                </button>
                                            </div>
                                            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <motion.div initial={{ width: 0 }} animate={{ width: isAutoCalibrating ? '100%' : '0%' }} transition={{ duration: 5, ease: "linear" }} className="h-full bg-primary" />
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {currentStep === 4 && (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 border border-slate-100 shadow-xl shadow-slate-200/20 text-center">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-50 text-emerald-500 rounded-2.5xl sm:rounded-3xl flex items-center justify-center mx-auto mb-6">
                                        <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Calibration Complete</h2>
                                    <p className="text-slate-500 text-sm sm:text-base font-medium max-w-sm mx-auto mt-2">New gain calibration has been established and verified for the standard measurement range.</p>
                                                                        <div className="my-8 sm:my-10 p-5 sm:p-6 bg-slate-50 rounded-2xl sm:rounded-3xl border border-slate-100 grid grid-cols-2 gap-4">
                                        <div className="text-left">
                                            <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculated Gain</span>
                                            <p className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">x{micGain.toFixed(4)}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 sm:gap-4">
                                        <button onClick={() => setCurrentStep(3)} className="flex-1 h-14 sm:h-16 bg-slate-100 text-slate-600 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-xs">Re-Calibrate</button>
                                        <button onClick={handleSave} className="flex-[2] h-14 sm:h-16 bg-primary text-white rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-xs shadow-lg shadow-primary/30">Save to Database</button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </main>
        </div>
    );
}