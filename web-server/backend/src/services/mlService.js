const axios = require('axios');
require('dotenv').config();

const ML_SERVER_URL = process.env.ML_SERVER_URL || 'http://localhost:5000';
const ML_API_KEY = process.env.ML_API_KEY;

const triggerInference = async (fileName, kks, measurementPoint, measurementType = 'vibration') => {
    try {
        // As per ml-server/app/main.py, we use /v1/predict
        const response = await axios.post(`${ML_SERVER_URL}/v1/predict`, {
            bucket: process.env.MINIO_BUCKET_NAME || 'scu-data',
            filename: fileName,
            model_type: 'ae', // Default to Autoencoder for general anomaly detection
            kks: kks,
            measurement_point: measurementPoint,
            measurement_type: measurementType
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.ML_SERVER_TOKEN || ''}`, // Assuming ML server uses JWT as seen in main.py
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error triggering inference:', error.message);
        throw new Error('ML model trigger failed: ' + (error.response?.data?.error || error.message));
    }
};

module.exports = {
    triggerInference
};
