import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import apiClient from '../config/axios';
import { API_ENDPOINTS } from '../config/api';
import { useAlert } from '../context/AlertContext';
import { jwtDecode } from 'jwt-decode';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import Plot from 'react-plotly.js';
import { clearUserData } from '../config/auth';


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

async function decodeBlob(blob) {
    const buf = await blob.arrayBuffer();
    // Use a fixed sample rate to avoid mismatch with ML models
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const ab = await ctx.decodeAudioData(buf);
    ctx.close?.();
    return ab;
}

async function toWav(blob) { return encodeWav(await decodeBlob(blob)); }

const MeasurementPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const Swal = useAlert();
    const { formData, measurementMode, selectedDevice } = location.state || {};

    // Theme variables (matching VibrationMeasure.jsx)
    const primaryColor = "bg-primary";
    const secondaryColor = "bg-secondary";
    const textColor = "text-primary";
    const lightBg = "bg-white/40";
    const cardBg = "bg-white/60";
    const borderColor = "border-white/40";

    // Auth & redirect guard
    useEffect(() => {
        if (!formData || measurementMode !== 'measurement') { navigate('/'); return; }
        const token = localStorage.getItem('token');
        if (!token) { clearUserData(); navigate('/login'); return; }
        try {
            const decoded = jwtDecode(token);
            if (decoded.exp < Date.now() / 1000) { clearUserData(); navigate('/login'); }
        } catch { clearUserData(); navigate('/login'); }
    }, [formData, measurementMode, navigate]);

    const username = localStorage.getItem('username') || 'User';
    const kks = formData?.KKSNumber || '';
    const maxMeasurementPoint = parseInt(formData?.measurementPoint) || 1;
    const measurementType = formData?.measurementType || 'vibration';
    const machineName = formData?.machineName || '';
    const recordingDuration = parseInt(formData?.measurementTime) || 10;
    
    const [modelGroups, setModelGroups] = useState([]);
    const [selectedGroupKeys, setSelectedGroupKeys] = useState([]);
    const [projectVersionMap, setProjectVersionMap] = useState({}); // { projectName: currentSelectedKey }
    const [predictionChain, setPredictionChain] = useState([]);
    const [currentPoint, setCurrentPoint] = useState(1);
    const [measurements, setMeasurements] = useState([]); // Store history

    const currentPointRef = useRef(currentPoint);
    const modelGroupsRef = useRef(modelGroups);
    const selectedGroupKeysRef = useRef(selectedGroupKeys);

    useEffect(() => { currentPointRef.current = currentPoint; }, [currentPoint]);
    useEffect(() => { 
        modelGroupsRef.current = modelGroups; 
        selectedGroupKeysRef.current = selectedGroupKeys;
    }, [modelGroups, selectedGroupKeys]);

    const [isRecording, setIsRecording] = useState(false);
    const [remainingTime, setRemainingTime] = useState(recordingDuration);
    const [progress, setProgress] = useState(0);
    const [liveRMS, setLiveRMS] = useState(0);
    const lastRMSUpdateRef = useRef(0);

    const [isTesting, setIsTesting] = useState(false);
    const [testResults, setTestResults] = useState(null); 
    const [gpsCoords, setGpsCoords] = useState(null);
    const [gpsStatus, setGpsStatus] = useState('searching'); // searching, active, error
    const [recordedBlob, setRecordedBlob] = useState(null);
    const isHistoryReviewRef = useRef(false);

    const [selectedPopupStep, setSelectedPopupStep] = useState(null);
    const [activePlotMethod, setActivePlotMethod] = useState('ae');

    // Navigation functions (like MeasurementPage)
    const goToNextStep = () => { if (currentPoint < maxMeasurementPoint) setCurrentPoint(prev => prev + 1); };
    const goToPrevStep = () => { if (currentPoint > 1) setCurrentPoint(prev => prev - 1); };
    const isPrevDisabled = currentPoint <= 1;
    const isNextDisabled = currentPoint >= maxMeasurementPoint;

    // Audio Context Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioContextRef = useRef(null);
    const streamRef = useRef(null);
    const timerIntervalRef = useRef(null);
    
    const analyserTimeRef = useRef(null);
    const dataArrayTimeRef = useRef(null);
    const canvasTimeRef = useRef(null);
    const animationFrameIdTimeRef = useRef(null);
    
    const analyserFreqRef = useRef(null);
    const dataArrayFreqRef = useRef(null);
    const canvasFreqRef = useRef(null);
    const animationFrameIdFreqRef = useRef(null);
    const fftMaxScaleRef = useRef(0.1); 

    // GPS Tracking
    useEffect(() => {
        if (!navigator.geolocation) {
            setGpsStatus('error');
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setGpsStatus('active');
            },
            (err) => {
                console.error('GPS Error:', err);
                setGpsStatus('error');
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);
    // Fetch Production Models
    useEffect(() => {
        const fetchAvailableModels = async () => {
            const trimmedKks = kks ? kks.trim() : '';
            if (trimmedKks && currentPoint && measurementType) {
                try {
                    const res = await apiClient.get(API_ENDPOINTS.ML.GET_MODELS, {
                        params: { 
                            kks: trimmedKks, 
                            measurement_point: currentPoint, 
                            measurement_type: measurementType.trim().toLowerCase() 
                        }
                    });
                    
                    const rawModels = res.data || [];
                    
                    // Group by project name and version
                    const groups = {};
                    rawModels.forEach(m => {
                        const key = `${m.project_name}_v${m.version}`;
                        if (!groups[key]) {
                            groups[key] = {
                                key,
                                project_name: m.project_name,
                                version: m.version,
                                is_active: false,
                                models: []
                            };
                        }
                        if (m.is_active == 1 || m.is_active === true) {
                            groups[key].is_active = true;
                        }
                        groups[key].models.push({
                            id: m.id,
                            type: (m.method_name || 'unknown').toLowerCase(),
                            path: m.model_path,
                            project_name: m.project_name,
                            version: m.version,
                            is_active: m.is_active == 1 || m.is_active === true,
                            parameters: (() => {
                                try {
                                    return typeof m.parameters === 'string' ? JSON.parse(m.parameters) : m.parameters;
                                } catch (e) {
                                    return {};
                                }
                            })()
                        });
                    });

                    const groupList = Object.values(groups);
                    setModelGroups(groupList);
                    
                    // Group by project to find latest versions
                    const pMap = {};
                    groupList.forEach(g => {
                        if (!pMap[g.project_name] || g.version > pMap[g.project_name].version) {
                            pMap[g.project_name] = { key: g.key, version: g.version };
                        }
                    });
                    
                    const initialVersionMap = {};
                    Object.keys(pMap).forEach(pName => {
                        initialVersionMap[pName] = pMap[pName].key;
                    });
                    setProjectVersionMap(initialVersionMap);

                    // Select ALL latest versions whenever point changes (as requested)
                    const latestKeys = Object.values(initialVersionMap);
                    if (latestKeys.length > 0) {
                        setSelectedGroupKeys(latestKeys);
                    }

                    if (!isHistoryReviewRef.current) {
                        setTestResults(null);
                        setPredictionChain([]);
                    }
                    setRemainingTime(recordingDuration);
                    setProgress(0);
                } catch (error) {
                    console.error("Failed to fetch models", error);
                }
            }
        };
        fetchAvailableModels();
    }, [kks, currentPoint, measurementType, recordingDuration]);

    const formatTime = (seconds) => {
        const m = String(Math.floor(seconds / 60)).padStart(2, "0");
        const s = String(Math.floor(seconds % 60)).padStart(2, "0");
        return `${m}:${s}`;
    };

    const drawTimeDomainPlot = useCallback(() => {
        const canvas = canvasTimeRef.current;
        if (!canvas || !analyserTimeRef.current || !dataArrayTimeRef.current) return;
        
        const canvasCtx = canvas.getContext("2d");
        const bufferLength = analyserTimeRef.current.frequencyBinCount;
        const dataArray = dataArrayTimeRef.current;
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;

        if (mediaRecorderRef.current?.state !== 'recording') {
            cancelAnimationFrame(animationFrameIdTimeRef.current);
            return;
        }

        animationFrameIdTimeRef.current = requestAnimationFrame(drawTimeDomainPlot);
        analyserTimeRef.current.getFloatTimeDomainData(dataArray);

        let maxAbs = 0;
        for (let i = 0; i < bufferLength; i++) {
            const v = Math.abs(dataArray[i]);
            if (v > maxAbs) maxAbs = v;
        }
        if (maxAbs < 0.0005) maxAbs = 0.0005;

        canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

        const gradient = canvasCtx.createLinearGradient(0, 0, 0, HEIGHT);
        gradient.addColorStop(0, "#F9FAFB");
        gradient.addColorStop(1, "#F9FAFB");
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

        canvasCtx.strokeStyle = "rgba(100, 116, 139, 0.2)";
        canvasCtx.lineWidth = 1;
        for (let i = 1; i < 5; i++) {
            const y = HEIGHT * (i / 5);
            canvasCtx.beginPath(); canvasCtx.moveTo(0, y); canvasCtx.lineTo(WIDTH, y); canvasCtx.stroke();
        }
        canvasCtx.lineWidth = 1.5;
        canvasCtx.strokeStyle = "#1e3a8a"; // Navy Blue
        canvasCtx.beginPath();
        const sliceWidth = WIDTH / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / maxAbs;
            const y = (v * 0.4 + 0.5) * HEIGHT; // Slightly more compact waveform
            if (i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
            x += sliceWidth;
        }
        canvasCtx.stroke();
        
        // Border for premium feel
        canvasCtx.strokeStyle = 'rgba(30, 58, 138, 0.4)';
        canvasCtx.lineWidth = 1;
        canvasCtx.strokeRect(0, 0, WIDTH, HEIGHT);

        // --- Live Metrics Update (RMS) ---
        let sumSquared = 0;
        for (let i = 0; i < bufferLength; i++) {
            sumSquared += dataArray[i] * dataArray[i];
        }
        const rmsValue = Math.sqrt(sumSquared / bufferLength);
        
        let displayValue = 0;
        if (measurementType === 'vibration') {
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
    }, [measurementType]);

    

    const drawFrequencyDomainPlot = useCallback(() => {
        const c = canvasFreqRef.current;
        if (!c || !analyserFreqRef.current || !dataArrayFreqRef.current) return;
        
        if (mediaRecorderRef.current?.state !== 'recording') {
            cancelAnimationFrame(animationFrameIdFreqRef.current);
            return;
        }

        animationFrameIdFreqRef.current = requestAnimationFrame(drawFrequencyDomainPlot);

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
        for (let hz = 0; hz <= maxFreqDisplay; hz += 2000) {
            const x = (hz / maxFreqDisplay) * W;
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
    }, []);

    const processAndTestRecording = useCallback(async (blob, isPreview = false) => {
        if (isTesting) return; // Prevent concurrent requests
        setIsTesting(true);
        if (!isPreview) {
            setPredictionChain([]);
            setTestResults(null);
        }
        
        try {
            const wavBlob = await toWav(blob);
            const currentPt = currentPointRef.current;
            
            // Identify Baseline (Use the selected version of Baseline from selectedGroupKeys)
            const groups = modelGroupsRef.current;
            const currentSelectedKeys = selectedGroupKeysRef.current;
            
            let baselineKey = currentSelectedKeys.find(k => k.toLowerCase().includes('baseline'));
            
            // If baseline is not selected, we still need a starting point for the chain? 
            // Usually, cascading starts with Baseline. 
            if (!baselineKey) {
                // Fallback to latest baseline even if not in "selectedGroupKeys" for the chain start?
                // Or just the first selected model?
                baselineKey = currentSelectedKeys[0];
            }

            if (!baselineKey) throw new Error("No models selected for analysis");

            // Ensure Baseline (or the starting point) is always first
            const otherKeys = currentSelectedKeys.filter(k => k !== baselineKey);
            const keysToRun = [baselineKey, ...otherKeys];
            
            let finalResults = {};
            let chain = [];
            
            // Format datetime: YYYYMMDD_HHMMSS
            const now = new Date();
            const dateStr = now.getFullYear().toString() + 
                            (now.getMonth() + 1).toString().padStart(2, '0') + 
                            now.getDate().toString().padStart(2, '0');
            const timeStr = now.getHours().toString().padStart(2, '0') + 
                            now.getMinutes().toString().padStart(2, '0') + 
                            now.getSeconds().toString().padStart(2, '0');
            const actualFilename = `${kks}_${currentPt}_${dateStr}_${timeStr}.wav`;

            // Sequential / Cascading Prediction Logic
            for (let i = 0; i < keysToRun.length; i++) {
                const groupKey = keysToRun[i];
                const group = groups.find(g => g.key === groupKey);
                if (!group) continue;

                const modelsPayload = group.models.map(m => ({ 
                    path: m.path, 
                    type: m.type, 
                    name: m.project_name,
                    manual_threshold: m.parameters?.MANUAL_THRESHOLD
                }));

                const bodyFormData = new FormData();
                bodyFormData.append('audio', wavBlob, actualFilename);
                bodyFormData.append('models', JSON.stringify(modelsPayload));
                
                // Pure Inference Request without DB logging
                const response = await apiClient.post(API_ENDPOINTS.ML.PREDICT_TEST_ALL, bodyFormData);
                const results = response.data.results || response.data || {};
                
                // Statistical Consensus Logic
                const validModels = Object.values(results).filter(r => r && !r.error);
                const totalCount = validModels.length;
                const anomalyCount = validModels.filter(r => r.detection && !r.detection.includes('Normal')).length;
                const isAbnormal = totalCount > 0 ? (anomalyCount > totalCount / 2) : false;

                // ADVANCED MATCH RATE CALCULATION (Based on MSE similarity to threshold)
                const modelScores = validModels.map(r => {
                    const mse = parseFloat(r.mse) || 0;
                    const threshold = parseFloat(r.threshold) || 0.0001; 
                    
                    if (mse <= threshold) {
                        return 50 + (50 * (threshold - mse) / threshold);
                    } else {
                        // Inverse linear decay: becomes 25% at 2x threshold, 5% at 10x threshold
                        // This prevents "0%" results for clear but non-extreme anomalies
                        return Math.max(1, 50 / (1 + (mse - threshold) / threshold));
                    }
                });

                const matchRate = modelScores.length > 0 
                    ? modelScores.reduce((a, b) => a + b, 0) / modelScores.length 
                    : 0;

                const stepResult = {
                    groupKey: groupKey,
                    projectName: group.project_name,
                    version: group.version,
                    results: results,
                    isAbnormal: isAbnormal,
                    anomalyCount: anomalyCount,
                    matchRate: matchRate 
                };
                
                chain = [...chain, stepResult];
                finalResults = { ...finalResults, ...results };

                // Progressive UI Update
                setPredictionChain(chain);
                setTestResults(finalResults);

                // CASCADE LOGIC
                if (i === 0 && !isAbnormal) break; 
            }
            
            // ONLY Proceed to log addition if NOT in preview mode
            if (!isPreview) {
                // FINAL DIAGNOSIS LOGIC
                const baselineStep = chain[0];
                let statusStr = baselineStep.isAbnormal ? 'anomaly' : 'normal';
                let diagnosis = baselineStep.isAbnormal ? 'General Anomaly' : 'Normal';

                if (baselineStep.isAbnormal) {
                    const matchedFailures = chain.slice(1)
                        .filter(step => step.matchRate >= 50)
                        .sort((a, b) => b.matchRate - a.matchRate);

                    if (matchedFailures.length > 0) {
                        diagnosis = matchedFailures[0].projectName;
                    } else {
                        diagnosis = 'Anomaly Case Not Found';
                    }
                }

                // Determine winning step for data storage (Maximum percent match)
                let winningStep = baselineStep;
                if (statusStr !== 'normal') {
                    // Find failure step with highest match rate among failure models
                    const failureSteps = chain.slice(1).sort((a, b) => b.matchRate - a.matchRate);
                    if (failureSteps.length > 0) {
                        winningStep = failureSteps[0];
                    }
                }

                const newEntry = {
                    step: currentPt,
                    timestamp: new Date(),
                    status: statusStr,
                    diagnosis: diagnosis,
                    projectName: winningStep.projectName,
                    version: winningStep.version,
                    details: chain 
                };

                setMeasurements(prev => [newEntry, ...prev]);
                setRecordedBlob(null);

                // Build Log Creation Payload
                const finalFormData = new FormData();
                finalFormData.append('audio', wavBlob, actualFilename);
                finalFormData.append('kks', kks);
                finalFormData.append('measurement_point', currentPt);
                finalFormData.append('measurement_type', measurementType);
                finalFormData.append('abnormal_case', diagnosis);
                
                if (gpsCoords) {
                    finalFormData.append('latitude', gpsCoords.lat);
                    finalFormData.append('longitude', gpsCoords.lng);
                }

                const isActuallyAbnormal = diagnosis !== 'Normal';

                const anomaliesParams = [{
                    model_name: winningStep?.projectName || 'Verification System',
                    measurement_type: measurementType,
                    is_anomaly: isActuallyAbnormal,
                    abnormal_case: diagnosis,
                    percent_match: winningStep?.matchRate || 0,
                    details: chain
                }];
                
                finalFormData.append('anomalies', JSON.stringify(anomaliesParams));

                // Call new CREATE_LOG endpoint -> performs DB logic AND saves to specific folder
                try {
                    await apiClient.post(API_ENDPOINTS.MACHINES.CREATE_LOG, finalFormData);
                    
                    // NEW: Also upload to "all" folder
                    const allFormData = new FormData();
                    allFormData.append('audio', wavBlob, actualFilename);
                    allFormData.append('filename', actualFilename);
                    await apiClient.post(API_ENDPOINTS.UPLOAD_ALL, allFormData);
                } catch (saveError) {
                    console.error("Failed to persist final measurement data:", saveError);
                    throw saveError;
                }

                Swal.fire({ title: 'Success', text: 'Measurement uploaded & verified successfully.', icon: 'success', timer: 1500, showConfirmButton: false });
            }
        } catch (error) {
            console.error(error);
            if (!isPreview) {
                Swal.fire('Error', error.response?.data?.error || 'Measurement saving failed.', 'error');
            }
        } finally {
            setIsTesting(false);
        }
    }, [currentPoint, maxMeasurementPoint, goToNextStep, kks, measurementType, gpsCoords, Swal]);

    const initAudio = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false }
            });
            streamRef.current = stream;
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            const source = audioContextRef.current.createMediaStreamSource(stream);

            analyserTimeRef.current = audioContextRef.current.createAnalyser();
            analyserTimeRef.current.fftSize = 2048;
            dataArrayTimeRef.current = new Float32Array(analyserTimeRef.current.frequencyBinCount);

            analyserFreqRef.current = audioContextRef.current.createAnalyser();
            analyserFreqRef.current.fftSize = 2048;
            dataArrayFreqRef.current = new Float32Array(analyserFreqRef.current.frequencyBinCount);

            // Apply Hardware Gain and Sensitivity (Reference: 100 mV/g or 100 mV/Pa)
            const hwGain = formData?.measurementType === 'vibration' 
                ? parseFloat(selectedDevice?.device_gain_vibration || 1.0)
                : parseFloat(selectedDevice?.device_gain_sound || 1.0);
            
            const baseSens = 100.0;
            const sensitivityFactor = baseSens / (parseFloat(formData?.sensitivity) || baseSens);
            
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = hwGain * sensitivityFactor;

            source.connect(gainNode);
            gainNode.connect(analyserTimeRef.current);
            gainNode.connect(analyserFreqRef.current);

            if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
            
            // Create a media stream destination to record the PROCESSED audio
            const destination = audioContextRef.current.createMediaStreamDestination();
            gainNode.connect(destination);

            await new Promise(r => setTimeout(r, 400));

            mediaRecorderRef.current = new MediaRecorder(destination.stream);
            mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                audioChunksRef.current = [];
                setRecordedBlob(blob);
                // Trigger PREVIEW analysis immediately (Silent prediction)
                processAndTestRecording(blob, true);
            };
            return stream;
        } catch (err) {
            console.error('Mic error:', err);
            Swal.fire('Mic Error', 'Could not access microphone. Please allow permissions.', 'error');
            return null;
        }
    }, [Swal]);



    const startRecording = async () => {
        if (modelGroups.length === 0) {
            Swal.fire('Configuration Error', 'No Machine Learning models are available for this KKS/Point/Type combination. Please verify your model training or configuration before starting.', 'error');
            return;
        }

        isHistoryReviewRef.current = false;
        setTestResults(null);
        setPredictionChain([]);
        setRecordedBlob(null);
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

        const startTime = Date.now();
        timerIntervalRef.current = setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const newRemainingTime = Math.max(0, recordingDuration - elapsedSeconds);
            setRemainingTime(newRemainingTime);
            setProgress(100 * (1 - newRemainingTime / recordingDuration));

            if (newRemainingTime <= 0) stopRecording();
        }, 1000);

        drawTimeDomainPlot();
        drawFrequencyDomainPlot();
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
            cancelAnimationFrame(animationFrameIdTimeRef.current);
            cancelAnimationFrame(animationFrameIdFreqRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
        }
    };

    const handleMainMenuClick = () => {
        Swal.fire({
            title: "Are you sure?", text: "You will leave this session.", icon: "warning", showCancelButton: true, confirmButtonText: "Yes, go to main menu!"
        }).then((result) => {
            if (result.isConfirmed) {
                if (isRecording) stopRecording();
                navigate('/');
            }
        });
    };

    useEffect(() => {
        const handleExitEvent = (e) => {
            e.preventDefault();
            handleMainMenuClick();
        };
        window.addEventListener('egat:exit', handleExitEvent);
        return () => {
            window.removeEventListener('egat:exit', handleExitEvent);
        };
    }, [handleMainMenuClick]);

    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
            cancelAnimationFrame(animationFrameIdTimeRef.current);
            cancelAnimationFrame(animationFrameIdFreqRef.current);
            clearInterval(timerIntervalRef.current);
        };
    }, []);

    if (!formData) return null;

    const strokeColor = progress > 98 ? "#facc15" : "#1e3a8a";
    const radius = 110;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-3 sm:p-6 lg:p-8">
            <main className="w-full max-w-7xl mx-auto py-4 sm:py-8 lg:py-10 relative z-10 flex flex-col items-center">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full">
                    {/* VibrationMeasure Style Inner Wrapper */}
                    <div className="w-full max-w-6xl mx-auto">
                        <div className={`${lightBg} backdrop-blur-xl p-4 sm:p-8 lg:p-10 rounded-3xl lg:rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border ${borderColor} relative overflow-hidden`}>
                            <div className="relative z-10">

                                {/* Info Panel */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                                    <motion.div 
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={`${cardBg} p-4 sm:p-6 rounded-[1.5rem] border ${borderColor} shadow-xl backdrop-blur-md transition-all duration-300 group`}
                                    >
                                        <div className="flex items-center gap-3 mb-4 border-b border-slate-100/50 pb-3">
                                            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            </div>
                                            <h3 className={`text-sm font-black ${textColor} uppercase tracking-widest`}>Machine Information</h3>
                                        </div>
                                        <div className="space-y-4">
                                            {/* KKS */}
                                            <div className="flex flex-row items-center justify-between group/item gap-2">
                                                <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2 flex-shrink-0">
                                                    <div className="w-1 h-1 bg-primary rounded-full"></div>
                                                    KKS
                                                </div>
                                                <div className={`text-[11px] sm:text-sm font-black tracking-tight ${primaryColor} text-white px-3 sm:px-4 py-1 rounded-full shadow-sm truncate`}>{kks || "N/A"}</div>
                                            </div>

                                            {/* Machine */}
                                            <div className="flex flex-row items-center justify-between group/item gap-2">
                                                <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2 flex-shrink-0">
                                                    <div className="w-1 h-1 bg-primary rounded-full"></div>
                                                    Machine
                                                </div>
                                                <div className="text-[11px] sm:text-sm font-black text-primary px-1 truncate text-right">{machineName || "N/A"}</div>
                                            </div>

                                            {/* Device Info */}
                                            <div className="flex flex-row items-center justify-between group/item gap-2 border-t border-slate-50 pt-3">
                                                <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2 flex-shrink-0">
                                                    <div className="w-1 h-1 bg-primary rounded-full"></div>
                                                    Device
                                                </div>
                                                <div className="text-[11px] sm:text-sm font-black text-primary px-1 truncate text-right">{selectedDevice?.device_name || "N/A"}</div>
                                            </div>

                                            <div className="flex flex-row items-center justify-between group/item gap-2">
                                                <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2 flex-shrink-0">
                                                    <div className="w-1 h-1 bg-primary/40 rounded-full"></div>
                                                    Sensitivity
                                                </div>
                                                <div className="text-[11px] sm:text-sm font-black text-slate-700 px-1 truncate text-right">
                                                    {formData?.sensitivity ? `${formData.sensitivity} ${measurementType === 'vibration' ? 'mV/g' : 'mV/Pa'}` : "N/A"}
                                                </div>
                                            </div>

                                            <div className="flex flex-row items-center justify-between group/item gap-2">
                                                <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2 flex-shrink-0">
                                                    <div className="w-1 h-1 bg-secondary rounded-full"></div>
                                                    Hardware Gain
                                                </div>
                                                <div className="text-[11px] sm:text-sm font-black text-primary px-1 truncate text-right">
                                                    {measurementType === 'vibration' 
                                                        ? (selectedDevice?.device_gain_vibration || '1.000') 
                                                        : (selectedDevice?.device_gain_sound || '1.000')}
                                                </div>
                                            </div>

                                            {/* Type */}
                                            <div className="flex flex-col xs:flex-row xs:items-center justify-between group/item border-t border-slate-50 pt-3 gap-2">
                                                <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2">
                                                    <div className="w-1 h-1 bg-secondary rounded-full"></div>
                                                    Observation
                                                </div>
                                                <div className="flex items-center gap-2 justify-end">
                                                    <span className="text-[9px] bg-slate-100/80 text-slate-500 font-black px-2 py-0.5 rounded-lg border border-slate-200/50 uppercase">Pt {currentPoint}</span>
                                                    <div className={`text-[10px] sm:text-xs font-black uppercase bg-secondary text-primary px-3 py-1 rounded-full shadow-sm`}>{measurementType || "N/A"}</div>
                                                </div>
                                            </div>

                                            {/* GPS Status */}
                                            <div className="flex items-center justify-between mt-2 pt-3 border-t border-dashed border-slate-200/60">
                                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <svg className={`h-4 w-4 ${gpsStatus === 'active' ? 'text-emerald-500' : 'text-rose-400'}`} fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                    </svg>
                                                    Geolocation
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <div className={`text-[10px] sm:text-[11px] font-black px-3 py-1 rounded-lg border flex items-center gap-2 ${
                                                        gpsStatus === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                                                        gpsStatus === 'error' ? 'bg-rose-50 text-rose-700 border-rose-100' : 
                                                        'bg-slate-50 text-slate-400 border-slate-100 animate-pulse'
                                                    }`}>
                                                        {gpsStatus === 'active' && <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>}
                                                        {gpsStatus === 'active' ? `${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lng.toFixed(6)}` : 
                                                        gpsStatus === 'error' ? 'Location Disabled' : 'Connecting GPS...'}
                                                    </div>
                                                    {gpsStatus === 'active' && (
                                                        <motion.a 
                                                            whileTap={{ scale: 0.98 }}
                                                            href={`https://www.google.com/maps?q=${gpsCoords.lat},${gpsCoords.lng}`} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="text-[9px] text-blue-600 hover:text-blue-800 font-black uppercase mt-1.5 flex items-center gap-1 transition-colors underline-offset-2 hover:underline"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                            Open Satellite Map
                                                        </motion.a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* Active Models Panel */}
                                    <motion.div 
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={`${cardBg} rounded-2xl sm:rounded-[1.5rem] border ${borderColor} shadow-xl backdrop-blur-md flex flex-col overflow-hidden max-h-[350px] sm:max-h-none`}
                                    >
                                        <div className="p-4 border-b border-slate-100/50 bg-slate-50/50 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                                                    <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                                </div>
                                                <h3 className={`text-sm font-black ${textColor} uppercase tracking-tighter`}>ML Model Selection</h3>
                                            </div>
                                            <motion.button 
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => {
                                                    const uniqueProjects = [...new Set(modelGroups.map(g => g.project_name))];
                                                    if (selectedGroupKeys.length === uniqueProjects.length) {
                                                        // Reset to ONLY Baseline (selected version)
                                                        const baselineKey = Object.values(projectVersionMap).find(k => k.toLowerCase().includes('baseline'));
                                                        setSelectedGroupKeys(baselineKey ? [baselineKey] : [Object.values(projectVersionMap)[0]]);
                                                    } else {
                                                        // Enable ALL selected versions
                                                        setSelectedGroupKeys(Object.values(projectVersionMap));
                                                    }
                                                }}
                                                className="text-[10px] font-black text-blue-700 uppercase tracking-tighter bg-blue-50 px-3 py-1 rounded-full border border-blue-100 hover:bg-blue-100 transition-colors"
                                            >
                                                {selectedGroupKeys.length === [...new Set(modelGroups.map(g => g.project_name))].length ? 'Reset Selection' : 'Enable All Models'}
                                            </motion.button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-slate-50/20" style={{ maxHeight: '300px' }}>
                                            {modelGroups.length > 0 ? (
                                                <div className="space-y-3">
                                                    {[...new Set(modelGroups.map(g => g.project_name))]
                                                        .sort((a, b) => {
                                                            const aB = a.toLowerCase().includes('baseline');
                                                            const bB = b.toLowerCase().includes('baseline');
                                                            if (aB && !bB) return -1;
                                                            if (!aB && bB) return 1;
                                                            return 0;
                                                        })
                                                        .map((projectName) => {
                                                            const versions = modelGroups.filter(g => g.project_name === projectName).sort((a, b) => b.version - a.version);
                                                            const currentKey = projectVersionMap[projectName] || versions[0]?.key;
                                                            const group = modelGroups.find(g => g.key === currentKey) || versions[0];
                                                            const isSelected = selectedGroupKeys.includes(currentKey);
                                                            const isBaseline = projectName.toLowerCase().includes('baseline');

                                                            return (
                                                                <motion.div 
                                                                    key={projectName} 
                                                                    className={`p-2.5 rounded-xl border-2 transition-all relative shadow-sm bg-white ${
                                                                        isSelected 
                                                                            ? 'border-emerald-500 shadow-emerald-100' 
                                                                            : 'border-slate-100'
                                                                    } ${isRecording || isTesting ? 'opacity-70' : ''}`}
                                                                >
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <div 
                                                                            className="flex items-center gap-3 cursor-pointer flex-1"
                                                                            onClick={() => {
                                                                                if (isRecording || isTesting) return;
                                                                                if (isBaseline && isSelected) return; // Baseline must stay selected for cascading logic
                                                                                setSelectedGroupKeys(prev => 
                                                                                    prev.includes(currentKey) 
                                                                                        ? prev.filter(k => k !== currentKey) 
                                                                                        : [...prev, currentKey]
                                                                                );
                                                                            }}
                                                                        >
                                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'border-slate-300 bg-white'}`}>
                                                                                {isSelected && <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>}
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className={`text-[11px] font-black tracking-tight leading-none ${isSelected ? 'text-primary' : 'text-slate-600'}`}>
                                                                                    {projectName}
                                                                                </span>
                                                                                {isBaseline && (
                                                                                    <span className="text-[8px] text-blue-600 font-black uppercase mt-0.5 leading-none">Primary Baseline</span>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Version Selector */}
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase">Ver:</span>
                                                                            <select 
                                                                                value={group.version}
                                                                                disabled={isRecording || isTesting}
                                                                                onChange={(e) => {
                                                                                    const newV = parseInt(e.target.value);
                                                                                    const newGroup = versions.find(v => v.version === newV);
                                                                                    if (newGroup) {
                                                                                        setProjectVersionMap(prev => ({ ...prev, [projectName]: newGroup.key }));
                                                                                        if (isSelected) {
                                                                                            setSelectedGroupKeys(prev => prev.map(k => k.startsWith(projectName + '_v') ? newGroup.key : k));
                                                                                        }
                                                                                    }
                                                                                }}
                                                                                className="text-[10px] font-black bg-slate-100 border-none rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary/30 transition-all cursor-pointer"
                                                                            >
                                                                                {versions.map(v => (
                                                                                    <option key={v.version} value={v.version}>
                                                                                        {v.version} {v.version === versions[0].version ? '(Latest)' : ''}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-50 mt-1.5">
                                                                        {['ae', 'vae', 'pca'].map(type => {
                                                                            const m = group.models.find(mod => mod.type === type);
                                                                            if (!m) return null;
                                                                            
                                                                            let colorClass = isSelected ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-slate-50 text-slate-400 border-slate-100";
                                                                            if (isSelected) {
                                                                                if (type === 'ae') colorClass = "bg-blue-50 text-blue-700 border-blue-200";
                                                                                else if (type === 'vae') colorClass = "bg-violet-50 text-violet-700 border-violet-200";
                                                                                else if (type === 'pca') colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                                                            }

                                                                            return (
                                                                                <span key={type} className={`text-[8px] uppercase font-black px-1.5 py-0.5 rounded-md border-2 ${colorClass} flex items-center gap-1 transition-all`}>
                                                                                    <div className={`w-0.5 h-0.5 rounded-full ${isSelected ? 'bg-current' : 'bg-slate-300'}`}></div>
                                                                                    {type}
                                                                                </span>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </motion.div>
                                                            );
                                                        })}
                                                </div>
                                            ) : (
                                                <div className="text-center py-12">
                                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-inner">
                                                        <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                                    </div>
                                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">No models found</h4>
                                                    <p className="text-[10px] text-slate-400 mt-2 px-6">We couldn't discover any trained models for this measurement point.</p>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                </div>



                                {/* Visual Analytics Section */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-8">
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className={`${cardBg} rounded-2xl sm:rounded-[1.5rem] overflow-hidden border ${borderColor} shadow-xl backdrop-blur-md group`}
                                    >
                                        <div className="p-3 sm:p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-primary/10 rounded-lg">
                                                    <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
                                                </div>
                                                <h3 className="text-xs font-black text-primary uppercase tracking-widest leading-none">Time Waveform</h3>
                                            </div>
                                        </div>
                                        <div className="p-2 sm:p-3 bg-white/30 relative">
                                            <canvas ref={canvasTimeRef} width="600" height="150" className="w-full h-32 sm:h-36 rounded-xl border border-slate-100/50 shadow-inner bg-[#F9FAFB]/50" />
                                        </div>
                                    </motion.div>

                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.1 }}
                                        className={`${cardBg} rounded-2xl sm:rounded-[1.5rem] overflow-hidden border ${borderColor} shadow-xl backdrop-blur-md group`}
                                    >
                                        <div className="p-3 sm:p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-primary/10 rounded-lg">
                                                    <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03z" clipRule="evenodd" /></svg>
                                                </div>
                                                <h3 className="text-xs font-black text-primary uppercase tracking-widest leading-none">Frequency Spectrum</h3>
                                            </div>
                                        </div>
                                        <div className="p-2 sm:p-3 bg-white/30 relative">
                                            <canvas ref={canvasFreqRef} width="600" height="150" className="w-full h-32 sm:h-36 rounded-xl border border-slate-100/50 shadow-inner bg-[#F9FAFB]/50" />
                                        </div>
                                    </motion.div>
                                </div>

                                {/* Central Controls Section */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-8">
                                    {/* Timer Display - Prominent on Mobile */}
                                    <div className="flex flex-col items-center justify-center order-first lg:order-none py-4">
                                        <div className="relative w-44 h-44 sm:w-56 sm:h-56 group mt-2 sm:mt-0">
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
                                                        key={isRecording ? 'recording' : isTesting ? 'testing' : 'idle'}
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 1.2 }}
                                                        className="flex flex-col items-center"
                                                    >
                                                        <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">
                                                            {isRecording ? "Capturing" : isTesting ? "Analyzing" : "Awaiting"}
                                                        </span>
                                                        <div className={`text-4xl sm:text-5xl font-black ${textColor} tracking-tight tabular-nums`}>
                                                            {formatTime(remainingTime)}
                                                        </div>
                                                        <div className={`mt-2 flex items-center gap-2 px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${
                                                            isRecording ? 'bg-rose-100 text-rose-600 animate-pulse' : 
                                                            isTesting ? 'bg-blue-100 text-blue-600 animate-bounce' : 
                                                            'bg-emerald-100 text-emerald-600 border border-emerald-200/50 shadow-sm'
                                                        }`}>
                                                            {isRecording ? "Recording..." : isTesting ? "Cloud Processing" : "System Ready"}
                                                        </div>
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Navigation & Metrics */}
                                    <motion.div 
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`${cardBg} p-5 sm:p-6 rounded-2xl sm:rounded-[2rem] border ${borderColor} shadow-xl flex flex-col items-center justify-center relative overflow-hidden group`}
                                    >
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20"></div>
                                        <div className="mb-4 sm:mb-2 text-center group/rms w-full bg-slate-50/50 py-3 rounded-2xl border border-slate-100/50">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                                RMS
                                            </p>
                                            <div className="text-2xl sm:text-3xl font-black text-slate-800 font-mono tabular-nums flex items-baseline justify-center gap-1.5">
                                                {liveRMS.toFixed(2)}
                                                <span className="text-[11px] text-slate-400 font-black uppercase tracking-tighter">{measurementType === 'vibration' ? 'm/s²' : 'dB'}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="w-full h-px bg-slate-100/50 my-4 lg:hidden"></div>
                                        
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Measurement Point</span>
                                        <div className="flex items-center gap-4 sm:gap-6">
                                            <motion.button 
                                                whileTap={{ scale: 0.95 }}
                                                onClick={goToPrevStep} 
                                                disabled={isPrevDisabled || isRecording || isTesting} 
                                                className={`w-12 h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg transition-all ${isPrevDisabled || isRecording || isTesting ? "bg-slate-100 text-slate-300" : "bg-white text-primary border border-slate-100 hover:shadow-primary/10 active:scale-90"}`}
                                            >
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                            </motion.button>
                                            
                                            <div className="relative">
                                                <div className="w-20 h-20 rounded-2xl sm:rounded-[2rem] bg-gradient-to-br from-primary to-primary-dark flex flex-col items-center justify-center shadow-2xl shadow-primary/40 border-4 border-white/20">
                                                    <span className="text-[9px] text-white/50 font-black uppercase leading-tight">Point</span>
                                                    <span className="text-3xl text-white font-black leading-none">{currentPoint}</span>
                                                </div>
                                                <div className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-secondary flex items-center justify-center shadow-lg border-2 border-white">
                                                    <span className="text-[10px] font-black text-primary leading-none">{maxMeasurementPoint}</span>
                                                </div>
                                            </div>
                                            
                                            <motion.button 
                                                whileTap={{ scale: 0.95 }}
                                                onClick={goToNextStep} 
                                                disabled={isNextDisabled || isRecording || isTesting} 
                                                className={`w-12 h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg transition-all ${isNextDisabled || isRecording || isTesting ? "bg-slate-100 text-slate-300" : "bg-white text-primary border border-slate-100 hover:shadow-primary/10 active:scale-90"}`}
                                            >
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                            </motion.button>
                                        </div>
                                        <div className="mt-6 flex flex-wrap justify-center gap-2">
                                            {Array.from({ length: maxMeasurementPoint }, (_, i) => (
                                                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i + 1 === currentPoint ? 'w-5 bg-primary shadow-sm shadow-primary/30' : 'w-1.5 bg-slate-200'}`}></div>
                                            ))}
                                        </div>
                                    </motion.div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-col justify-center gap-3 sm:gap-4 lg:py-4">
                                        <motion.button 
                                            whileTap={{ scale: 0.98 }}
                                            onClick={startRecording} 
                                            disabled={isRecording || isTesting || modelGroups.length === 0} 
                                            className={`h-16 sm:h-20 lg:h-16 flex items-center justify-center gap-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-2xl transition-all cursor-pointer ${
                                                isRecording || isTesting || modelGroups.length === 0 ? "bg-slate-100 text-slate-400 cursor-not-allowed opacity-70" : 
                                                "bg-gradient-to-br from-primary to-primary-dark text-secondary shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
                                            }`}
                                        >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${modelGroups.length === 0 ? 'bg-slate-200' : isRecording ? 'bg-secondary animate-pulse' : 'bg-white/20'}`}>
                                                {isRecording ? <div className="w-3 h-3 bg-primary rounded-sm"></div> : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM3 10a7 7 0 1114 0 7 7 0 01-14 0z" clipRule="evenodd" /></svg>}
                                            </div>
                                            <span className="tracking-widest">{modelGroups.length === 0 ? "No Models Available" : isRecording ? "Stop Capture" : "Start Capture"}</span>
                                        </motion.button>

                                        <AnimatePresence>
                                            {recordedBlob && !isRecording && (
                                                <motion.button 
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -20 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    disabled={isTesting}
                                                    onClick={() => processAndTestRecording(recordedBlob, false)}
                                                    className={`h-16 flex items-center justify-center gap-3 rounded-2xl font-black uppercase tracking-[0.15em] text-sm shadow-2xl shadow-emerald-500/30 group transition-all cursor-pointer ${
                                                        isTesting ? "bg-slate-100 text-slate-400" : "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98]"
                                                    }`}
                                                >
                                                    <div className="relative">
                                                        {isTesting ? (
                                                            <div className="w-5 h-5 border-2 border-slate-300 border-t-primary rounded-full animate-spin"></div>
                                                        ) : (
                                                            <svg className="w-5 h-5 group-hover:animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                                        )}
                                                    </div>
                                                    <span className="truncate">{isTesting ? "Analyzing..." : predictionChain.length > 0 ? "Confirm & Upload" : "Analyze & Upload"}</span>
                                                </motion.button>
                                            )}
                                        </AnimatePresence>

                                        <motion.button 
                                            whileTap={{ scale: 0.98 }}
                                            onClick={handleMainMenuClick} 
                                            className="h-16 flex items-center justify-center gap-3 rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm bg-white text-slate-700 border border-slate-200 shadow-xl hover:bg-slate-50 transition-colors cursor-pointer"
                                        >
                                            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                                            Menu
                                        </motion.button>
                                    </div>
                                </div>


                                {/* Measurement History */}
                                <div className="mt-8 sm:mt-12">
                                    <div className="flex items-center justify-between mb-4 sm:mb-6 px-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                                <svg className="h-5 w-5 text-primary" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                                            </div>
                                            <div className="flex flex-col">
                                                <h3 className={`text-xs sm:text-sm font-black ${textColor} uppercase tracking-widest leading-none`}>Verification Logs</h3>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Audit Trail</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-100/80 px-3 py-1 rounded-full border border-slate-200/50">
                                            <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase">{measurements.length} sessions</span>
                                        </div>
                                    </div>
                                                                        <div className={`${cardBg} rounded-2xl sm:rounded-[2rem] border ${borderColor} shadow-xl overflow-hidden backdrop-blur-md`}>
                                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                            {measurements.length === 0 ? (
                                                <div className="p-12 text-center">
                                                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-inner opacity-50">
                                                        <svg className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                    </div>
                                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No Activity Logged</p>
                                                    <p className="text-[10px] text-slate-300 mt-2">Analysis data will appear here once you complete a validation.</p>
                                                </div>
                                            ) : (
                                                <ul className="divide-y divide-slate-100/50">
                                                    {[...measurements].sort((a,b) => b.timestamp - a.timestamp).map((m, idx) => {
                                                        const isCurrent = m.step === currentPoint;
                                                        const statusColor = m.status === 'normal' ? 'bg-emerald-500 shadow-emerald-500/20' : 
                                                                           m.diagnosis.includes('Issue') ? 'bg-amber-500 shadow-amber-500/20' : 
                                                                           'bg-rose-500 shadow-rose-500/20';
                                                        
                                                        return (
                                                            <motion.li 
                                                                key={idx} 
                                                                initial={{ opacity: 0, x: -10 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: idx * 0.05 }}
                                                                 onClick={() => { 
                                                                    isHistoryReviewRef.current = true;
                                                                    setCurrentPoint(m.step); 
                                                                    setPredictionChain(Array.isArray(m.details) ? m.details : []); 
                                                                    if (Array.isArray(m.details) && m.details.length > 0) {
                                                                        const combinedResults = {};
                                                                        m.details.forEach(step => {
                                                                            Object.assign(combinedResults, step.results);
                                                                        });
                                                                        setTestResults(combinedResults);
                                                                    }
                                                                }}
                                                                className={`p-4 sm:p-5 transition-all cursor-pointer group hover:bg-slate-50 relative ${isCurrent ? 'bg-white/80 ring-2 ring-primary/10 ring-inset shadow-inner' : ''}`}
                                                            >
                                                                {isCurrent && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>}
                                                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                                                                    <div className="flex items-center gap-3 sm:gap-4">
                                                                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center transition-all duration-500 ${isCurrent ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
                                                                            <span className="text-[7px] sm:text-[8px] font-black uppercase opacity-60 leading-none mb-0.5">Pt</span>
                                                                            <span className="text-base sm:text-lg font-black leading-none">{m.step}</span>
                                                                        </div>
                                                                        <div className="flex flex-col min-w-0">
                                                                            <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                                                                                <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${statusColor} shadow-lg shrink-0`}></div>
                                                                                <span className={`text-xs sm:text-sm font-black tracking-tight ${isCurrent ? 'text-primary' : 'text-slate-800'} truncate`}>
                                                                                    {m.diagnosis}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-3">
                                                                                <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                                                                <span className="text-[9px] text-slate-300 font-bold uppercase hidden sm:inline">•</span>
                                                                                <span className="text-[9px] text-slate-400 font-bold uppercase hidden sm:inline">Reference Points: {Array.isArray(m.details) ? m.details.length : 0}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto mt-2 sm:mt-0 gap-3 border-t border-slate-50 pt-2 sm:border-0 sm:pt-0">
                                                                        <div className={`px-2.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border shadow-sm ${
                                                                            m.status === 'normal' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                                                                            m.diagnosis.includes('Issue') ? 'bg-amber-50 text-amber-700 border-amber-100' : 
                                                                            'bg-rose-50 text-rose-700 border-rose-100'
                                                                        }`}>
                                                                            {m.status === 'normal' ? 'Normal' : 'Abnormal'}
                                                                        </div>
                                                                        <div className="flex items-center gap-1 opacity-60 sm:opacity-10 font-black text-[9px] sm:text-[11px] group-hover:opacity-100 transition-opacity text-primary">
                                                                            <span className="tracking-widest">DETAILS</span>
                                                                            <svg className="w-3 h-3 sm:w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </motion.li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </div>

                                </div>

                                {/* Analysis Chain Verification Visual */}
                                {predictionChain.length > 0 && (
                                    <div className="mt-10 sm:mt-16 animate-in fade-in slide-in-from-bottom-6 duration-700">
                                        <div className={`${cardBg} rounded-2xl sm:rounded-[2rem] border ${borderColor} shadow-2xl overflow-hidden backdrop-blur-xl relative`}>
                                            <div className="absolute top-0 right-0 p-4 sm:p-6 opacity-5 pointer-events-none">
                                                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                                            </div>
                                            
                                            <div className="p-4 sm:p-5 border-b border-primary/10 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                                                <h4 className="text-[10px] sm:text-xs font-black text-primary flex items-center gap-2 uppercase tracking-widest leading-none">
                                                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse shrink-0"></div>
                                                    Diagnostic Verification Chain
                                                </h4>
                                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                                    <div className="flex items-center gap-1.5 bg-white/50 px-2 py-1 rounded-lg border border-primary/10">
                                                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">Depth:</span>
                                                        <span className="text-[9px] text-primary font-black uppercase">{predictionChain.length} Layers</span>
                                                    </div>
                                                    <div className="w-px h-3 bg-primary/10 hidden sm:block"></div>
                                                    <div className="flex items-center gap-1.5 bg-white/50 px-2 py-1 rounded-lg border border-primary/10">
                                                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">Status:</span>
                                                        <span className={`text-[9px] font-black uppercase ${predictionChain[0]?.isAbnormal ? 'text-amber-600' : 'text-emerald-600'}`}>{predictionChain[0]?.isAbnormal ? 'Warning' : 'Verified'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="p-4 sm:p-8 lg:p-10 flex flex-col items-center">
                                                {/* Baseline Node */}
                                                <div className="w-full max-w-lg relative flex flex-col items-center">
                                                    {(() => {
                                                        const step = predictionChain[0];
                                                        return (
                                                            <motion.div 
                                                                whileHover={{ scale: 1.01 }}
                                                                onClick={() => { 
                                                                    setSelectedPopupStep(step); 
                                                                    const availableMethods = ['ae', 'vae', 'pca', 'AE', 'VAE', 'PCA'];
                                                                    const actualKey = availableMethods.find(m => step.results && step.results[m]);
                                                                    setActivePlotMethod(actualKey || 'ae');
                                                                }}
                                                                className={`w-full flex flex-col p-4 rounded-xl sm:rounded-2xl border-2 z-10 transition-all cursor-pointer hover:ring-offset-2 ${step.isAbnormal ? 'border-amber-400 bg-white shadow-xl ring-4 ring-amber-500/5 hover:ring-amber-400' : 'border-emerald-400 bg-white shadow-xl ring-4 ring-emerald-500/5 hover:ring-emerald-400'}`}>
                                                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-2">
                                                                    <div className="flex flex-col">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <div className={`w-1.5 h-1.5 rounded-full ${step.isAbnormal ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                                                                            <span className={`text-[9px] font-black uppercase tracking-widest ${step.isAbnormal ? 'text-amber-500' : 'text-emerald-500'}`}>PRIMARY BASELINE</span>
                                                                        </div>
                                                                        <span className="text-sm sm:text-base font-black text-primary tracking-tight leading-none">{step.projectName} <span className="text-[10px] font-bold text-slate-400 ml-1">v{step.version}</span></span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${step.isAbnormal ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
                                                                            {step.isAbnormal ? 'Anomaly' : 'Nominal'}
                                                                        </div>
                                                                        <div className={`px-1.5 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-tighter ${step.isAbnormal ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                                            {step.matchRate.toFixed(0)}% Conf
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-3 gap-2 mt-1">
                                                                    {['ae', 'vae', 'pca'].map(mType => {
                                                                        const mRes = step.results[mType];
                                                                        const isMAbnormal = mRes && !mRes.detection?.includes('Normal');
                                                                        return (
                                                                            <div key={mType} className={`flex flex-col items-center justify-center p-1.5 rounded-lg border-1.5 transition-all ${isMAbnormal ? 'bg-amber-50 text-amber-700 border-amber-100/50' : 'bg-emerald-50 text-emerald-700 border-emerald-100/50'}`}>
                                                                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-0.5">{mType}</span>
                                                                                <span className="text-[8px] font-black uppercase tracking-tighter leading-none">{isMAbnormal ? 'ANOMALY' : 'NORMAL'}</span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </motion.div>
                                                        );
                                                    })()}

                                                     {/* Connector if cascading */}
                                                    {predictionChain.length > 1 && (
                                                        <div className="relative flex flex-col items-center w-full h-12">
                                                            <div className="w-0.5 h-full bg-gradient-to-b from-amber-400 to-primary/40"></div>
                                                            <div className="absolute top-1/2 -translate-y-1/2 px-4 py-1.5 bg-white border-2 border-primary/10 rounded-full text-[9px] font-black text-primary shadow-lg uppercase tracking-[0.2em] flex items-center gap-2 z-20 whitespace-nowrap">
                                                                <svg className="w-3 h-3 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                                                Cascading Analytics
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Diagnostic Layer */}
                                                {predictionChain.length > 1 && (
                                                    <div className="w-full relative px-0 sm:px-4">
                                                        {/* Horizontal connecting bar */}
                                                        {predictionChain.length > 2 && (
                                                            <div className="absolute top-0 left-[25%] right-[25%] h-0.5 bg-primary/20 hidden lg:block"></div>
                                                        )}
                                                        <div className={`w-full grid gap-4 sm:gap-6 relative ${predictionChain.length === 2 ? 'grid-cols-1 max-w-sm mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
                                                            {predictionChain.slice(1).map((step, idx) => {
                                                                const isMatch = !step.isAbnormal;
                                                                return (
                                                                    <div key={idx} className="relative flex flex-col items-center pt-6 sm:pt-4">
                                                                        {/* Vertical stub for each child */}
                                                                        <div className="absolute top-0 w-0.5 h-6 sm:h-4 bg-primary/20"></div>
                                                                        
                                                                        <motion.div 
                                                                            initial={{ opacity: 0, y: 10 }}
                                                                            animate={{ opacity: 1, y: 0 }}
                                                                            transition={{ delay: 0.2 + (idx * 0.1) }}
                                                                            whileHover={{ scale: 1.02 }}
                                                                            onClick={() => { 
                                                                    setSelectedPopupStep(step); 
                                                                    const availableMethods = ['ae', 'vae', 'pca', 'AE', 'VAE', 'PCA'];
                                                                    const actualKey = availableMethods.find(m => step.results && step.results[m]);
                                                                    setActivePlotMethod(actualKey || 'ae');
                                                                }}
                                                                            className={`w-full flex flex-col p-4 rounded-xl sm:rounded-2xl border-2 transition-all relative overflow-hidden cursor-pointer shadow-lg hover:ring-offset-2 ${isMatch ? 'border-primary bg-white ring-4 ring-primary/5 z-20 hover:border-primary-dark' : 'border-slate-100 bg-slate-50/50 opacity-50 grayscale-[0.8] hover:grayscale-0'}`}
                                                                        >
                                                                            {/* Matching Badge */}
                                                                            {isMatch && (
                                                                                <div className="absolute -right-7 -top-7 w-14 h-14 bg-primary rotate-45 flex items-end justify-center pb-1.5 shadow-md">
                                                                                    <svg className="w-4 h-4 text-white -rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                                                </div>
                                                                            )}

                                                                            <div className="flex items-center justify-between mb-3">
                                                                                <div className="flex flex-col">
                                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                                        <div className={`w-1.5 h-1.5 rounded-full ${isMatch ? 'bg-primary animate-pulse' : 'bg-slate-300'}`}></div>
                                                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Failure Class Match</span>
                                                                                    </div>
                                                                                    <span className="text-xs sm:text-sm font-black text-primary tracking-tight leading-none truncate max-w-[150px]">{step.projectName}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-1.5 ml-2">
                                                                                    <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter ${isMatch ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'}`}>
                                                                                        {step.matchRate.toFixed(0)}% Match
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="grid grid-cols-3 gap-1.5 mt-auto">
                                                                                {['ae', 'vae', 'pca'].map(mType => {
                                                                                    const mRes = step.results[mType];
                                                                                    const isMAbnormal = mRes && !mRes.detection?.includes('Normal');
                                                                                    return (
                                                                                        <div key={mType} className={`py-1.5 rounded-lg text-center border transition-all ${isMAbnormal ? 'bg-slate-50 text-slate-400 border-slate-100' : 'bg-primary/5 text-primary border-primary/10'}`}>
                                                                                            <span className="text-[8px] font-black uppercase tracking-tight">{mType}</span>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>

                                                                            {isMatch && (
                                                                                <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-2">
                                                                                    <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                                                                                    <p className="text-[9px] font-bold text-slate-500 leading-none italic uppercase tracking-tighter">Profile Verified</p>
                                                                                </div>
                                                                            )}
                                                                        </motion.div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* Case Not Found handling with its own connection */}
                                                        {predictionChain[0].isAbnormal && !predictionChain.slice(1).some(s => !s.isAbnormal) && (
                                                            <div className="relative flex flex-col items-center pt-10 sm:pt-8">
                                                                {/* Vertical line from secondary layer to Case Not Found */}
                                                                <div className="absolute top-0 w-0.5 h-10 sm:h-8 bg-gradient-to-b from-primary/20 to-rose-300"></div>
                                                                
                                                                <motion.div 
                                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    className="p-6 rounded-[1.5rem] border-2 border-dashed border-rose-200 bg-rose-50/30 flex flex-col items-center text-center max-w-sm mx-auto relative z-10 shadow-sm"
                                                                >
                                                                    <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mb-3">
                                                                        <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                                    </div>
                                                                    <h5 className="text-[11px] font-black text-rose-600 uppercase tracking-[0.2em] mb-2">Unrecognized Pattern</h5>
                                                                    <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase px-2">Anomaly detected at baseline, but no subsequent failure model matched the signal profile sufficiently.</p>
                                                                </motion.div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-center">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] opacity-40">End of Analysis Pipeline</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>
                </motion.div>
            </main>

            {/* Modal for Plot PSD Results */}
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
                                                    const mType = measurementType?.toLowerCase();
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
                                                                text: measurementType?.toLowerCase() === 'vibration' 
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

        </div>
    );
};

export default MeasurementPage;
