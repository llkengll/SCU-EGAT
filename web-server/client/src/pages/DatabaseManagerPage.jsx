import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlert } from '../context/AlertContext';
import apiClient from '../config/axios';
import { jwtDecode } from 'jwt-decode';
import { clearUserData } from '../config/auth';

/**
 * DATABASE MANAGER - COMPACT VERSION
 * Theme: Industrial Intelligence
 * Colors: EGAT Navy (#003B71) & Yellow Gold (#FFD200)
 */

export default function DatabaseManagerPage() {
    const navigate = useNavigate();
    const Swal = useAlert();

    const [activeTab, setActiveTab] = useState('models'); // 'models', 'devices', 'machines', 'users'

    // Device Management State
    const [devices, setDevices] = useState([]);
    const [isDevicesLoading, setIsDevicesLoading] = useState(false);
    const [isDeviceSaving, setIsDeviceSaving] = useState(false);
    const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [deviceFormData, setDeviceFormData] = useState({
        device_name: '',
        device_gain_vibration: '1.000',
        device_gain_sound: '1.000'
    });
    const [deviceSearch, setDeviceSearch] = useState('');

    // Model Management State
    const [models, setModels] = useState([]);
    const [isModelsLoading, setIsModelsLoading] = useState(false);
    const [kksSearch, setKksSearch] = useState('');
    const [editingModel, setEditingModel] = useState(null);
    const [newThreshold, setNewThreshold] = useState('');
    const [isModelSaving, setIsModelSaving] = useState(false);

    // Machine (KKS) Management State
    const [machines, setMachines] = useState([]);
    const [isMachinesLoading, setIsMachinesLoading] = useState(false);
    const [isMachineSaving, setIsMachineSaving] = useState(false);
    const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
    const [editingMachine, setEditingMachine] = useState(null);
    const [machineFormData, setMachineFormData] = useState({
        kks: '',
        name: '',
        unit: '',
        plant: '',
        measurement_point: 1,
        measurement_interval: 30
    });
    const [machineSearch, setMachineSearch] = useState('');

    // User Management State
    const [users, setUsers] = useState([]);
    const [isUsersLoading, setIsUsersLoading] = useState(false);
    const [isUserSaving, setIsUserSaving] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [userFormData, setUserFormData] = useState({
        username: '',
        email: '',
        role: 'user',
        password: ''
    });
    const [userSearch, setUserSearch] = useState('');
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

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

            if (decoded.role !== 'admin') {
                Swal.fire({ 
                    icon: 'error', 
                    title: 'Access Denied', 
                    text: 'You do not have permission to view the Database Manager.' 
                });
                navigate('/');
                return;
            }
            
            fetchDevices();
            fetchAllModels();
            fetchMachines();
            fetchUsers();
        } catch (e) {
            console.error("Invalid token:", e);
            clearUserData();
            navigate('/login');
        }
    }, [navigate]);

    // Reset pagination when tab changes
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab]);

    // --- Machine Management Logic ---
    const fetchMachines = async () => {
        setIsMachinesLoading(true);
        try {
            const response = await apiClient.get('/api/machines');
            setMachines(response.data);
        } catch (error) {
            console.error('Error fetching machines:', error);
        } finally {
            setIsMachinesLoading(false);
        }
    };

    const handleOpenMachineModal = (machine = null) => {
        if (machine) {
            setEditingMachine(machine);
            setMachineFormData({
                kks: machine.kks,
                name: machine.name,
                unit: machine.unit,
                plant: machine.plant,
                measurement_point: machine.measurement_point || 1,
                measurement_interval: machine.measurement_interval || 30
            });
        } else {
            setEditingMachine(null);
            setMachineFormData({
                kks: '',
                name: '',
                unit: '',
                plant: '',
                measurement_point: 1,
                measurement_interval: 30
            });
        }
        setIsMachineModalOpen(true);
    };

    const handleSaveMachine = async (e) => {
        e.preventDefault();
        if (!machineFormData.kks.trim() || !machineFormData.name.trim()) {
            Swal.fire({ icon: 'error', title: 'Data Missing', text: 'KKS and Name are required.' });
            return;
        }

        setIsMachineSaving(true);
        try {
            if (editingMachine) {
                await apiClient.put(`/api/machines/${editingMachine.kks}`, machineFormData);
            } else {
                await apiClient.post('/api/machines', machineFormData);
            }
            Swal.fire({ icon: 'success', title: 'Success', text: 'Machine registry updated.', timer: 1500, showConfirmButton: false });
            setIsMachineModalOpen(false);
            fetchMachines();
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'Failed to save machine.' });
        } finally {
            setIsMachineSaving(false);
        }
    };

    const handleDeleteMachine = (machine) => {
        Swal.fire({
            title: 'Delete Machine?',
            text: `Permanently remove ${machine.kks}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Confirm Removal',
            cancelButtonColor: '#ffffff',
            cancelButtonText: 'Keep'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await apiClient.delete(`/api/machines/${machine.kks}`);
                    Swal.fire({ icon: 'success', title: 'Removed', text: 'Machine deleted.', timer: 1200, showConfirmButton: false });
                    fetchMachines();
                } catch (error) {
                    Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'Failed to delete machine.' });
                }
            }
        });
    };

    // --- User Management Logic ---
    const fetchUsers = async () => {
        setIsUsersLoading(true);
        try {
            const response = await apiClient.get('/api/auth/users');
            setUsers(response.data);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setIsUsersLoading(false);
        }
    };

    const handleOpenUserModal = (user = null) => {
        if (user) {
            setEditingUser(user);
            setUserFormData({
                username: user.username,
                email: user.email,
                role: user.role,
                password: ''
            });
        } else {
            setEditingUser(null);
            setUserFormData({
                username: '',
                email: '',
                role: 'user',
                password: ''
            });
        }
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async (e) => {
        e.preventDefault();
        if (!userFormData.username.trim() || !userFormData.email.trim() || (!editingUser && !userFormData.password.trim())) {
            Swal.fire({ icon: 'error', title: 'Data Missing', text: 'Username, Email, and Password (for new users) are required.' });
            return;
        }

        setIsUserSaving(true);
        try {
            if (editingUser) {
                await apiClient.put(`/api/auth/users/${editingUser.id}`, userFormData);
            } else {
                await apiClient.post('/api/auth/register', userFormData);
            }
            Swal.fire({ icon: 'success', title: 'Success', text: 'User account synchronized.', timer: 1500, showConfirmButton: false });
            setIsUserModalOpen(false);
            fetchUsers();
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'Failed to save user.' });
        } finally {
            setIsUserSaving(false);
        }
    };

    const handleDeleteUser = (user) => {
        Swal.fire({
            title: 'Delete Account?',
            text: `Permanently remove ${user.username}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Confirm Removal',
            cancelButtonColor: '#ffffff',
            cancelButtonText: 'Keep'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await apiClient.delete(`/api/auth/users/${user.id}`);
                    Swal.fire({ icon: 'success', title: 'Removed', text: 'User deleted.', timer: 1200, showConfirmButton: false });
                    fetchUsers();
                } catch (error) {
                    Swal.fire({ icon: 'error', title: 'Error', text: error.response?.data?.error || 'Failed to delete user.' });
                }
            }
        });
    };

    // --- Device Management Logic ---
    const fetchDevices = async () => {
        setIsDevicesLoading(true);
        try {
            const response = await apiClient.get('/api/devices');
            setDevices(response.data);
        } catch (error) {
            console.error('Error fetching devices:', error);
            Swal.fire({
                icon: 'error',
                title: 'Link Refused',
                text: error.response?.data?.message || 'Hardware registry unreachable.'
            });
        } finally {
            setIsDevicesLoading(false);
        }
    };

    const handleOpenDeviceModal = (device = null) => {
        if (device) {
            setEditingDevice(device);
            setDeviceFormData({
                device_name: device.device_name,
                device_gain_vibration: parseFloat(device.device_gain_vibration).toFixed(3),
                device_gain_sound: parseFloat(device.device_gain_sound).toFixed(3)
            });
        } else {
            setEditingDevice(null);
            setDeviceFormData({
                device_name: '',
                device_gain_vibration: '1.000',
                device_gain_sound: '1.000'
            });
        }
        setIsDeviceModalOpen(true);
    };

    const handleCloseDeviceModal = () => {
        setIsDeviceModalOpen(false);
        setEditingDevice(null);
    };

    const handleDeviceInputChange = (e) => {
        const { name, value } = e.target;
        setDeviceFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveDevice = async (e) => {
        e.preventDefault();
        if (!deviceFormData.device_name.trim()) {
            Swal.fire({ icon: 'error', title: 'Identity Required', text: 'Device must have a unique alias.' });
            return;
        }

        setIsDeviceSaving(true);
        try {
            const body = {
                device_name: deviceFormData.device_name,
                device_gain_vibration: parseFloat(deviceFormData.device_gain_vibration),
                device_gain_sound: parseFloat(deviceFormData.device_gain_sound)
            };

            if (editingDevice) {
                await apiClient.put(`/api/devices/${editingDevice.id}`, body);
            } else {
                await apiClient.post('/api/devices', body);
            }

            Swal.fire({
                icon: 'success',
                title: 'Data Synchronized',
                text: `Hardware identity established successfully.`,
                timer: 1500,
                showConfirmButton: false
            });
            handleCloseDeviceModal();
            fetchDevices();
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Write Conflict',
                text: error.response?.data?.message || 'Failed to update hardware registry.'
            });
        } finally {
            setIsDeviceSaving(false);
        }
    };

    const handleDeleteDevice = (device) => {
        Swal.fire({
            title: 'Decommission Unit?',
            text: `Permanently remove "${device.device_name}" from the active registry?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Confirm Removal',
            cancelButtonColor: '#ffffff',
            cancelButtonText: 'Keep'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await apiClient.delete(`/api/devices/${device.id}`);
                    Swal.fire({
                        icon: 'success',
                        title: 'Registry Updated',
                        text: 'Unit decommissioned.',
                        timer: 1200,
                        showConfirmButton: false
                    });
                    fetchDevices();
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Removal Error',
                        text: error.response?.data?.message || 'Hardware lock active.'
                    });
                }
            }
        });
    };

    // --- Model Management Logic ---
    const fetchAllModels = async () => {
        setIsModelsLoading(true);
        try {
            const response = await apiClient.get('/api/ml/models/all');
            setModels(response.data);
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Intelligence Offline',
                text: error.response?.data?.error || 'Neural modules unreachable.'
            });
        } finally {
            setIsModelsLoading(false);
        }
    };

    const groupedModels = useMemo(() => {
        const groups = {};
        const filteredModels = models.filter(m => 
            m.kks && m.kks.toLowerCase().includes(kksSearch.trim().toLowerCase())
        );

        filteredModels.forEach(m => {
            const key = `${m.kks}_${m.project_name}_${m.version}_${m.measurement_point}_${m.measurement_type}`;
            if (!groups[key]) {
                groups[key] = {
                    key,
                    kks: m.kks,
                    project_name: m.project_name,
                    version: m.version,
                    measurement_point: m.measurement_point,
                    measurement_type: m.measurement_type,
                    methods: []
                };
            }
            groups[key].methods.push(m);
        });
        
        return Object.values(groups).sort((a, b) => {
            if (a.kks !== b.kks) return a.kks.localeCompare(b.kks);
            if (a.project_name !== b.project_name) return a.project_name.localeCompare(b.project_name);
            return b.version - a.version;
        });
    }, [models, kksSearch]);

    const handleEditModelClick = (model) => {
        setEditingModel(model);
        let currentThreshold = '';
        if (model.parameters) {
            let params = model.parameters;
            if (typeof params === 'string') {
                try { params = JSON.parse(params); } catch (e) { params = {}; }
            }
            if (params.MANUAL_THRESHOLD !== undefined) {
                currentThreshold = params.MANUAL_THRESHOLD.toString();
            }
        }
        setNewThreshold(currentThreshold);
    };

    const handleSaveModelThreshold = async () => {
        if (!editingModel) return;
        if (newThreshold === '' || isNaN(parseFloat(newThreshold))) {
            Swal.fire({ icon: 'error', title: 'Precision Error', text: 'Threshold must be a precise numeric factor.' });
            return;
        }

        setIsModelSaving(true);
        try {
            await apiClient.put(`/api/ml/models/${editingModel.id}/threshold`, {
                manual_threshold: parseFloat(newThreshold)
            });
            Swal.fire({
                icon: 'success',
                title: 'Synapse Updated',
                text: `Model sensitivity factor synchronized.`,
                timer: 1500,
                showConfirmButton: false
            });
            await fetchAllModels();
            setEditingModel(null);
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Sync Interrupted',
                text: error.response?.data?.error || 'Failed to update neural weights.'
            });
        } finally {
            setIsModelSaving(false);
        }
    };

    const handleDeleteModelGroup = (group) => {
        Swal.fire({
            title: 'Wipe Model Cluster?',
            text: `Remove all intelligence modules for ${group.project_name} (v${group.version})?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, Purge Cluster',
            cancelButtonColor: '#ffffff',
            cancelButtonText: 'Keep'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    for (const method of group.methods) {
                        await apiClient.delete(`/api/ml/models/${method.id}`);
                    }
                    Swal.fire({
                        icon: 'success',
                        title: 'Memory Cleared',
                        text: 'Intelligence cluster purged.',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    await fetchAllModels();
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Purge Failed',
                        text: error.response?.data?.error || 'Model lock active.'
                    });
                }
            }
        });
    };

    const getThresholdDisplay = (parameters) => {
        if (!parameters) return 'N/A';
        let params = parameters;
        if (typeof params === 'string') {
            try { params = JSON.parse(params); } catch (e) { return 'N/A'; }
        }
        if (params.MANUAL_THRESHOLD !== undefined) {
            return parseFloat(params.MANUAL_THRESHOLD).toFixed(4);
        }
        return 'N/A';
    };

    const tabs = [
        { id: 'models', label: 'Models', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', count: groupedModels.length },
        { id: 'devices', label: 'Devices', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', count: devices.length },
        { id: 'machines', label: 'Machines', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z M15 12a3 3 0 11-6 0 3 3 0 016 0z', count: machines.length },
        { id: 'users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', count: users.length }
    ];

    return (
        <div className="min-h-screen w-full bg-slate-50/50 p-4 md:p-8 flex flex-col items-center font-sans selection:bg-primary/10">
            <motion.main 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-6xl bg-white/70 backdrop-blur-xl rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 lg:p-10 shadow-2xl shadow-slate-200/50 border border-white relative overflow-hidden"
                style={{ scrollbarGutter: 'stable' }}
            >
                {/* Page Header */}
                <div className="mb-6 flex items-center gap-4 relative z-10">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 text-primary rounded-xl sm:rounded-2xl flex items-center justify-center border border-primary/5 shadow-inner flex-shrink-0">
                        <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Database <span className="text-primary/70">Manager</span></h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">Administration Panel</p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="mb-6 border-b border-slate-200">
                    <nav className="flex gap-0 -mb-px overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" aria-label="Tabs">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative flex items-center gap-2 px-4 md:px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-all duration-200 ${
                                    activeTab === tab.id
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
                                }`}
                            >
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} /></svg>
                                <span>{tab.label}</span>
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400'
                                }`}>{tab.count}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Main Content Area - w-full ensures consistent width across all tabs */}
                <AnimatePresence mode="wait">
                    {activeTab === 'models' ? (
                        <motion.div 
                            key="tab-models"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="w-full space-y-6"
                        >
                            {/* Section Toolbar */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <div className="relative flex-1">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <input 
                                        type="text"
                                        placeholder="Search by KKS code..."
                                        value={kksSearch}
                                        onChange={(e) => setKksSearch(e.target.value)}
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 text-sm text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-2 px-1 sm:px-0">
                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{groupedModels.length} models</span>
                                </div>
                            </div>

                            {/* Models Matrix (Responsive Layout) */}
                            {isModelsLoading ? (
                                <ModuleLoader text="Loading models..." />
                            ) : groupedModels.length > 0 ? (
                                <>
                                    {/* Desktop Table */}
                                    <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Model / Point</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">KKS</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Version</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Thresholds (AE / VAE / PCA)</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {groupedModels.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(group => (
                                                        <NewModelRow key={group.key} group={group} onEdit={handleEditModelClick} onDelete={handleDeleteModelGroup} getThresholdDisplay={getThresholdDisplay} />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Mobile Cards */}
                                    <div className="md:hidden space-y-4">
                                        {groupedModels.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(group => (
                                            <div key={group.key} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-9 h-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0">
                                                            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-slate-900 leading-tight truncate">{group.project_name}</p>
                                                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                                <span className="text-[10px] font-semibold text-white bg-primary px-1.5 py-0.5 rounded shrink-0">PT {group.measurement_point}</span>
                                                                <span className="text-[10px] font-medium text-slate-400 shrink-0">{group.measurement_type}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-1 bg-primary/5 border border-primary/10 rounded-md text-primary text-[10px] font-bold shrink-0 max-w-[120px] truncate">{group.kks}</span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg">
                                                    <div>
                                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Version</p>
                                                        <p className="text-xs font-bold text-primary">v{group.version}</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1 mb-1">
                                                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Thresholds</p>
                                                            <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                        </div>
                                                        <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                                            {['AE', 'VAE', 'PCA'].map(mName => {
                                                                const m = group.methods.find(x => x.method_name === mName);
                                                                return m ? (
                                                                    <button 
                                                                        key={mName}
                                                                        onClick={() => handleEditModelClick(m)}
                                                                        className="flex flex-col items-center active:scale-95 transition-transform group/mbtn shrink-0"
                                                                    >
                                                                        <span className="text-[9px] font-semibold text-primary mb-0.5">{mName}</span>
                                                                        <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-primary border border-primary/20 shadow-sm group-hover/mbtn:bg-primary group-hover/mbtn:text-white transition-colors">
                                                                            {getThresholdDisplay(m.parameters)}
                                                                        </div>
                                                                    </button>
                                                                ) : (
                                                                    <div key={mName} className="flex flex-col items-center opacity-40 shrink-0">
                                                                        <span className="text-[9px] font-semibold text-slate-400 mb-0.5">{mName}</span>
                                                                        <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-400 border border-transparent">
                                                                            --
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="pt-2 border-t border-slate-100">
                                                    <button 
                                                        onClick={() => handleDeleteModelGroup(group)}
                                                        className="w-full h-9 bg-rose-50 text-rose-500 rounded-lg font-semibold text-xs border border-rose-100 flex items-center justify-center gap-1.5 hover:bg-rose-100 transition-colors"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg>
                                                        Delete Model Cluster
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <Pagination 
                                        totalItems={groupedModels.length} 
                                        itemsPerPage={itemsPerPage} 
                                        currentPage={currentPage} 
                                        onPageChange={setCurrentPage} 
                                    />
                                </>
                            ) : (
                                <NewEmptyState icon="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" title="No Models Found" description="No models match the current search criteria." />
                            )}
                        </motion.div>
                    ) : activeTab === 'devices' ? (
                        <motion.div 
                            key="tab-devices"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="w-full space-y-6"
                        >
                            {/* Section Toolbar */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <div className="relative flex-1">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <input 
                                        type="text"
                                        placeholder="Search by device name..."
                                        value={deviceSearch}
                                        onChange={(e) => setDeviceSearch(e.target.value)}
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 text-sm text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400"
                                    />
                                </div>
                                <button 
                                    onClick={() => handleOpenDeviceModal()}
                                    className="h-10 px-5 bg-primary text-white rounded-lg font-semibold text-sm shadow-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                                    <span className="whitespace-nowrap">Add Device</span>
                                </button>
                            </div>

                            {/* Device List */}
                            {isDevicesLoading ? (
                                <ModuleLoader text="Loading devices..." />
                            ) : devices.length > 0 ? (
                                <>
                                    {/* Desktop Table */}
                                    <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Device Name</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Vibration Gain</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Sound Gain</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-sm">
                                                    {devices.filter(d => d.device_name?.toLowerCase().includes(deviceSearch.toLowerCase())).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(device => (
                                                        <tr key={device.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-5 py-3 font-semibold text-slate-900">{device.device_name}</td>
                                                            <td className="px-5 py-3 text-center">
                                                                <span className="font-mono font-bold text-primary">{parseFloat(device.device_gain_vibration).toFixed(3)}</span>
                                                            </td>
                                                            <td className="px-5 py-3 text-center">
                                                                <span className="font-mono font-bold text-amber-600">{parseFloat(device.device_gain_sound).toFixed(3)}</span>
                                                            </td>
                                                            <td className="px-5 py-3">
                                                                <span className="font-mono text-xs text-slate-400">{device.id.toString(16).toUpperCase()}</span>
                                                            </td>
                                                            <td className="px-5 py-3 text-right space-x-1">
                                                                <button onClick={() => handleOpenDeviceModal(device)} className="text-slate-400 hover:text-primary hover:bg-primary/5 p-1.5 rounded-lg transition-colors" title="Edit"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2"/></svg></button>
                                                                <button onClick={() => handleDeleteDevice(device)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors" title="Delete"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Mobile Cards */}
                                    <div className="md:hidden space-y-3">
                                        {devices.filter(d => d.device_name?.toLowerCase().includes(deviceSearch.toLowerCase())).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(device => (
                                            <div key={device.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                <div className="flex items-start justify-between mb-3 gap-2">
                                                    <div className="min-w-0 pr-2">
                                                        <p className="text-sm font-bold text-slate-900 truncate">{device.device_name}</p>
                                                        <span className="font-mono text-[10px] text-slate-300 truncate block">{device.id.toString(16).toUpperCase()}</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-3 mb-3">
                                                    <div className="flex-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                                                        <span className="text-[10px] font-semibold text-primary uppercase block mb-0.5">Vibration Gain</span>
                                                        <span className="text-sm font-bold text-slate-900 font-mono">{parseFloat(device.device_gain_vibration).toFixed(3)}</span>
                                                    </div>
                                                    <div className="flex-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                                                        <span className="text-[10px] font-semibold text-amber-600 uppercase block mb-0.5">Sound Gain</span>
                                                        <span className="text-sm font-bold text-slate-900 font-mono">{parseFloat(device.device_gain_sound).toFixed(3)}</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 pt-2 border-t border-slate-100">
                                                    <button onClick={() => handleOpenDeviceModal(device)} className="flex-1 h-9 bg-primary/5 text-primary rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-primary/10 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2"/></svg>
                                                        Edit
                                                    </button>
                                                    <button onClick={() => handleDeleteDevice(device)} className="flex-1 h-9 bg-rose-50 text-rose-500 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-rose-100 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg>
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <Pagination 
                                        totalItems={devices.filter(d => d.device_name?.toLowerCase().includes(deviceSearch.toLowerCase())).length} 
                                        itemsPerPage={itemsPerPage} 
                                        currentPage={currentPage} 
                                        onPageChange={setCurrentPage} 
                                    />
                                </>
                            ) : (
                                <NewEmptyState icon="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10" title="No Devices Found" description="No sensing devices have been registered yet." />
                            )}
                        </motion.div>
                    ) : activeTab === 'machines' ? (
                        <motion.div 
                            key="tab-machines"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="w-full space-y-6"
                        >
                            {/* Section Toolbar */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <div className="relative flex-1">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <input 
                                        type="text"
                                        placeholder="Filter by KKS or name..."
                                        value={machineSearch}
                                        onChange={(e) => setMachineSearch(e.target.value)}
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 text-sm text-slate-900 outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-slate-400"
                                    />
                                </div>
                                <button 
                                    onClick={() => handleOpenMachineModal()}
                                    className="h-10 px-5 bg-primary text-white rounded-lg font-semibold text-sm shadow-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                                    <span className="whitespace-nowrap">Add Machine</span>
                                </button>
                            </div>

                            {isMachinesLoading ? (
                                <ModuleLoader text="Loading machines..." />
                            ) : (
                                <>
                                    {/* Desktop Table */}
                                    <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">KKS</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit / Plant</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-sm">
                                                    {machines.filter(m => (m.kks?.toLowerCase().includes(machineSearch.toLowerCase()) || m.name?.toLowerCase().includes(machineSearch.toLowerCase()))).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(m => (
                                                        <tr key={m.kks} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-5 py-3 font-bold text-primary">{m.kks}</td>
                                                            <td className="px-5 py-3 font-medium text-slate-700">{m.name}</td>
                                                            <td className="px-5 py-3 text-slate-400">{m.unit} / {m.plant}</td>
                                                            <td className="px-5 py-3 text-right space-x-1">
                                                                <button onClick={() => handleOpenMachineModal(m)} className="text-slate-400 hover:text-primary hover:bg-primary/5 p-1.5 rounded-lg transition-colors" title="Edit"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2"/></svg></button>
                                                                <button onClick={() => handleDeleteMachine(m)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors" title="Delete"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Mobile Cards */}
                                    <div className="md:hidden space-y-3">
                                        {machines.filter(m => (m.kks?.toLowerCase().includes(machineSearch.toLowerCase()) || m.name?.toLowerCase().includes(machineSearch.toLowerCase()))).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(m => (
                                            <div key={m.kks} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                <div className="flex justify-between items-start mb-3 gap-2">
                                                    <div className="min-w-0 pr-2">
                                                        <p className="text-sm font-bold text-slate-900 leading-tight truncate">{m.name}</p>
                                                        <span className="text-xs font-bold text-primary truncate block">{m.kks}</span>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3 mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                                    <div>
                                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Unit</p>
                                                        <p className="text-xs font-semibold text-slate-700">{m.unit || '---'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Plant</p>
                                                        <p className="text-xs font-semibold text-slate-700">{m.plant || '---'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 pt-2 border-t border-slate-100">
                                                    <button onClick={() => handleOpenMachineModal(m)} className="flex-1 h-9 bg-primary/5 text-primary rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-primary/10 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2"/></svg>
                                                        Edit
                                                    </button>
                                                    <button onClick={() => handleDeleteMachine(m)} className="flex-1 h-9 bg-rose-50 text-rose-500 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-rose-100 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg>
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <Pagination 
                                        totalItems={machines.filter(m => (m.kks?.toLowerCase().includes(machineSearch.toLowerCase()) || m.name?.toLowerCase().includes(machineSearch.toLowerCase()))).length} 
                                        itemsPerPage={itemsPerPage} 
                                        currentPage={currentPage} 
                                        onPageChange={setCurrentPage} 
                                    />
                                </>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="tab-users"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="w-full space-y-6"
                        >
                            {/* Section Toolbar */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <div className="relative flex-1">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <input 
                                        type="text"
                                        placeholder="Search by username or email..."
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 text-sm text-slate-900 outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-slate-400"
                                    />
                                </div>
                                <button 
                                    onClick={() => handleOpenUserModal()}
                                    className="h-10 px-5 bg-primary text-white rounded-lg font-semibold text-sm shadow-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                    <span className="whitespace-nowrap">Add User</span>
                                </button>
                            </div>

                            {isUsersLoading ? (
                                <ModuleLoader text="Loading users..." />
                            ) : (
                                <>
                                    {/* Desktop Table */}
                                    <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Username</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-sm">
                                                    {users.filter(u => u.username?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(u => (
                                                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-5 py-3">
                                                                <div className="flex items-center gap-2.5">
                                                                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{u.username ? u.username[0].toUpperCase() : '?'}</div>
                                                                    <span className="font-semibold text-slate-900">{u.username}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-5 py-3 text-slate-400">{u.email}</td>
                                                            <td className="px-5 py-3">
                                                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500'}`}>
                                                                    {u.role}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-3 text-right space-x-1">
                                                                <button onClick={() => handleOpenUserModal(u)} className="text-slate-400 hover:text-primary hover:bg-primary/5 p-1.5 rounded-lg transition-colors" title="Edit"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2"/></svg></button>
                                                                <button onClick={() => handleDeleteUser(u)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors" title="Delete"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Mobile Cards */}
                                    <div className="md:hidden space-y-3">
                                        {users.filter(u => u.username?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(u => (
                                            <div key={u.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                <div className="flex justify-between items-center mb-3 gap-2">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">{u.username ? u.username[0].toUpperCase() : '?'}</div>
                                                        <div className="min-w-0 pr-2">
                                                            <p className="text-sm font-bold text-slate-900 leading-none truncate">{u.username}</p>
                                                            <p className="text-xs text-slate-400 mt-0.5 truncate">{u.email}</p>
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase shrink-0 ${u.role === 'admin' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500'}`}>
                                                        {u.role}
                                                    </span>
                                                </div>
                                                <div className="flex gap-2 pt-2 border-t border-slate-100">
                                                    <button onClick={() => handleOpenUserModal(u)} className="flex-1 h-9 bg-primary/5 text-primary rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-primary/10 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2"/></svg>
                                                        Edit
                                                    </button>
                                                    <button onClick={() => handleDeleteUser(u)} className="flex-1 h-9 bg-rose-50 text-rose-500 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-rose-100 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2"/></svg>
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <Pagination 
                                        totalItems={users.filter(u => u.username?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())).length} 
                                        itemsPerPage={itemsPerPage} 
                                        currentPage={currentPage} 
                                        onPageChange={setCurrentPage} 
                                    />
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.main>

            {/* Compact Modals */}
            <RedesignedDeviceModal 
                isOpen={isDeviceModalOpen} 
                onClose={handleCloseDeviceModal} 
                formData={deviceFormData} 
                onInputChange={handleDeviceInputChange} 
                onSave={handleSaveDevice} 
                isSaving={isDeviceSaving} 
                editingDevice={editingDevice} 
            />

            <RedesignedModelModal 
                model={editingModel} 
                isOpen={!!editingModel} 
                onClose={() => setEditingModel(null)} 
                threshold={newThreshold} 
                onThresholdChange={setNewThreshold} 
                onSave={handleSaveModelThreshold} 
                isSaving={isModelSaving} 
            />

            <RedesignedMachineModal 
                isOpen={isMachineModalOpen} 
                onClose={() => setIsMachineModalOpen(false)} 
                formData={machineFormData} 
                onInputChange={(e) => setMachineFormData({...machineFormData, [e.target.name]: e.target.value})} 
                onSave={handleSaveMachine} 
                isSaving={isMachineSaving} 
                editingMachine={editingMachine} 
            />

            <RedesignedUserModal 
                isOpen={isUserModalOpen} 
                onClose={() => setIsUserModalOpen(false)} 
                formData={userFormData} 
                onInputChange={(e) => setUserFormData({...userFormData, [e.target.name]: e.target.value})} 
                onSave={handleSaveUser} 
                isSaving={isUserSaving} 
                editingUser={editingUser} 
            />
        </div>
    );
}

const NewModelRow = ({ group, onEdit, onDelete, getThresholdDisplay }) => {
    const methods = [ 'AE', 'VAE', 'PCA' ];
    return (
        <tr className="hover:bg-slate-50 transition-colors group">
            <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900 leading-tight">{group.project_name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-semibold text-white bg-primary px-1.5 py-0.5 rounded">PT {group.measurement_point}</span>
                            <span className="text-[10px] font-medium text-slate-400">{group.measurement_type}</span>
                        </div>
                    </div>
                </div>
            </td>
            <td className="px-5 py-3.5">
                <span className="inline-flex px-2.5 py-1 rounded-md bg-primary/5 border border-primary/10 text-primary text-xs font-bold">{group.kks}</span>
            </td>
            <td className="px-5 py-3.5 text-center">
                <span className="text-xs font-semibold text-slate-500">v{group.version}</span>
            </td>
            <td className="px-5 py-3.5">
                <div className="flex justify-center gap-3">
                    {methods.map(mName => {
                        const m = group.methods.find(x => x.method_name === mName);
                        return m ? (
                            <button 
                                key={mName}
                                onClick={() => onEdit(m)}
                                className="flex flex-col items-center group/btn"
                            >
                                <span className={`text-[10px] font-semibold mb-0.5 ${m.is_active ? 'text-primary' : 'text-slate-300'}`}>{mName}</span>
                                <div className={`h-7 px-2.5 flex items-center justify-center rounded-md font-mono text-xs font-bold border transition-all hover:shadow-sm ${m.is_active ? 'bg-white border-primary/30 text-primary' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                                    {getThresholdDisplay(m.parameters)}
                                </div>
                            </button>
                        ) : (
                            <div key={mName} className="flex flex-col items-center opacity-30">
                                <span className="text-[10px] font-semibold text-slate-400 mb-0.5">{mName}</span>
                                <div className="h-7 px-2.5 flex items-center justify-center rounded-md bg-slate-50 border border-slate-100 text-slate-300 text-xs">---</div>
                            </div>
                        );
                    })}
                </div>
            </td>
            <td className="px-5 py-3.5 text-center">
                <button 
                    onClick={() => onDelete(group)}
                    className="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all" title="Delete group"
                >
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </td>
        </tr>
    );
};

// Note: NewDeviceCard is defined but not used in the current implementation.
// It is kept for potential future use or as a reference.
const NewDeviceCard = ({ device, onEdit, onDelete }) => (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 leading-tight">{device.device_name}</h3>
            <span className="font-mono text-[10px] text-slate-300 font-semibold">{device.id.toString(16).toUpperCase()}</span>
        </div>
        
        <div className="flex gap-3 mb-4">
            <div className="flex-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                <span className="text-[10px] font-semibold text-primary uppercase block mb-0.5">Vibration Gain</span>
                <span className="text-sm font-bold text-slate-900 font-mono">{parseFloat(device.device_gain_vibration).toFixed(3)}</span>
            </div>
            <div className="flex-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                <span className="text-[10px] font-semibold text-amber-600 uppercase block mb-0.5">Sound Gain</span>
                <span className="text-sm font-bold text-slate-900 font-mono">{parseFloat(device.device_gain_sound).toFixed(3)}</span>
            </div>
        </div>

        <div className="flex items-center justify-end gap-1.5 pt-3 border-t border-slate-100">
            <button onClick={() => onEdit(device)} className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors" title="Edit">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
            <button onClick={() => onDelete(device)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors" title="Delete">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        </div>
    </div>
);

const RedesignedDeviceModal = ({ isOpen, onClose, formData, onInputChange, onSave, isSaving, editingDevice }) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl relative my-auto" onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-5">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">{editingDevice ? 'Edit' : 'New'} Device</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Configure device parameters</p>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <form onSubmit={onSave} className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Device Name</label>
                            <input 
                                type="text" name="device_name" value={formData.device_name} onChange={onInputChange}
                                placeholder="Enter device identifier"
                                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Vibration Gain</label>
                                <input 
                                    type="number" step="0.001" name="device_gain_vibration" value={formData.device_gain_vibration} onChange={onInputChange}
                                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 font-mono text-sm font-semibold text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Sound Gain</label>
                                <input 
                                    type="number" step="0.001" name="device_gain_sound" value={formData.device_gain_sound} onChange={onInputChange}
                                    className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 font-mono text-sm font-semibold text-slate-900 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-lg border border-slate-200 text-slate-500 font-semibold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                            <button type="submit" disabled={isSaving} className="flex-[2] h-11 rounded-lg bg-primary text-white font-semibold text-sm shadow-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                                {isSaving ? <LoaderIcon /> : 'Save Device'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

const RedesignedMachineModal = ({ isOpen, onClose, formData, onInputChange, onSave, isSaving, editingMachine }) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl relative my-auto" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-slate-900 mb-5">{editingMachine ? 'Edit' : 'New'} Machine</h3>
                    <form onSubmit={onSave} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">KKS Code</label>
                                <input type="text" name="kks" value={formData.kks} onChange={onInputChange} disabled={!!editingMachine} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all disabled:opacity-50" placeholder="e.g., MMP-XXX" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Machine Name</label>
                                <input type="text" name="name" value={formData.name} onChange={onInputChange} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all" placeholder="Cooling Pump A" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Unit</label>
                                <input type="text" name="unit" value={formData.unit} onChange={onInputChange} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all" placeholder="U1" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Plant</label>
                                <input type="text" name="plant" value={formData.plant} onChange={onInputChange} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all" placeholder="MMPS" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Measurement Point</label>
                                <input type="number" name="measurement_point" value={formData.measurement_point} onChange={onInputChange} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all" placeholder="1" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-500 mb-1 block">Interval (Sec)</label>
                                <input type="number" name="measurement_interval" value={formData.measurement_interval} onChange={onInputChange} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all" placeholder="30" />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-lg border border-slate-200 text-slate-500 font-semibold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                            <button type="submit" disabled={isSaving} className="flex-[2] h-11 rounded-lg bg-primary text-white font-semibold text-sm shadow-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                                {isSaving ? <LoaderIcon /> : 'Save Machine'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

const RedesignedUserModal = ({ isOpen, onClose, formData, onInputChange, onSave, isSaving, editingUser }) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl relative my-auto" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-slate-900 mb-5">{editingUser ? 'Edit' : 'Add'} User</h3>
                    <form onSubmit={onSave} className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Username</label>
                            <input type="text" name="username" value={formData.username} onChange={onInputChange} disabled={!!editingUser} placeholder="Username" className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all disabled:opacity-50"  />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Email</label>
                            <input type="email" name="email" value={formData.email} onChange={onInputChange} placeholder="Email" className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all" />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Role</label>
                            <select name="role" value={formData.role} onChange={onInputChange} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all">
                                <option value="user">User</option>
                                <option value="admin">Administrator (DB Manager)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Password {editingUser && '(leave blank to keep current)'}</label>
                            <input type="password" name="password" value={formData.password} onChange={onInputChange} className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-4 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all" placeholder="••••••••" />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-lg border border-slate-200 text-slate-500 font-semibold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                            <button type="submit" disabled={isSaving} className="flex-[2] h-11 rounded-lg bg-primary text-white font-semibold text-sm shadow-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                                {isSaving ? <LoaderIcon /> : 'Save User'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

const RedesignedModelModal = ({ model, isOpen, onClose, threshold, onThresholdChange, onSave, isSaving }) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-sm shadow-2xl relative my-auto" onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="text-lg font-bold text-slate-900">Edit Threshold</h3>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-5 text-center">
                        <span className="px-2.5 py-1 bg-primary text-white rounded-md text-[10px] font-bold uppercase">{model?.method_name}</span>
                        <p className="text-sm font-bold text-slate-900 mt-2 truncate">{model?.project_name}</p>
                    </div>

                    <div className="mb-5">
                        <label className="text-xs font-medium text-slate-500 mb-1 block text-center">Manual Threshold</label>
                        <input 
                            type="number" step="0.0001" value={threshold} onChange={(e) => onThresholdChange(e.target.value)}
                            className="w-full h-14 bg-slate-50 border border-slate-200 rounded-lg px-4 font-mono text-xl font-bold text-slate-900 text-center focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                            placeholder="0.0000"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 h-11 rounded-lg border border-slate-200 text-slate-500 font-semibold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
                        <button onClick={onSave} disabled={isSaving} className="flex-[2] h-11 rounded-lg bg-primary text-white font-semibold text-sm shadow-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                            {isSaving ? <LoaderIcon /> : 'Save Threshold'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

const ModuleLoader = ({ text }) => (
    <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-10 h-10 mb-4">
            <div className="absolute inset-0 border-3 border-slate-100 rounded-full"></div>
            <div className="absolute inset-0 border-3 border-primary rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-xs font-medium text-slate-400">{text}</p>
    </div>
);

const NewEmptyState = ({ icon, title, description }) => (
    <div className="bg-white rounded-xl border-2 border-dashed border-slate-200 py-16 px-6 flex flex-col items-center text-center">
        <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4 text-slate-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d={icon} /></svg>
        </div>
        <h3 className="text-sm font-bold text-slate-900 mb-1">{title}</h3>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">{description}</p>
    </div>
);

const Pagination = ({ totalItems, itemsPerPage, currentPage, onPageChange }) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        const pages = [];
        const maxVisiblePages = 5;

        if (totalPages <= maxVisiblePages + 2) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            
            if (currentPage > 3) {
                pages.push('...');
            }

            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            if (currentPage <= 3) {
                for (let i = 2; i <= 4; i++) pages.push(i);
            } else if (currentPage >= totalPages - 2) {
                for (let i = totalPages - 3; i <= totalPages - 1; i++) pages.push(i);
            } else {
                for (let i = start; i <= end; i++) pages.push(i);
            }

            if (currentPage < totalPages - 2) {
                pages.push('...');
            }

            pages.push(totalPages);
        }
        return pages;
    };

    const pages = getPageNumbers();

    return (
        <div className="flex items-center justify-center gap-1 mt-6">
            <button
                disabled={currentPage === 1}
                onClick={() => onPageChange(currentPage - 1)}
                className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex items-center gap-1">
                {pages.map((page, index) => (
                    page === '...' ? (
                        <span key={`ellipsis-${index}`} className="px-2 text-slate-300 font-bold select-none text-sm">...</span>
                    ) : (
                        <button
                            key={page}
                            onClick={() => onPageChange(page)}
                            className={`min-w-[36px] sm:min-w-[40px] h-9 sm:h-10 rounded-lg text-sm font-bold transition-all ${
                                currentPage === page
                                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                            }`}
                        >
                            {page}
                        </button>
                    )
                ))}
            </div>
            <button
                disabled={currentPage === totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </button>
        </div>
    );
};

const LoaderIcon = () => (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);