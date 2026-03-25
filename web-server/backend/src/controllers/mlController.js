const { sequelize } = require('../config/db');
const { MachineLog, AlertLog } = require('../models');
const minioService = require('../services/minioService');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const ML_SERVER_URL = process.env.ML_SERVER_URL || 'http://localhost:5000';

const getModels = async (req, res) => {
    try {
        const { kks, measurement_point, measurement_type } = req.query;

        if (!kks || !measurement_point || !measurement_type) {
            return res.status(400).json({ error: 'Missing required query parameters: kks, measurement_point, measurement_type' });
        }

        const [results] = await sequelize.query(`
            SELECT 
                m.id, m.kks, m.measurement_point, m.measurement_type, m.name as project_name, m.version, m.model_path, m.created_at, m.is_active,
                m.parameters,
                mt.name as method_name
            FROM ml_models m
            JOIN ml_methods mt ON m.method_id = mt.id
            WHERE LOWER(m.kks) = LOWER(:kks)
              AND REPLACE(CAST(m.measurement_point AS TEXT), 'P', '') = REPLACE(CAST(:measurement_point AS TEXT), 'P', '')
              AND LOWER(m.measurement_type) = LOWER(:measurement_type)
            ORDER BY m.version DESC
        `, {
            replacements: { kks, measurement_point, measurement_type }
        });

        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching ML models:', error);
        res.status(500).json({ error: error.message });
    }
};

const getAllModels = async (req, res) => {
    try {
        const [results] = await sequelize.query(`
            SELECT 
                m.id, m.kks, m.measurement_point, m.measurement_type, m.name as project_name, m.version, m.model_path, m.created_at, m.is_active,
                m.parameters,
                mt.name as method_name
            FROM ml_models m
            JOIN ml_methods mt ON m.method_id = mt.id
            ORDER BY m.kks ASC, m.measurement_point ASC, m.measurement_type ASC, m.version DESC
        `);

        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching all ML models:', error);
        res.status(500).json({ error: error.message });
    }
};

const getModelsByKks = async (req, res) => {
    try {
        const { kks } = req.params;

        if (!kks) {
            return res.status(400).json({ error: 'Missing required path parameter: kks' });
        }

        const [results] = await sequelize.query(`
            SELECT 
                m.id, m.kks, m.measurement_point, m.measurement_type, m.name as project_name, m.version, m.model_path, m.created_at, m.is_active,
                m.parameters,
                mt.name as method_name
            FROM ml_models m
            JOIN ml_methods mt ON m.method_id = mt.id
            WHERE LOWER(m.kks) = LOWER(:kks)
            ORDER BY m.measurement_point ASC, m.measurement_type ASC, m.version DESC
        `, {
            replacements: { kks }
        });

        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching ML models by KKS:', error);
        res.status(500).json({ error: error.message });
    }
};

const updateModelThreshold = async (req, res) => {
    try {
        const { id } = req.params;
        const { manual_threshold } = req.body;

        if (!id || manual_threshold === undefined) {
            return res.status(400).json({ error: 'Missing required parameters: id, manual_threshold' });
        }

        // Fetch current parameters first
        const [models] = await sequelize.query(`SELECT parameters FROM ml_models WHERE id = :id`, {
            replacements: { id: parseInt(id) }
        });

        if (!models || models.length === 0) {
            return res.status(404).json({ error: 'Model not found' });
        }

        let parameters = models[0].parameters || {};
        // If it's stored as a string, parse it
        if (typeof parameters === 'string') {
            try {
                parameters = JSON.parse(parameters);
            } catch (e) {
                console.warn('Could not parse parameters JSON:', e);
                parameters = {};
            }
        }

        // Update the MANUAL_THRESHOLD
        parameters.MANUAL_THRESHOLD = parseFloat(manual_threshold);

        // Save back to DB
        await sequelize.query(`
            UPDATE ml_models 
            SET parameters = :parameters 
            WHERE id = :id
        `, {
            replacements: {
                id: parseInt(id),
                parameters: JSON.stringify(parameters)
            }
        });

        res.status(200).json({ status: 'success', message: 'Threshold updated successfully' });
    } catch (error) {
        console.error('Error updating model threshold:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteModel = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'Missing required parameter: id' });
        }

        // Fetch the model to get its model_path
        const [models] = await sequelize.query(`SELECT model_path FROM ml_models WHERE id = :id`, {
            replacements: { id: parseInt(id) }
        });

        if (!models || models.length === 0) {
            return res.status(404).json({ error: 'Model not found' });
        }

        const modelPath = models[0].model_path;

        if (modelPath) {
            // model_path is like: kks/P1/vibration/models/baseline/v2/ae_model.bundle
            // We want to delete the whole folder: kks/P1/vibration/models/baseline/v2/
            const parts = modelPath.split('/');
            if (parts.length > 1) {
                parts.pop(); // remove the filename
                const folderPrefix = parts.join('/') + '/'; // add trailing slash

                // Delete from MinIO
                try {
                    await minioService.deleteFolder(folderPrefix);
                } catch (minioErr) {
                    console.error('Error deleting folder from MinIO, but continuing to delete DB record:', minioErr);
                    // Do not fail the DB deletion if MinIO fails, we might just have orphaned files
                }
            }
        }

        // Delete from DB permanently
        await sequelize.query(`DELETE FROM ml_models WHERE id = :id`, {
            replacements: { id: parseInt(id) }
        });

        res.status(200).json({ status: 'success', message: 'Model and associated files deleted successfully' });
    } catch (error) {
        console.error('Error deleting model:', error);
        res.status(500).json({ error: error.message });
    }
};


