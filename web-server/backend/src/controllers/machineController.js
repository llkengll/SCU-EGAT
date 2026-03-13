const { MachineMaster, MachineConfig } = require('../models');
const { sequelize } = require('../config/db');

const getMachineByKks = async (req, res) => {
    try {
        const { kks } = req.params;

        // Query machine_master joined with machine_config
        const [results] = await sequelize.query(`
            SELECT 
                mm.kks, mm.name, mm.unit, mm.plant,
                mc.measurement_point, mc.measurement_interval
            FROM machine_master mm
            LEFT JOIN machine_config mc ON mm.kks = mc.kks
            WHERE mm.kks = :kks
        `, { replacements: { kks } });

        if (!results.length) {
            return res.status(404).json({ error: 'Machine not found' });
        }

        const machine = results[0];
        res.status(200).json({
            id: machine.kks,
            kks: machine.kks,
            name: machine.name,
            unit: machine.unit,
            plant: machine.plant,
            mtype: 'vibration',
            mpoint: machine.measurement_point || 1,
            mtime: machine.measurement_interval || 30
        });
    } catch (error) {
        console.error('Error fetching machine:', error);
        res.status(500).json({ error: error.message });
    }
};

const createMachineLog = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        const { kks, measurement_point, measurement_type, latitude, longitude, abnormal_case, anomalies } = req.body;

        if (!kks || !measurement_point || !measurement_type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const minioService = require('../services/minioService');
        const { MachineLog, AlertLog } = require('../models');

        let diagnosisFolder = 'Normal';
        if (abnormal_case && abnormal_case.toLowerCase() !== 'normal') {
            diagnosisFolder = abnormal_case.split('|')[0].replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/_$/, '');
        }

        const uploadResult = await minioService.uploadFile(
            req.file,
            kks,
            measurement_point,
            measurement_type,
            req.file.originalname,
            diagnosisFolder
        );

        const machineLog = await MachineLog.create({
            user_id: req.user?.id || 1,
            kks: kks,
            file_name: uploadResult.fileName,
            measurement_type: measurement_type,
            measurement_point: parseInt(measurement_point),
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            abnormal_case: abnormal_case || 'Normal'
        });

        if (anomalies) {
            const parsedAnomalies = JSON.parse(anomalies);
            for (const item of parsedAnomalies) {
                // Determine if we should keep or remove the alert
                const isAnomaly = item.is_anomaly === true || item.is_anomaly === 'true';

                if (isAnomaly) {
                    // Check if an alert for this machine/point already exists to update it
                    const existingAlert = await AlertLog.findOne({
                        where: {
                            kks: kks,
                            measurement_point: parseInt(measurement_point)
                        }
                    });

                    const alertData = {
                        machine_log_id: machineLog.id,
                        kks: kks,
                        measurement_point: parseInt(measurement_point),
                        model_name: item.model_name || 'unknown',
                        measurement_type: item.measurement_type || measurement_type,
                        is_anomaly: true,
                        abnormal_case: item.abnormal_case,
                        percent_match: item.percent_match,
                        details: item.details
                    };

                    if (existingAlert) {
                        await existingAlert.update(alertData);
                    } else {
                        await AlertLog.create(alertData);
                    }
                } else {
                    // If it's normal now, remove any existing alert for this point
                    await AlertLog.destroy({
                        where: {
                            kks: kks,
                            measurement_point: parseInt(measurement_point)
                        }
                    });
                }
            }
        }

        res.status(200).json({ status: 'success', upload: uploadResult, machine_log_id: machineLog.id });
    } catch (error) {
        console.error('Error in createMachineLog:', error);
        res.status(500).json({ error: error.message });
    }
};

const getAlertLogs = async (req, res) => {
    try {
        const { AlertLog } = require('../models');
        const logs = await AlertLog.findAll({
            order: [['updated_at', 'DESC']]
        });
        res.status(200).json(logs);
    } catch (error) {
        console.error('Error fetching alert logs:', error);
        res.status(500).json({ error: error.message });
    }
};

const getAllMachines = async (req, res) => {
    try {
        const machines = await MachineMaster.findAll({
            include: [{
                model: MachineConfig,
                as: 'config'
            }],
            order: [['kks', 'ASC']]
        });

        // Flatten the response for the frontend
        const response = machines.map(m => ({
            kks: m.kks,
            name: m.name,
            unit: m.unit,
            plant: m.plant,
            measurement_point: m.config?.measurement_point || 1,
            measurement_interval: m.config?.measurement_interval || 30
        }));

        res.status(200).json(response);
    } catch (error) {
        console.error('Error fetching all machines:', error);
        res.status(500).json({ error: error.message });
    }
};

const createMachine = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { kks, name, unit, plant, measurement_point, measurement_interval } = req.body;
        
        if (!kks || !name || !unit || !plant) {
            return res.status(400).json({ error: 'Missing required machine fields' });
        }

        const machine = await MachineMaster.create({ 
            kks, name, unit, plant 
        }, { transaction: t });

        await MachineConfig.create({
            kks,
            measurement_point: measurement_point || 1,
            measurement_interval: measurement_interval || 30
        }, { transaction: t });

        await t.commit();
        res.status(201).json(machine);
    } catch (error) {
        await t.rollback();
        console.error('Error creating machine:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateMachine = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { kks } = req.params;
        const { name, unit, plant, measurement_point, measurement_interval } = req.body;

        const machine = await MachineMaster.findByPk(kks, { transaction: t });
        if (!machine) {
            await t.rollback();
            return res.status(404).json({ error: 'Machine not found' });
        }

        await machine.update({ name, unit, plant }, { transaction: t });

        const [config] = await MachineConfig.findOrCreate({
            where: { kks },
            defaults: { measurement_point: 1, measurement_interval: 30 },
            transaction: t
        });

        await config.update({
            measurement_point: measurement_point || config.measurement_point,
            measurement_interval: measurement_interval || config.measurement_interval
        }, { transaction: t });

        await t.commit();
        res.status(200).json(machine);
    } catch (error) {
        await t.rollback();
        console.error('Error updating machine:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteMachine = async (req, res) => {
    try {
        const { kks } = req.params;
        const machine = await MachineMaster.findByPk(kks);
        if (!machine) {
            return res.status(404).json({ error: 'Machine not found' });
        }
        await machine.destroy();
        res.status(200).json({ message: 'Machine deleted' });
    } catch (error) {
        console.error('Error deleting machine:', error);
        res.status(500).json({ error: error.message });
    }
};

const searchMachines = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(200).json([]);

        const { Op } = require('sequelize');
        
        // Query machine_master
        const machines = await MachineMaster.findAll({
            where: {
                [Op.or]: [
                    { kks: { [Op.iLike]: `%${q}%` } },
                    { name: { [Op.iLike]: `%${q}%` } }
                ]
            },
            limit: 10
        });

        res.status(200).json(machines);
    } catch (error) {
        console.error('Error searching machines:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getMachineByKks,
    createMachineLog,
    getAlertLogs,
    getAllMachines,
    createMachine,
    updateMachine,
    deleteMachine,
    searchMachines
};
