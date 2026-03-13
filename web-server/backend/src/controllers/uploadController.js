const minioService = require('../services/minioService');
const mlService = require('../services/mlService');

const uploadAudio = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { kks, measurement_point, measurement_type, filename, context, model_name, version } = req.body;

        // Pass context (e.g., 'train', 'inference'), model_name and version for folder structure
        const uploadResult = await minioService.uploadFile(req.file, kks, measurement_point, measurement_type, filename, context, model_name, version);

        // Trigger ML Service inference if context is 'inference'
        let mlResult = null;
        if (context === 'inference' || !context) {
            try {
                mlResult = await mlService.triggerInference(uploadResult.fileName, kks, measurement_point, measurement_type);
            } catch (mlError) {
                console.error('ML Inference warning:', mlError.message);
            }
        }

        res.status(200).json({
            message: 'File uploaded successfully',
            data: uploadResult,
            inference: mlResult
        });
    } catch (error) {
        console.error('Upload controller error:', error);
        res.status(500).json({ error: error.message });
    }
};

const uploadAllAudio = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { filename } = req.body;
        const uploadResult = await minioService.uploadToAll(req.file, filename);

        res.status(200).json({
            message: 'File uploaded to all folder successfully',
            data: uploadResult
        });
    } catch (error) {
        console.error('Upload all controller error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    uploadAudio,
    uploadAllAudio
};