const proxyMlServer = async (req, res) => {
    // Determine the target path after /ml/
    // Example: req.originalUrl is /api/ml/v1/config -> target path is /v1/config
    const pathMatch = req.originalUrl.match(/\/ml(.*)/);
    const targetPath = pathMatch ? pathMatch[1] : '';

    if (!targetPath) {
        return res.status(400).json({ error: 'Invalid ML endpoint' });
    }

    try {
        const authHeader = req.headers.authorization;
        const targetUrl = `${ML_SERVER_URL}${targetPath}`;

        console.log(`[ML Proxy] Forwarding ${req.method} request to ${targetUrl}`);

        // Check if we need to stream the response (e.g. for train_all)
        const isStream = targetPath.includes('/train_all');

        const axiosConfig = {
            method: req.method,
            url: targetUrl,
            headers: {
                'Authorization': authHeader,
                'Content-Type': req.headers['content-type'] || 'application/json'
            },
            data: req.body,
            responseType: isStream ? 'stream' : 'json'
        };

        const response = await axios(axiosConfig);

        if (isStream) {
            // Forward headers and stream data
            res.set({
                'Content-Type': response.headers['content-type'],
                'Transfer-Encoding': response.headers['transfer-encoding'] || 'chunked',
                'Cache-Control': 'no-cache'
            });
            response.data.pipe(res);
        } else {
            res.status(response.status).json(response.data);
        }

    } catch (error) {
        console.error(`[ML Proxy Error] -> ${targetPath}:`, error.message);
        const status = error.response ? error.response.status : 500;
        const data = error.response ? error.response.data : { error: 'Failed to proxy request to ML server' };
        res.status(status).json(data);
    }
};

const predictTestAll = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        const { models } = req.body;
        if (!models) {
            return res.status(400).json({ error: 'models information is required' });
        }

        const form = new FormData();
        form.append('audio', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });
        form.append('models', models);

        const authHeader = req.headers.authorization;

        const response = await axios.post(`${ML_SERVER_URL}/v1/predict_test_all`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': authHeader
            }
        });

        res.status(200).json(response.data);

    } catch (error) {
        console.error('Error proxying multi-prediction:', error.message);
        res.status(500).json({ error: 'Failed to test models: ' + (error.response?.data?.error || error.message) });
    }
};

const listTrainingFiles = async (req, res) => {
    try {
        const { kks } = req.params;
        const { point, type, folder = 'train' } = req.query;

        if (!kks) {
            return res.status(400).json({ error: 'Missing required parameter: kks' });
        }

        // Build prefix: {kks}/P{point}/{type}/{folder}/
        // If point and type aren't provided, just search by kks prefix
        let prefix = `${kks}/`;
        if (point) {
            prefix += `P${point}/`;
            if (type) {
                prefix += `${type}/${folder}/`;
            }
        }

        const files = await minioService.listObjects(prefix);
        
        // Filter only .wav files (or any other relevant training files)
        const trainingFiles = files.filter(f => f.name.toLowerCase().endsWith('.wav'));

        res.status(200).json(trainingFiles);
    } catch (error) {
        console.error('Error listing training files:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getModels,
    getAllModels,
    getModelsByKks,
    updateModelThreshold,
    deleteModel,
    predictTestAll,
    proxyMlServer,
    listTrainingFiles
};
