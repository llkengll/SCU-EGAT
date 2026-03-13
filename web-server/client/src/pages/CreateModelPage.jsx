import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import apiClient from '../config/axios';
import { jwtDecode } from 'jwt-decode';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlert } from '../context/AlertContext';
import { API_ENDPOINTS } from '../config/api';
import Plot from 'react-plotly.js';
import { clearUserData } from '../config/auth';



const FileCard = React.memo(({ file, onToggle }) => (
    <div 
        onClick={() => onToggle(file.filename)}
        className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer group ${
            file.selected 
                ? 'bg-white border-primary shadow-md ring-4 ring-primary/5' 
                : 'bg-slate-50 border-slate-100 hover:border-slate-200'
        }`}
    >
        <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center transition-all ${
                file.selected ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-400'
            }`}>
                {file.selected ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                    </svg>
                ) : (
                    <span className="text-[10px] font-black">PT{file.point}</span>
                )}
            </div>
            <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-700">Repetition {file.repeat}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${file.selected ? 'bg-primary' : 'bg-slate-300'}`} />
                </div>
                <span className="text-[10px] text-slate-400 font-bold truncate max-w-[140px] uppercase tracking-tighter">{file.filename}</span>
            </div>
        </div>
        <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
            file.status === 'success' ? 'text-emerald-500 bg-emerald-50 border-emerald-100' : 'text-amber-500 bg-amber-50 border-amber-100'
        }`}>
            {file.status === 'success' ? 'UL' : 'RDY'}
        </div>
    </div>
));


function CreateModelPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const Swal = useAlert();
    const { formData, measurementMode, modelName, trainDataCount, modelConfigs, selectedDevice } = location.state || {};

    const username = localStorage.getItem('username') || 'User';
    const totalPoints = parseInt(formData?.measurementPoint) || 1;
    const recordingDuration = parseInt(formData?.measurementTime) || 10;
    const recordingsPerPoint = parseInt(trainDataCount) || 30;
    const totalRecordings = totalPoints * recordingsPerPoint;

    // Theme variables (matching VibrationMeasure / Measurement)
    const primaryColor = "bg-primary";
    const secondaryColor = "bg-secondary";
    const textColor = "text-primary";
    const lightBg = "bg-white/40";
    const cardBg = "bg-white/60";
    const borderColor = "border-white/40";

    // ─── State ───
    const [currentPoint, setCurrentPoint] = useState(1);
    const [currentRepeat, setCurrentRepeat] = useState(1);
    const [completedRecordings, setCompletedRecordings] = useState(0);
    const [isRecording, setIsRecording] = useState(false);

    const [remainingTime, setRemainingTime] = useState(recordingDuration);
    const [progress, setProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [sessionLog, setSessionLog] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [bulkUploadProgress, setBulkUploadProgress] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [locationData, setLocationData] = useState({ lat: null, lon: null });
    const [autoMode, setAutoMode] = useState(false);
    const [fileListModal, setFileListModal] = useState({ isOpen: false, point: null, step: 'analysis' });
    const [visualFFTSize, setVisualFFTSize] = useState(2048);
    const [trainingLogs, setTrainingLogs] = useState([]);
    const [isTraining, setIsTraining] = useState(false);
    const [visibleCards, setVisibleCards] = useState(24);
    const terminalEndRef = useRef(null);

    // ─── Refs ───
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioContextRef = useRef(null);
    const streamRef = useRef(null);
    const timerIntervalRef = useRef(null);
    const analyserFreqRef = useRef(null);
    const dataArrayFreqRef = useRef(null);
    const canvasFreqRef = useRef(null);
    const animFrameFreqRef = useRef(null);
    const fftMaxScaleRef = useRef(0.1); // For auto-scaling
    const lastFFTRef = useRef(null);
    const gainNodeRef = useRef(null);
    const analyserTimeRef = useRef(null);
    const dataArrayTimeRef = useRef(null);
    const [liveRMS, setLiveRMS] = useState(0);
    const lastRMSUpdateRef = useRef(0);
    const audioDestinationRef = useRef(null);
    const currentPointRef = useRef(1);
    const currentRepeatRef = useRef(1);
    const completedRef = useRef(0);
    const autoModeRef = useRef(false);
    const isPausedRef = useRef(false);

    useEffect(() => { currentPointRef.current = currentPoint; }, [currentPoint]);
    useEffect(() => { currentRepeatRef.current = currentRepeat; }, [currentRepeat]);
    useEffect(() => { completedRef.current = completedRecordings; }, [completedRecordings]);
    useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    useEffect(() => {
        if (terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [trainingLogs]);

    // ─── Auth & redirect guard ───
    useEffect(() => {
        if (!formData || measurementMode !== 'create_model') { navigate('/'); return; }
        const token = localStorage.getItem('token');
        if (!token) { clearUserData(); navigate('/login'); return; }
        try {
            const decoded = jwtDecode(token);
            if (decoded.exp < Date.now() / 1000) { clearUserData(); navigate('/login'); }
        } catch { clearUserData(); navigate('/login'); }
    }, [formData, measurementMode, navigate]);

    // ─── Geolocation ───
    useEffect(() => {
        navigator.geolocation?.getCurrentPosition(
            (pos) => setLocationData({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => { }
        );
    }, []);

    // ─── WAV encoding ───
    async function decodeBlob(blob) {
        const buf = await blob.arrayBuffer();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const ab = await ctx.decodeAudioData(buf);
        ctx.close?.();
        return ab;
    }

    function encodeWav(audioBuffer) {
        const ch = audioBuffer.numberOfChannels;
        const sr = audioBuffer.sampleRate;
        const len = audioBuffer.length * ch;
        const buffer = new ArrayBuffer(44 + len * 2);
        const v = new DataView(buffer);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };

        w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE');
        w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
        v.setUint16(22, ch, true); v.setUint32(24, sr, true);
        v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
        v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * 2, true);

        let off = 44;
        const chd = [];
        for (let c = 0; c < ch; c++) chd.push(audioBuffer.getChannelData(c));
        for (let i = 0; i < audioBuffer.length; i++) {
            for (let c = 0; c < ch; c++) {
                let s = Math.max(-1, Math.min(1, chd[c][i]));
                v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                off += 2;
            }
        }
        return new Blob([v], { type: 'audio/wav' });
    }

    async function toWav(blob) { return encodeWav(await decodeBlob(blob)); }
    
    async function getFFTFromBlob(blob, specificFFTSize) {
        try {
            const ab = await decodeBlob(blob);
            const size = specificFFTSize || visualFFTSize || 2048;
            const sr = ab.sampleRate;
            const channelData = ab.getChannelData(0);
            
            // Welch-like averaging: Take 6-8 overlapping segments
            const numWindows = 8;
            const skip = Math.floor(ab.length * 0.15); // Skip first/last 15%
            const available = ab.length - 2 * skip;
            if (available < size) return null;

            const step = Math.floor((available - size) / (numWindows - 1 || 1));
            const binCount = size / 2;
            const accumulatedPower = new Float32Array(binCount).fill(0);
            
            for (let i = 0; i < numWindows; i++) {
                const offset = skip + i * step;
                if (offset + size > ab.length) break;
                
                // Temporary context for this segment
                const offline = new OfflineAudioContext(1, size, sr);
                const buf = offline.createBuffer(1, size, sr);
                buf.copyToChannel(channelData.slice(offset, offset + size), 0);
                
                const source = offline.createBufferSource();
                source.buffer = buf;
                const analyser = offline.createAnalyser();
                analyser.fftSize = size;
                analyser.smoothingTimeConstant = 0;
                
                source.connect(analyser);
                analyser.connect(offline.destination);
                source.start(0);
                
                await offline.startRendering();
                const snapshot = new Float32Array(binCount);
                analyser.getFloatFrequencyData(snapshot);
                
                // Average in linear power space
                for (let j = 0; j < binCount; j++) {
                    accumulatedPower[j] += Math.pow(10, snapshot[j] / 10);
                }
            }
            
            // Average and convert back to dB
            for (let j = 0; j < binCount; j++) {
                accumulatedPower[j] = 10 * Math.log10(accumulatedPower[j] / numWindows + 1e-12);
            }
            
            return accumulatedPower;
        } catch (e) {
            console.error("FFT analysis failed:", e);
            return null;
        }
    }

    const calculatePSD = (fft, sr = 48000, targetFreq = 10000) => {
        if (!fft) return null;
        const binWidth = (sr / 2) / fft.length;
        const maxIdx = Math.floor(targetFreq / binWidth);
        const psd = new Float32Array(maxIdx);
        
        // Vibration: 100mV/g base. Sound: 100mV/Pa base.
        // Vibration correction: 10 * log10(9.81^2) = 19.833 (to m/s^2)
        // Sound correction: 20 * log10(1 / 2e-5) = 93.979 (to dB SPL re 20uPa)
        const correctionFactor = formData?.measurementType === 'vibration' ? 19.833 : 93.979;
        
        for (let i = 0; i < maxIdx; i++) {
            // PSD = Power / binWidth. In dB: dB_PSD = fft[i] - 10 * log10(binWidth) + correction
            // PSD = Power / binWidth. In dB: dB_PSD = fft[i] - 10 * Math.log10(binWidth) + correction
            psd[i] = fft[i] - 10 * Math.log10(binWidth + 1e-12) + correctionFactor;
        }
        return psd;
    };

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    // ─── Canvas drawing ───

    const drawFreq = useCallback(() => {
        const c = canvasFreqRef.current;
        if (!c || !analyserFreqRef.current || !dataArrayFreqRef.current) return;
        animFrameFreqRef.current = requestAnimationFrame(drawFreq);

        const ctx = c.getContext('2d');
        const d = dataArrayFreqRef.current;
        analyserFreqRef.current.getFloatFrequencyData(d);
        const W = c.width, H = c.height;
        const sr = audioContextRef.current?.sampleRate || 48000;
        const maxFreqDisplay = 10000; 
        const maxBin = Math.floor((maxFreqDisplay / (sr / 2)) * d.length);

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#F9FAFB'; 
        ctx.fillRect(0, 0, W, H);

        // Auto-scaling Logic
        let frameMax = 0.0001;
        const mags = new Float32Array(maxBin);
        for (let i = 0; i < maxBin; i++) { 
            const m = Math.pow(10, d[i] / 20);
            mags[i] = m;
            if (m > frameMax) frameMax = m;
        }

        // Smooth Peak Decay
        const targetMax = Math.max(0.005, frameMax * 1.25);
        fftMaxScaleRef.current += (targetMax - fftMaxScaleRef.current) * 0.1;
        const currentScale = fftMaxScaleRef.current;

        // Draw Grid Lines
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
        ctx.lineWidth = 1;
        ctx.font = '8px Inter, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';

        // Vertical Frequency Lines
        for (let hz = 0; hz <= 10000; hz += 2000) {
            const x = (hz / 10000) * W;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }

        // Horizontal Amplitude Lines
        for (let i = 1; i < 4; i++) {
            const y = (i / 4) * H;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();

        }

        const bw = W / maxBin;
        for (let i = 0; i < maxBin; i++) {
            const h = Math.min(H, (mags[i] / currentScale) * H);
            
            // Neon Gradient (Primary Theme)
            const gradient = ctx.createLinearGradient(0, H - h, 0, H);
            gradient.addColorStop(0, '#1e3a8a'); // primary
            gradient.addColorStop(1, '#60a5fa'); // secondary-like
            ctx.fillStyle = gradient;
            ctx.fillRect(i * bw, H - h, bw - 0.5, h);
        }

        // Visual distinction for labels
        ctx.strokeStyle = 'rgba(30, 58, 138, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, 0, W, H);

            // --- Live Metrics Update (RMS) ---
            if (analyserTimeRef.current && dataArrayTimeRef.current) {
                const timeData = dataArrayTimeRef.current;
                analyserTimeRef.current.getFloatTimeDomainData(timeData);
                
                let sumSquared = 0;
                for (let i = 0; i < timeData.length; i++) {
                    sumSquared += timeData[i] * timeData[i];
                }
                const rmsValue = Math.sqrt(sumSquared / timeData.length);
                
                let displayValue = 0;
                if (formData?.measurementType === 'vibration') {
                    displayValue = rmsValue * 9.81; // m/s^2
                } else {
                    // Sound: dB calculation
                    const pRef = 2e-5;
                    // Since gainNode already applied (100 / sens) * hwGain,
                    // our digital signal is now normalized to the 100 mV/Pa standard.
                    displayValue = 20 * Math.log10(Math.max(1e-12, (rmsValue * 1000) / 100.0) / pRef);
                }
                
                // Only update the state every 120ms to reduce flicker
                const now = Date.now();
                if (now - lastRMSUpdateRef.current > 120) {
                    setLiveRMS(displayValue);
                    lastRMSUpdateRef.current = now;
                }
            }
    }, []);

    // ─── Audio pipeline ───
    const initAudio = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false }
            });
            streamRef.current = stream;
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const src = audioContextRef.current.createMediaStreamSource(stream);

            analyserFreqRef.current = audioContextRef.current.createAnalyser();
            analyserFreqRef.current.fftSize = 2048;
            dataArrayFreqRef.current = new Float32Array(analyserFreqRef.current.frequencyBinCount);

            analyserTimeRef.current = audioContextRef.current.createAnalyser();
            analyserTimeRef.current.fftSize = 2048;
            dataArrayTimeRef.current = new Float32Array(analyserTimeRef.current.fftSize);

            // Apply Hardware Gain and Sensitivity (Reference: 100 mV/g or 100 mV/Pa)
            gainNodeRef.current = audioContextRef.current.createGain();
            const hwGain = formData?.measurementType === 'vibration' 
                ? parseFloat(selectedDevice?.device_gain_vibration || 1.0)
                : parseFloat(selectedDevice?.device_gain_sound || 1.0);
            
            // Apply sensitivity correction based on base standard (both use 100.0 now)
            const baseSens = 100.0;
            const sensitivityFactor = baseSens / (parseFloat(formData?.sensitivity) || baseSens);
            gainNodeRef.current.gain.value = hwGain * sensitivityFactor;

            // Route: Source -> Gain -> Analyser & Destination
            src.connect(gainNodeRef.current);
            gainNodeRef.current.connect(analyserFreqRef.current);
            gainNodeRef.current.connect(analyserTimeRef.current);

            // Audio Destination for recording the processed signal
            audioDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
            gainNodeRef.current.connect(audioDestinationRef.current);

            if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
            await new Promise(r => setTimeout(r, 400));

            // Record from the processed stream (Destination) instead of raw mic
            mediaRecorderRef.current = new MediaRecorder(audioDestinationRef.current.stream);
            mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                const pt = currentPointRef.current;
                const rp = currentRepeatRef.current;
                audioChunksRef.current = [];
                handleRecordingComplete(blob, pt, rp);
            };
            return stream;
        } catch (err) {
            console.error('Mic error:', err);
            Swal.fire('Mic Error', 'Could not access microphone. Please allow permissions.', 'error');
            return null;
        }
    }, []);

    // ─── Recording control ───
    const startRecording = async () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
            const stream = await initAudio();
            if (!stream) return;
        }
        if (mediaRecorderRef.current.state === 'recording') return;

        setRemainingTime(recordingDuration);
        setProgress(0);
        audioChunksRef.current = [];

        mediaRecorderRef.current.start();
        setIsRecording(true);

        const t0 = Date.now();
        timerIntervalRef.current = setInterval(() => {
            const elapsedMs = Date.now() - t0;
            const elapsedSec = elapsedMs / 1000;
            const rem = Math.max(0, recordingDuration - Math.floor(elapsedSec));
            
            setRemainingTime(rem);
            setProgress(Math.min(100, (elapsedSec / recordingDuration) * 100));

            if (elapsedSec >= recordingDuration) stopRecording();
        }, 50); // High frequency for ultra-smooth movement

        drawFreq();
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            // Capture the final spectrum frame before closing context
            if (analyserFreqRef.current) {
                const data = new Float32Array(analyserFreqRef.current.frequencyBinCount);
                analyserFreqRef.current.getFloatFrequencyData(data);
                lastFFTRef.current = data;
            }
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerIntervalRef.current);
            cancelAnimationFrame(animFrameFreqRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
        }
    };

    // ─── After recording completes ───
    const handleRecordingComplete = async (blob, point, repeat) => {
        // Force Thai Timezone (UTC+7)
        const now = new Date();
        const thaiTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        
        const dateTimeStr = thaiTime.getUTCFullYear().toString() +
            (thaiTime.getUTCMonth() + 1).toString().padStart(2, '0') +
            thaiTime.getUTCDate().toString().padStart(2, '0') + '_' +
            thaiTime.getUTCHours().toString().padStart(2, '0') +
            thaiTime.getUTCMinutes().toString().padStart(2, '0') +
            thaiTime.getUTCSeconds().toString().padStart(2, '0');
            
        const actualFilename = `${formData.KKSNumber}_P${point}_R${repeat}_${dateTimeStr}.wav`;
        
        let fileFFT = null;
        try {
            const wavBlob = await toWav(blob);
            fileFFT = await getFFTFromBlob(wavBlob);
            const psd = calculatePSD(fileFFT, 48000); // Standardize sample rate for analysis

            const logEntry = { 
                point, repeat, time: new Date().toLocaleTimeString(), 
                status: 'ready', filename: actualFilename,
                blob: wavBlob,
                fft: fileFFT,
                normalizedFFT: psd,
                selected: true
            };
            setSessionLog(prev => [...prev, logEntry]);
        } catch (err) {
            console.error('Processing error:', err);
        }

        const newCompleted = completedRef.current + 1;
        setCompletedRecordings(newCompleted);
        completedRef.current = newCompleted;

        // Check if all done
        if (newCompleted >= totalRecordings) {
            setIsComplete(true);
            Swal.fire('Training Data Complete! 🎉', `All ${totalRecordings} recordings collected and uploaded successfully.`, 'success');
            return;
        }

        // Auto-advance logic
        if (autoModeRef.current && !isPausedRef.current) {
            let nextPt = point;
            let nextRp = repeat + 1;

            if (nextRp > recordingsPerPoint) {
                // Moving to NEXT POINT -> Pause Auto Mode
                nextPt = point + 1;
                nextRp = 1;
                
                setIsPaused(true);
                isPausedRef.current = true;
                setCurrentPoint(nextPt);
                setCurrentRepeat(nextRp);
                currentPointRef.current = nextPt;
                currentRepeatRef.current = nextRp;

                Swal.fire({
                    title: 'Point Completed',
                    text: `All repetitions for Point ${point} are done. Click "Review Data" to continue.`,
                    icon: 'info',
                    confirmButtonColor: '#FDC700',
                    confirmButtonText: 'Review Data'
                }).then(() => {
                    setFileListModal({ isOpen: true, point: point, step: 'analysis' });
                });
            } else {
                // Same point, next repeat -> Continue Auto Mode
                setCurrentPoint(nextPt);
                setCurrentRepeat(nextRp);
                currentPointRef.current = nextPt;
                currentRepeatRef.current = nextRp;
                setTimeout(() => {
                    if (autoModeRef.current && !isPausedRef.current) startRecording();
                }, 1200);
            }
        } else {
            // Manual Mode: calculate next step for state
            let nextPt = point;
            let nextRp = repeat + 1;
            if (nextRp > recordingsPerPoint) { nextPt = point + 1; nextRp = 1; }
            setCurrentPoint(nextPt);
            setCurrentRepeat(nextRp);
        }
    };

    // ─── Auto-record all ───
    const startAutoRecord = () => {
        setAutoMode(true);
        autoModeRef.current = true;
        setIsPaused(false);
        isPausedRef.current = false;
        startRecording();
    };

    const pauseAutoRecord = () => {
        setIsPaused(true);
        isPausedRef.current = true;
        if (isRecording) stopRecording();
    };

    const resumeAutoRecord = () => {
        setIsPaused(false);
        isPausedRef.current = false;
        startRecording();
    };

    const handleBulkUpload = async (targetPoint = null) => {
        const toUpload = sessionLog.filter(l => 
            l.status === 'ready' && 
            l.selected && 
            (targetPoint === null || l.point === targetPoint)
        );
        
        if (toUpload.length === 0) {
            Swal.fire('Nothing to Upload', 'Please select some recordings to upload.', 'info');
            return;
        }

        const confirm = await Swal.fire({
            title: 'Confirm Upload & Training',
            text: `Selected ${toUpload.length} files will be uploaded and training will start automatically. Continue?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Upload & Train',
            cancelButtonText: 'Review More',
            confirmButtonColor: '#1e3a8a'
        });

        if (!confirm.isConfirmed) return;

        setIsUploading(true);
        setBulkUploadProgress(0);
        let successCount = 0;
        const totalFiles = toUpload.length;

        // Get next version from ML server before uploading
        let nextVersion = 1;
        try {
            const point = targetPoint || toUpload[0]?.point;
            const versionRes = await fetch(API_ENDPOINTS.ML.NEXT_VERSION, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    kks: formData.KKSNumber,
                    point: parseInt(point),
                    measurement_type: formData.measurementType,
                    model_name: modelName || 'default'
                })
            });
            const versionData = await versionRes.json();
            nextVersion = versionData.version || 1;
        } catch (err) {
            console.warn('Could not get next version, defaulting to 1:', err);
        }

        for (let i = 0; i < totalFiles; i++) {
            const item = toUpload[i];
            try {
                setSessionLog(prev => prev.map(l => l.filename === item.filename ? { ...l, status: 'uploading' } : l));
                
                const fd = new FormData();
                fd.append('kks', formData.KKSNumber);
                fd.append('measurement_point', item.point);
                fd.append('measurement_type', formData.measurementType);
                fd.append('context', 'train');
                fd.append('model_name', modelName || 'default');
                fd.append('version', nextVersion);
                fd.append('machineName', formData.machineName);
                fd.append('user_id', parseInt(formData.user_id));
                fd.append('machine_id', parseInt(formData.machine_id));
                fd.append('audio', item.blob, item.filename);
                fd.append('filename', item.filename);
                if (locationData.lat && locationData.lon) {
                    fd.append('latitude', locationData.lat);
                    fd.append('longitude', locationData.lon);
                }

                await apiClient.post(API_ENDPOINTS.UPLOAD_TRAIN, fd, { 
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (progressEvent) => {
                        const filePercent = (progressEvent.loaded / progressEvent.total) * 100;
                        const overallPercent = ((i / totalFiles) * 100) + (filePercent / totalFiles);
                        setBulkUploadProgress(Math.round(overallPercent));
                    }
                });
                
                setSessionLog(prev => prev.map(l => l.filename === item.filename ? { ...l, status: 'success' } : l));
                successCount++;
            } catch (err) {
                console.error('Upload error:', err);
                setSessionLog(prev => prev.map(l => l.filename === item.filename ? { ...l, status: 'failed' } : l));
            }
        }

        setIsUploading(false);
        setBulkUploadProgress(100);
        // If uploading from modal, switch to 'ready' step
        if (fileListModal.isOpen && fileListModal.point === targetPoint) {
            if (successCount > 0) {
                // Automatically proceed to training check
                handleCheckAndTrain();
            }
        } else {
            Swal.fire('Upload Complete', `Successfully uploaded ${successCount} files for ${targetPoint ? `Point ${targetPoint}` : 'all points'}.`, 'success');
        }
    };

    const handleCheckAndTrain = async () => {
        if (!fileListModal.point) return;

        try {
            // 1. Check if model folder exists
            const checkResponse = await fetch(API_ENDPOINTS.ML.CHECK_MODEL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    kks: formData.KKSNumber,
                    point: fileListModal.point,
                    measurement_type: formData.measurementType,
                    model_name: modelName || 'default'
                })
            });

            const checkData = await checkResponse.json();

            if (checkData.exists) {
                // Get the version that will be created
                const versionRes = await fetch(API_ENDPOINTS.ML.NEXT_VERSION, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        kks: formData.KKSNumber,
                        point: parseInt(fileListModal.point),
                        measurement_type: formData.measurementType,
                        model_name: modelName || 'default'
                    })
                });
                const versionData = await versionRes.json();
                const nextVer = versionData.version || 1;

                const result = await Swal.fire({
                    title: 'Model Already Exists',
                    text: `A model for "${modelName || 'default'}" exists. A new version (v${nextVer}) will be created.`,
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: 'Yes, Create New Version',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#10b981',
                    cancelButtonColor: '#64748b'
                });

                if (!result.isConfirmed) return;
            }

            // 3. Start training
            handleStartTraining();
        } catch (error) {
            console.error("Check model error:", error);
            handleStartTraining();
        }
    };

    const handleStartTraining = async () => {
        if (!fileListModal.point) return;
        
        setIsTraining(true);
        setFileListModal(prev => ({ ...prev, step: 'training' }));
        setTrainingLogs(["[SYSTEM] Connecting to ML Server..."]);

        try {
            // Get version to determine which folder has the training data
            let trainVersion = 1;
            try {
                const versionRes = await fetch(API_ENDPOINTS.ML.NEXT_VERSION, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        kks: formData.KKSNumber,
                        point: parseInt(fileListModal.point),
                        measurement_type: formData.measurementType,
                        model_name: modelName || 'default'
                    })
                });
                const versionData = await versionRes.json();
                trainVersion = versionData.version || 1;
            } catch (err) {
                console.warn('Could not get version, defaulting to 1:', err);
            }

            const response = await fetch(API_ENDPOINTS.ML.TRAIN_ALL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ 
                    bucket: 'scu-data', 
                    prefix: `${formData.KKSNumber}/P${fileListModal.point}/${formData.measurementType}/models/${modelName || 'default'}/v${trainVersion}/train/`,
                    model_name: modelName || 'default',
                    model_configs: modelConfigs
                })
            });

            if (!response.body) {
                setTrainingLogs(prev => [...prev, "[ERROR] No response body from ML server"]);
                setIsTraining(false);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = "";

            let trainingSuccessful = false;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulated += chunk;

                // Split by newlines and add to logs
                const lines = accumulated.split('\n');
                if (lines.length > 1) {
                    const readyLines = lines.slice(0, -1);
                    if (readyLines.some(line => line.includes('[SUCCESS]') || line.includes('Training completed successfully'))) {
                        trainingSuccessful = true;
                    }
                    setTrainingLogs(prev => [...prev, ...readyLines]);
                    accumulated = lines[lines.length - 1]; // keep remaining partial line
                }
            }
            
            if (accumulated) {
                if (accumulated.includes('[SUCCESS]') || accumulated.includes('Training completed successfully')) {
                    trainingSuccessful = true;
                }
                setTrainingLogs(prev => [...prev, accumulated]);
            }

            if (trainingSuccessful) {
                const completedPt = fileListModal.point;
                
                // 1. Clear Memory: Nullify blobs and raw FFTs for this point
                setSessionLog(prev => prev.map(l => 
                    l.point === completedPt ? { ...l, blob: null, fft: null, trained: true } : l
                ));

                setTimeout(() => {
                    Swal.fire({
                        title: 'Training Complete!',
                        text: `Model for Point ${completedPt} has been synchronized and local data cleared to save memory. Go to next point?`,
                        icon: 'success',
                        showCancelButton: true,
                        confirmButtonText: 'Yes, Next Point',
                        cancelButtonText: 'Stay Here',
                        confirmButtonColor: '#10b981'
                    }).then((result) => {
                        if (result.isConfirmed) {
                            const nextPt = completedPt + 1;
                            if (nextPt <= formData.pointsCount) {
                                handleManualPointSelect(nextPt);
                                setFileListModal({ isOpen: false, point: null, step: 'analysis' });
                            } else {
                                Swal.fire('Complete', 'All points have been trained!', 'success');
                                setFileListModal({ isOpen: false, point: null, step: 'analysis' });
                            }
                        }
                    });
                }, 1000);
            }
            
        } catch (err) {
            console.error('Training error:', err);
            setTrainingLogs(prev => [...prev, `[ERROR] Connection failed: ${err.message}`]);
        } finally {
            setIsTraining(false);
        }
    };
    
    // ─── RE-CALCULATE FFT ON SIZE CHANGE ───
    useEffect(() => {
        const updateFFTs = async () => {
            let changed = false;
            const updatedLog = await Promise.all(sessionLog.map(async (entry) => {
                if (entry.blob && (entry.status === 'success' || entry.status === 'ready')) {
                    const newFFT = await getFFTFromBlob(entry.blob, visualFFTSize);
                    const psd = calculatePSD(newFFT, 48000);
                    changed = true;
                    return { ...entry, fft: newFFT, normalizedFFT: psd };
                }
                return entry;
            }));
            if (changed) setSessionLog(updatedLog);
        };
        if (sessionLog.length > 0) updateFFTs();
    }, [visualFFTSize]);

    // ─── Selection Control ───
    const toggleFileSelection = (filename) => {
        setSessionLog(prev => prev.map(l => 
            l.filename === filename ? { ...l, selected: !l.selected } : l
        ));
    };

    const toggleAllSelection = (point, select) => {
        setSessionLog(prev => prev.map(l => 
            l.point === point ? { ...l, selected: select } : l
        ));
    };



    const handleManualPointSelect = (pt) => {
        if (isRecording || isTraining || isUploading) return;
        
        const doneForPt = sessionLog.filter(l => l.point === pt && (l.status === 'success' || l.status === 'ready')).length;
        
        setCurrentPoint(pt);
        currentPointRef.current = pt;
        
        // If point is already done, set repeat to max, otherwise next repeat
        const nextRepeat = doneForPt < recordingsPerPoint ? doneForPt + 1 : recordingsPerPoint;
        setCurrentRepeat(nextRepeat);
        currentRepeatRef.current = nextRepeat;
    };

    const handleClearPointData = (pt) => {
        Swal.fire({
            title: `Clear Data for Point ${pt}?`,
            text: 'All recordings for this point will be removed from this session.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, Clear',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b'
        }).then((result) => {
            if (result.isConfirmed) {
                setSessionLog(prev => prev.filter(l => l.point !== pt));
                if (currentPoint === pt) {
                    setCurrentRepeat(1);
                    currentRepeatRef.current = 1;
                }
                Swal.fire('Cleared!', `Data for Point ${pt} has been removed.`, 'success');
            }
        });
    };

    // ─── Back to home ───
    const handleBack = () => {
        Swal.fire({
            title: 'Leave Session?', text: 'Uncompleted recordings will be lost.',
            icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, go back',
        }).then((r) => {
            if (r.isConfirmed) {
                stopRecording();
                navigate('/');
            }
        });
    };

    // ─── Cleanup ───
    useEffect(() => {
        const handleExitEvent = (e) => {
            e.preventDefault();
            handleBack();
        };
        window.addEventListener('egat:exit', handleExitEvent);
        return () => {
            window.removeEventListener('egat:exit', handleExitEvent);
        };
    }, [handleBack]);

    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
            cancelAnimationFrame(animFrameFreqRef.current);
            clearInterval(timerIntervalRef.current);
        };
    }, []);

    // ─── Circular progress vars ───
    const strokeColor = progress > 98 ? "#facc15" : "#1e3a8a";
    const radius = 110;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    if (!formData) return null;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-3 sm:p-6 lg:p-8">
            <main className="w-full max-w-7xl mx-auto py-4 sm:py-8 lg:py-10 relative z-10 flex flex-col items-center">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full">
                    {/* VibrationMeasure Style Inner Wrapper */}
                    <div className="w-full max-w-6xl mx-auto">
                        <div className={`${lightBg} backdrop-blur-xl p-4 sm:p-8 lg:p-10 rounded-3xl lg:rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border ${borderColor} relative overflow-hidden`}>
                            <div className="relative z-10">

                                {/* ─── Overall Progress Bar ─── */}


                                {/* Info Panel */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                                    <motion.div 
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={`${cardBg} p-5 sm:p-6 rounded-[1.5rem] border ${borderColor} shadow-xl backdrop-blur-md transition-all duration-300 group`}
                                    >
                                        <div className="flex items-center gap-3 mb-4 border-b border-primary/10 pb-3">
                                            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            </div>
                                            <h3 className={`text-sm font-black ${textColor} uppercase tracking-widest`}>Training Context</h3>
                                        </div>
                                        
                                        <div className="space-y-3.5">
                                            {[
                                                { label: 'KKS ID', value: formData?.KKSNumber, color: 'bg-primary text-white px-3' },
                                                { label: 'Machine', value: formData?.machineName, color: 'text-primary' },
                                                { label: 'Device', value: selectedDevice?.device_name || 'N/A', color: 'text-primary' },
                                                { label: 'Sensitivity', value: formData?.sensitivity ? `${formData.sensitivity} ${formData.measurementType === 'vibration' ? 'mV/g' : 'mV/Pa'}` : 'N/A', color: 'text-amber-600' },
                                                { 
                                                    label: 'Gain', 
                                                    value: formData?.measurementType === 'vibration' 
                                                        ? (selectedDevice?.device_gain_vibration || '1.000') 
                                                        : (selectedDevice?.device_gain_sound || '1.000'),
                                                    color: 'text-primary'
                                                },
                                                { label: 'Workload', value: `${totalPoints}pts × ${recordingsPerPoint}r`, color: 'bg-amber-400 text-primary font-black px-2' },
                                            ].map((item, i) => (
                                                <div key={i} className="flex flex-row items-center justify-between group/item gap-2">
                                                    <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2 flex-shrink-0">
                                                        <div className="w-1 h-1 bg-primary rounded-full"></div>
                                                        {item.label}
                                                    </div>
                                                    <span className={`text-[11px] sm:text-xs font-black tracking-tight py-1 rounded-full shadow-sm truncate text-right ${item.color}`}>
                                                        {item.value || "N/A"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>

                                    {/* Visual Analytics */}
                                    <div className="lg:col-span-2">
                                        <motion.div 
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className={`${cardBg} rounded-[1.5rem] overflow-hidden border ${borderColor} shadow-xl backdrop-blur-md flex flex-col h-full group`}
                                        >
                                            <div className="p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                                        <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03z" clipRule="evenodd" /></svg>
                                                    </div>
                                                    <h3 className="text-xs font-black text-primary uppercase tracking-widest">Real-time Spectrum (FFT)</h3>
                                                </div>
                                                <div className="flex gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/20 animate-pulse"></div>
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse [animation-delay:200ms]"></div>
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:400ms]"></div>
                                                </div>
                                            </div>
                                            <div className="p-3 bg-white/30 relative flex-1 min-h-[200px] sm:min-h-[250px]">
                                                <canvas ref={canvasFreqRef} width="800" height="300" className="w-full h-full rounded-xl border border-slate-200/50 shadow-inner bg-[#F9FAFB]" />
                                            </div>
                                        </motion.div>
                                    </div>
                                </div>

                                {/* Central Controls */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-8">
                                    <div className={`${cardBg} rounded-[2rem] p-6 sm:p-8 shadow-xl border ${borderColor} flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-md group`}>
                                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary/10 via-primary to-primary/10 group-hover:via-amber-400 transition-all duration-700"></div>
                                        
                                        <div className="relative w-44 h-44 sm:w-56 sm:h-56 group mb-8 mt-2 sm:mt-0">
                                            {/* Decorative outer ring */}
                                            <div className="absolute inset-[-10px] rounded-full border border-slate-100 animate-[spin_10s_linear_infinite] opacity-50"></div>
                                            <div className="absolute inset-[-20px] rounded-full border border-dashed border-slate-200 animate-[spin_20s_linear_infinite] opacity-30"></div>
                                            
                                            <svg className="absolute inset-0 w-full h-full transform -rotate-90 drop-shadow-2xl" viewBox="0 0 250 250">
                                                <circle cx="125" cy="125" r="110" stroke="rgba(30, 58, 138, 0.05)" strokeWidth="16" fill="white" />
                                                <motion.circle 
                                                    cx="125" cy="125" r="110" 
                                                    stroke={strokeColor} strokeWidth="12" fill="transparent" strokeLinecap="round" 
                                                    strokeDasharray={circumference} 
                                                    animate={{ strokeDashoffset }}
                                                    transition={{ duration: 1, ease: "linear" }}
                                                />
                                            </svg>
                                            
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                                <AnimatePresence mode="wait">
                                                    <motion.div 
                                                        key={isRecording ? 'recording' : isUploading ? 'uploading' : 'idle'}
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 1.2 }}
                                                        className="flex flex-col items-center"
                                                    >
                                                        <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">
                                                            {isRecording ? "Capturing" : isUploading ? "Saving" : "Ready"}
                                                        </span>
                                                        <div className={`text-4xl sm:text-5xl font-black ${textColor} tracking-tight tabular-nums`}>
                                                            {formatTime(remainingTime)}
                                                        </div>
                                                        <div className={`mt-2 flex items-center gap-2 px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${
                                                            isRecording ? 'bg-rose-100 text-rose-600 animate-pulse' : 
                                                            isUploading ? 'bg-amber-100 text-amber-600 animate-bounce' : 
                                                            'bg-emerald-100 text-emerald-600 border border-emerald-200/50 shadow-sm'
                                                        }`}>
                                                            {isRecording ? 'Recording...' : isUploading ? 'Syncing' : 'System Ready'}
                                                        </div>
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6 sm:gap-10 w-full justify-around mb-2">
                                            <div className="text-center group/item transition-all hover:scale-105">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Point</p>
                                                <div className="text-3xl font-black text-primary flex items-baseline gap-1 justify-center">
                                                    {currentPoint}
                                                    <span className="text-[10px] text-slate-300 font-bold">/ {totalPoints}</span>
                                                </div>
                                            </div>
                                            <div className="w-px h-12 bg-primary/5"></div>
                                            <div className="text-center group/item transition-all hover:scale-105">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Repeat</p>
                                                <div className="text-3xl font-black text-slate-800 flex items-baseline gap-1 justify-center">
                                                    {currentRepeat}
                                                    <span className="text-[10px] text-slate-300 font-bold">/ {recordingsPerPoint}</span>
                                                </div>
                                            </div>
                                            <div className="w-px h-12 bg-primary/5"></div>
                                            <div className="text-center group/item transition-all hover:scale-105">
                                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1.5">RMS</p>
                                                <div className="text-3xl font-black text-emerald-600 font-mono tracking-tight tabular-nums">
                                                    {liveRMS.toFixed(2)}
                                                    <span className="text-[10px] ml-1 text-slate-400 font-bold uppercase">{formData?.measurementType === 'vibration' ? 'm/s²' : 'dB'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {!isComplete && (
                                            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm">
                                                {!autoMode ? (
                                                    <>
                                                        <motion.button 
                                                            whileHover={{ scale: 1.02 }} 
                                                            whileTap={{ scale: 0.98 }}
                                                            onClick={startRecording}
                                                            disabled={isRecording || isUploading}
                                                            className={`h-14 w-full rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl transition-all ${
                                                                isRecording || isUploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-primary text-white shadow-primary/30 hover:bg-primary-dark'
                                                            }`}>
                                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                                                            Manual Start
                                                        </motion.button>

                                                        <motion.button 
                                                            whileHover={{ scale: 1.02 }} 
                                                            whileTap={{ scale: 0.98 }}
                                                            onClick={startAutoRecord}
                                                            disabled={isRecording || isUploading}
                                                            className={`h-14 w-full rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl transition-all ${
                                                                isRecording || isUploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-white border-2 border-primary text-primary hover:bg-primary/5 shadow-primary/10'
                                                            }`}>
                                                            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                                                            Auto Sequence
                                                        </motion.button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {isPaused ? (
                                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                                                onClick={resumeAutoRecord}
                                                                disabled={isUploading}
                                                                className={`h-14 w-full rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl transition-all ${
                                                                    isUploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-emerald-500 text-white shadow-emerald-500/20'
                                                                }`}>
                                                                <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                                                                Resume
                                                            </motion.button>
                                                        ) : (
                                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                                                onClick={pauseAutoRecord}
                                                                disabled={isUploading}
                                                                className={`h-14 w-full rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl transition-all ${
                                                                    isUploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-amber-500 text-white shadow-amber-500/20'
                                                                }`}>
                                                                <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                                                Pause
                                                            </motion.button>
                                                        )}
                                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                                            onClick={() => { setAutoMode(false); autoModeRef.current = false; if (isRecording) stopRecording(); }}
                                                            disabled={isUploading}
                                                            className={`h-14 w-full rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl transition-all ${
                                                                isUploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                                                            }`}>
                                                            Stop Auto
                                                        </motion.button>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {isComplete && (
                                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                onClick={() => navigate('/')}
                                                className="mt-8 h-14 px-12 rounded-2xl font-black text-xs uppercase tracking-widest bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 flex items-center gap-3">
                                                <svg className="w-5 h-5 shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                Finalize Session
                                            </motion.button>
                                        )}
                                    </div>

                                    {/* Point Matrix */}
                                    <div className={`${cardBg} rounded-[2rem] p-5 sm:p-8 shadow-xl border ${borderColor} backdrop-blur-md flex flex-col group`}>
                                        <div className="flex items-center justify-between mb-6 border-b border-primary/10 pb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 bg-primary/10 rounded-xl shadow-sm border border-primary/10 group-hover:bg-primary/20 transition-colors">
                                                    <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" /></svg>
                                                </div>
                                                <div>
                                                    <h3 className={`text-sm font-black ${textColor} uppercase tracking-widest`}>Point Progression Matrix</h3>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-0.5">Measurement Coverage</p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 overflow-y-auto max-h-[400px] sm:max-h-[500px] pr-1 sm:pr-2 custom-scrollbar">
                                            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-4 pb-2">
                                                {Array.from({ length: totalPoints }, (_, i) => i + 1).map(pt => {
                                                    const doneForPt = sessionLog.filter(l => l.point === pt && (l.status === 'success' || l.status === 'ready')).length;
                                                    const pct = Math.round((doneForPt / recordingsPerPoint) * 100);
                                                    const isTrained = sessionLog.some(l => l.point === pt && l.trained);
                                                    const isCurrent = pt === currentPoint && !isComplete;
                                                    const isDone = pct >= 100;

                                                    return (
                                                        <motion.div key={pt} 
                                                            whileHover={!isTrained ? { y: -4, scale: 1.02 } : {}}
                                                            onClick={() => !isTrained && handleManualPointSelect(pt)}
                                                            className={`p-4 rounded-[1.8rem] border-2 text-center transition-all relative overflow-hidden group/card ${
                                                                isCurrent ? 'border-primary bg-blue-50/20 shadow-xl shadow-primary/5' :
                                                                    isDone ? 'border-emerald-100 bg-white' : 'border-slate-50 bg-slate-50/30 opacity-70 hover:opacity-100'
                                                            } ${isTrained ? 'cursor-default' : 'cursor-pointer'}`}
                                                        >
                                                            
                                                            <div className="relative z-10">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <p className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isCurrent ? 'text-primary' : isTrained ? 'text-indigo-500' : 'text-slate-400'}`}>
                                                                        P{pt} {isTrained && '• Trained'}
                                                                    </p>
                                                                    {isDone && !isTrained && (
                                                                        <div className="p-1 bg-emerald-100 rounded-full">
                                                                            <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                
                                                                <div className="flex items-baseline justify-center gap-1.5 mb-3">
                                                                    <span className={`text-2xl sm:text-3xl font-black tabular-nums tracking-tighter ${isTrained ? 'text-indigo-500' : isDone ? 'text-emerald-500' : isCurrent ? 'text-primary' : 'text-slate-400'}`}>
                                                                        {doneForPt}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">/ {recordingsPerPoint}</span>
                                                                </div>

                                                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4 shadow-inner">
                                                                    <motion.div 
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${pct}%` }}
                                                                        className={`h-full rounded-full shadow-sm ${isTrained ? 'bg-indigo-400' : isDone ? 'bg-emerald-500' : 'bg-primary'}`} 
                                                                    />
                                                                </div>

                                                                {doneForPt > 0 && !isTrained && (
                                                                    <div className="flex gap-2">
                                                                        <motion.button
                                                                            whileTap={{ scale: 0.95 }}
                                                                            onClick={(e) => { e.stopPropagation(); setFileListModal({ isOpen: true, point: pt, step: 'analysis' }); }}
                                                                            className={`flex-1 h-10 text-[9px] font-black transition-all flex items-center justify-center gap-2 uppercase tracking-widest rounded-xl border-2 ${
                                                                                isDone ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-white text-primary border-primary/10 hover:border-primary/30 shadow-sm'
                                                                            }`}
                                                                        >
                                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                                                            Analyze
                                                                        </motion.button>
                                                                        <motion.button
                                                                            whileTap={{ scale: 0.95 }}
                                                                            onClick={(e) => { e.stopPropagation(); handleClearPointData(pt); }}
                                                                            className="h-10 w-10 flex items-center justify-center rounded-xl bg-rose-50 text-rose-500 border-2 border-rose-100 hover:bg-rose-100 transition-all shrink-0"
                                                                            title="Clear Point Data"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                        </motion.button>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Scanning effect for current point */}
                                                            {isCurrent && (
                                                                <div className="absolute inset-0 bg-gradient-to-tr from-primary/[0.03] to-transparent pointer-events-none animate-pulse" />
                                                            )}
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </main>

            {/* ─── File List Modal ─── */}
            <AnimatePresence>
                {fileListModal.isOpen && (
                    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                            onClick={() => !isTraining && setFileListModal({ isOpen: false, point: null })}
                        />
                        <motion.div
                            initial={{ y: "100%", opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: "100%", opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="relative w-full max-w-5xl max-h-[92vh] sm:h-[90vh] bg-white/95 backdrop-blur-2xl rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl border border-white/40 overflow-hidden flex flex-col shadow-primary/10"
                        >
                            <div className="sm:hidden flex justify-center pt-3 pb-1">
                                <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                            </div>

                            <div className="flex items-start sm:items-center justify-between p-6 sm:p-8 pb-4 sm:pb-6 border-b border-primary/5">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight flex items-center gap-3">
                                        {fileListModal.step === 'training' ? 'Neural Training Central' : (
                                            <><span className="text-primary">P{fileListModal.point}</span> <span className="text-slate-400 font-medium">/</span> Analysis</>
                                        )}
                                    </h2>
                                    <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-[0.2em] mt-1.5">
                                        {fileListModal.step === 'training' ? 'COMPUTING MODEL PARAMETERS' : 'PSD SPECTRUM VERIFICATION'}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setFileListModal({ isOpen: false, point: null })} 
                                    className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all cursor-pointer text-slate-400 hover:text-primary-dark border border-slate-100 group"
                                >
                                    <svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                                    {fileListModal.step === 'analysis' ? (
                                        <>
                                            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 custom-scrollbar bg-slate-50/20">
                                                {/* Comparison Spectrum */}
                                                <div className="w-full bg-white rounded-3xl border border-primary/5 p-2 sm:p-4 overflow-hidden shadow-xl shadow-slate-200/50 relative">
                                                    <div className="sm:absolute top-6 right-6 z-10 flex flex-wrap sm:flex-col gap-3 items-center sm:items-end mb-6 sm:mb-0">
                                                        <div className="flex gap-1.5 bg-slate-100/50 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200">
                                                            <button 
                                                                onClick={() => toggleAllSelection(fileListModal.point, true)}
                                                                className="px-4 py-2 text-[10px] font-black bg-white shadow-sm border border-slate-100 rounded-xl text-slate-600 hover:text-primary transition-all cursor-pointer uppercase tracking-widest"
                                                            >
                                                                Select All
                                                            </button>
                                                            <button 
                                                                onClick={() => toggleAllSelection(fileListModal.point, false)}
                                                                className="px-4 py-2 text-[10px] font-black bg-white shadow-sm border border-slate-100 rounded-xl text-slate-600 hover:text-rose-500 transition-all cursor-pointer uppercase tracking-widest"
                                                            >
                                                                Clear All
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-3 bg-slate-100/50 backdrop-blur-md p-2 rounded-2xl border border-slate-200">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Resolution</span>
                                                            <select 
                                                                value={visualFFTSize}
                                                                onChange={(e) => setVisualFFTSize(parseInt(e.target.value))}
                                                                className="text-[11px] font-black text-primary bg-white px-3 py-1.5 rounded-xl border border-primary/10 focus:ring-4 focus:ring-primary/5 cursor-pointer outline-none shadow-sm"
                                                            >
                                                                {[512, 1024, 2048, 4096, 8192, 16384].map(size => (
                                                                    <option key={size} value={size}>{size} pts</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <Plot
                                                        data={sessionLog
                                                            .filter(l => l.point === fileListModal.point && (l.status === 'success' || l.status === 'ready') && l.normalizedFFT)
                                                            .map((file) => {
                                                                const sr = 48000;
                                                                const freqStep = (sr / 2) / (file.fft?.length || 1);
                                                                return {
                                                                    x: Array.from({ length: file.normalizedFFT.length }, (_, i) => i * freqStep),
                                                                    y: file.normalizedFFT,
                                                                    type: 'scattergl',
                                                                    mode: 'lines',
                                                                    name: `R${file.repeat}`,
                                                                    line: {
                                                                        width: file.selected ? 2.5 : 1,
                                                                        color: file.selected ? undefined : 'rgba(148, 163, 184, 0.15)',
                                                                        shape: 'spline',
                                                                        smoothing: 1.3
                                                                    },
                                                                    opacity: file.selected ? 1 : 0.3,
                                                                };
                                                            })
                                                        }
                                                        layout={{
                                                            autosize: true,
                                                            height: window.innerWidth < 640 ? 280 : 420,
                                                            margin: { l: 50, r: 20, t: 30, b: 60 },
                                                            showlegend: window.innerWidth >= 1024,
                                                            legend: { 
                                                                orientation: 'v', 
                                                                y: 1, 
                                                                x: 1.02,
                                                                xanchor: 'left',
                                                                yanchor: 'top',
                                                                font: { size: 8, color: '#64748b', weight: 'bold' },
                                                                bgcolor: 'rgba(255,255,255,0.8)',
                                                                bordercolor: 'rgba(0,0,0,0.05)',
                                                                borderwidth: 1
                                                            },
                                                            paper_bgcolor: 'transparent',
                                                            plot_bgcolor: 'transparent',
                                                            xaxis: {
                                                                title: { text: 'FREQUENCY (Hz)', font: { size: 10, color: '#94a3b8', weight: 'black' }, standoff: 25 },
                                                                tickfont: { size: 10, color: '#94a3b8', weight: 'bold' },
                                                                gridcolor: 'rgba(226, 232, 240, 0.6)',
                                                                range: [0, 10000],
                                                                zeroline: false,
                                                                fixedrange: true,
                                                                linecolor: 'rgba(0,0,0,0.05)'
                                                            },
                                                            yaxis: {
                                                                title: { 
                                                                    text: formData?.measurementType === 'vibration' 
                                                                        ? 'PSD [dB re (m/s²)²/Hz]' 
                                                                        : 'PSD [dB re (20µPa)²/Hz]', 
                                                                    font: { size: 10, color: '#94a3b8', weight: 'black' }, 
                                                                    standoff: 25 
                                                                },
                                                                tickfont: { size: 10, color: '#94a3b8', weight: 'bold' },
                                                                gridcolor: 'rgba(226, 232, 240, 0.6)',
                                                                zeroline: false,
                                                                fixedrange: true,
                                                                linecolor: 'rgba(0,0,0,0.05)'
                                                            },
                                                            hovermode: 'closest',
                                                            hoverlabel: {
                                                                bgcolor: '#1e3a8a',
                                                                font: { color: '#fff', size: 12, family: 'Inter' },
                                                                bordercolor: 'transparent'
                                                            },
                                                            font: { family: 'Inter, sans-serif' }
                                                        }}
                                                        style={{ width: '100%', height: '100%' }}
                                                        useResizeHandler={true}
                                                        config={{ responsive: true, displayModeBar: false }}
                                                        className="w-full"
                                                    />
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between px-2">
                                                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Capture Stream</h3>
                                                        <div className="flex items-center gap-3">
                                                            {sessionLog.filter(l => l.point === fileListModal.point && l.selected).length >= 10 && (
                                                                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                                    Validated
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] font-black text-primary bg-primary/5 border border-primary/10 px-3 py-1 rounded-lg">
                                                                {sessionLog.filter(l => l.point === fileListModal.point && l.selected).length} Selected
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {sessionLog
                                                            .filter(l => l.point === fileListModal.point && (l.status === 'success' || l.status === 'ready'))
                                                            .slice(0, visibleCards)
                                                            .map((file) => (
                                                                <FileCard key={file.filename} file={file} onToggle={toggleFileSelection} />
                                                            ))
                                                        }
                                                    </div>
                                                    
                                                    {sessionLog.filter(l => l.point === fileListModal.point && (l.status === 'success' || l.status === 'ready')).length > visibleCards && (
                                                        <div className="flex justify-center pt-2">
                                                            <button 
                                                                onClick={() => setVisibleCards(prev => prev + 24)}
                                                                className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-200 shadow-sm"
                                                            >
                                                                Load More Repetitions
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="p-6 sm:p-8 pt-4 sm:pt-6 border-t border-slate-100 bg-white shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                                                 {isUploading && (
                                                     <div className="mb-6">
                                                         <div className="flex justify-between items-center mb-2">
                                                             <div className="flex items-center gap-2">
                                                                 <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                                                                 <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Synchronizing Dataset</span>
                                                             </div>
                                                             <span className="text-xs font-black text-primary tabular-nums tracking-tight">{bulkUploadProgress}%</span>
                                                         </div>
                                                         <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-50">
                                                             <motion.div 
                                                                 initial={{ width: 0 }}
                                                                 animate={{ width: `${bulkUploadProgress}%` }}
                                                                 className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(30,58,138,0.3)]"
                                                             />
                                                         </div>
                                                     </div>
                                                 )}
                                                 <div className="flex flex-col sm:flex-row gap-3">
                                                     <button 
                                                         onClick={() => setFileListModal({ isOpen: false, point: null, step: 'analysis' })} 
                                                         className="flex-1 px-8 py-4 text-xs sm:text-sm font-black uppercase tracking-widest text-slate-500 bg-slate-100 border border-slate-100 rounded-2xl hover:bg-slate-200 transition-all cursor-pointer"
                                                     >
                                                         Dismiss
                                                     </button>
                                                     <button 
                                                         disabled={sessionLog.filter(l => l.point === fileListModal.point && l.status === 'ready' && l.selected).length < 10 || isUploading}
                                                         onClick={() => handleBulkUpload(fileListModal.point)}
                                                         className="flex-[2] py-4 text-xs sm:text-sm font-black uppercase tracking-[0.1em] text-white bg-primary rounded-2xl hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 cursor-pointer disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-3 group relative overflow-hidden"
                                                     >
                                                         {isUploading ? (
                                                             <div className="relative z-10 flex items-center gap-3">
                                                                 <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                                                                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                 </svg>
                                                                 <span className="animate-pulse">Uploading Data ({bulkUploadProgress}%)</span>
                                                             </div>
                                                         ) : (
                                                             <>
                                                                 <svg className="w-5 h-5 transform group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                                 </svg>
                                                                 <span>Process & Sync ({sessionLog.filter(l => l.point === fileListModal.point && l.status === 'ready' && l.selected).length} Reps)</span>
                                                             </>
                                                         )}
                                                     </button>
                                                 </div>
                                                 {sessionLog.filter(l => l.point === fileListModal.point && l.status === 'ready' && l.selected).length < 10 && !isUploading && (
                                                     <p className="mt-4 text-[10px] text-center font-bold text-amber-500 animate-pulse uppercase tracking-[0.15em]">
                                                         Select at least 10 valid repetitions to enable sync
                                                     </p>
                                                 )}
                                            </div>
                                        </>
                                    ) : fileListModal.step === 'ready' ? (
                                        <>
                                            <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center space-y-6 sm:space-y-8 bg-slate-50/30">
                                                <motion.div 
                                                    initial={{ scale: 0, rotate: -45 }} 
                                                    animate={{ scale: 1, rotate: 0 }}
                                                    transition={{ type: "spring", damping: 12 }}
                                                    className="w-24 h-24 sm:w-32 sm:h-32 bg-emerald-100 text-emerald-500 rounded-[2rem] sm:rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-emerald-500/20"
                                                >
                                                    <svg className="w-12 h-12 sm:w-16 sm:h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </motion.div>
                                                
                                                <div className="max-w-md">
                                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">Data Ready for Training</h3>
                                                    <p className="text-sm sm:text-base text-slate-500 mt-3 font-medium leading-relaxed">
                                                        Point {fileListModal.point} dataset has been compiled and validated. 
                                                        You can proceed to the command center to start neural network training.
                                                    </p>
                                                </div>

                                                <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-slate-100 shadow-xl shadow-slate-200/50">
                                                    <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Valid Samples</span>
                                                        <span className="text-base font-black text-emerald-500">{sessionLog.filter(l => l.point === fileListModal.point && l.status === 'success').length} files</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Target Point</span>
                                                        <span className="text-base font-black text-primary">Location P{fileListModal.point}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-3">
                                                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Mode</span>
                                                        <span className="text-base font-black text-slate-800">Normal Training</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-6 sm:p-8 pt-4 sm:pt-6 border-t border-slate-100 bg-white">
                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    <button 
                                                        onClick={() => setFileListModal({ isOpen: false, point: null, step: 'analysis' })} 
                                                        className="flex-1 px-8 py-4 text-sm font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all cursor-pointer"
                                                    >
                                                        Not Now
                                                    </button>
                                                    <button 
                                                        onClick={handleCheckAndTrain}
                                                        className="flex-[1.5] py-4 text-sm font-black uppercase tracking-widest text-white bg-emerald-500 rounded-2xl hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 cursor-pointer"
                                                    >
                                                        Start Training
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex-1 flex flex-col p-4 sm:p-8 bg-[#0D0F14] border-x border-[#1a1d24] overflow-hidden relative font-mono">
                                                {/* Matrix-like subtle scanline effect */}
                                                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] z-20 pointer-events-none bg-[length:100%_4px,3px_100%]" />
                                                
                                                {/* terminal header/metadata */}
                                                <div className="relative z-30 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-[#161920] rounded-2xl border border-[#232730] shadow-2xl">
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] uppercase tracking-widest text-[#4A5568] font-black mb-1">Target Machine</span>
                                                        <span className="text-[11px] text-[#E2E8F0] font-bold truncate">{formData.machineName}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] uppercase tracking-widest text-[#4A5568] font-black mb-1">KKS Identification</span>
                                                        <span className="text-[11px] text-[#E2E8F0] font-bold">{formData.KKSNumber}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] uppercase tracking-widest text-[#4A5568] font-black mb-1">Model Profile</span>
                                                        <span className="text-[11px] text-primary font-bold">{modelName || 'default'}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] uppercase tracking-widest text-[#4A5568] font-black mb-1">System Status</span>
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${isTraining ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-500'}`} />
                                                            <span className={`text-[11px] font-bold ${isTraining ? 'text-emerald-500' : 'text-slate-500'}`}>
                                                                {isTraining ? 'COMPUTING' : 'IDLE'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 relative z-30 space-y-1.5">
                                                    {trainingLogs.length === 0 && (
                                                        <div className="flex flex-col items-center justify-center h-full text-[#2D3748] opacity-50">
                                                            <div className="w-16 h-16 mb-4 border-2 border-dashed border-[#2D3748] rounded-full flex items-center justify-center animate-spin-slow">
                                                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 11-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                                                                </svg>
                                                            </div>
                                                            <span className="text-[10px] uppercase tracking-[0.4em] font-black">Establishing Neural Link...</span>
                                                        </div>
                                                    )}
                                                    {trainingLogs.map((log, i) => {
                                                        const isSystem = log.includes('[SYSTEM]');
                                                        const isProcess = log.includes('[PROCESS]');
                                                        const isSuccess = log.includes('[SUCCESS]');
                                                        const isError = log.includes('[ERROR]');
                                                        const isWarning = log.includes('[WARNING]');
                                                        const isException = log.includes('[EXCEPTION]');
                                                        const isModel = log.includes('[AE]') || log.includes('[PCA]') || log.includes('[VAE]');

                                                        let textColor = "text-[#A0AEC0]";
                                                        let bgColor = "hover:bg-white/5";
                                                        let levelColor = "text-[#718096]";

                                                        if (isSystem) { textColor = "text-sky-400"; levelColor = "text-sky-500/50"; }
                                                        if (isProcess) { textColor = "text-primary"; levelColor = "text-primary/50"; }
                                                        if (isSuccess) { textColor = "text-emerald-400"; levelColor = "text-emerald-500/50"; }
                                                        if (isError || isException) { textColor = "text-rose-400"; bgColor = "bg-rose-500/5 hover:bg-rose-500/10"; levelColor = "text-rose-500/50"; }
                                                        if (isWarning) { textColor = "text-amber-400"; levelColor = "text-amber-500/50"; }
                                                        if (isModel) { textColor = "text-[#E2E8F0] font-bold"; levelColor = "text-primary/70"; }

                                                        return (
                                                            <motion.div 
                                                                initial={{ opacity: 0, x: -5 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                key={i} 
                                                                className={`flex gap-3 px-3 py-1 rounded transition-all group ${bgColor}`}
                                                            >
                                                                <span className="text-[10px] text-[#4A5568] min-w-[35px] text-right font-bold italic select-none">
                                                                    {String(i + 1).padStart(3, '0')}
                                                                </span>
                                                                <span className={`flex-1 text-[12px] leading-relaxed break-all whitespace-pre-wrap ${textColor}`}>
                                                                    {log}
                                                                </span>
                                                            </motion.div>
                                                        );
                                                    })}
                                                    <div ref={terminalEndRef} />
                                                </div>
                                            </div>
                                            <div className="p-6 sm:p-8 pt-4 sm:pt-6 border-t border-[#1a1d24] bg-[#0D0F14] flex gap-4">
                                                <button 
                                                    disabled={isTraining}
                                                    onClick={() => setFileListModal({ isOpen: false, point: null, step: 'analysis' })} 
                                                    className={`w-full py-4 text-xs sm:text-sm font-black uppercase tracking-[0.2em] transition-all rounded-2xl flex items-center justify-center gap-3 cursor-pointer ${
                                                        isTraining 
                                                            ? 'bg-[#161920] text-[#4A5568] opacity-50 cursor-not-allowed border border-[#232730]' 
                                                            : 'bg-white text-slate-900 hover:bg-slate-100 shadow-2xl shadow-black/40'
                                                    }`}
                                                >
                                                    {isTraining ? (
                                                        <>
                                                            <div className="relative">
                                                                <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                </svg>
                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
                                                                </div>
                                                            </div>
                                                            Processing Neural Layers...
                                                        </>
                                                    ) : 'Terminate Session'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
        </div>
    );
}

export default CreateModelPage;
