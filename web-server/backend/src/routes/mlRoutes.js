const express = require('express');
const router = express.Router();
const multer = require('multer');
const mlController = require('../controllers/mlController');
const authMiddleware = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'audio/wav' || file.mimetype === 'audio/wave' || file.mimetype === 'audio/x-wav') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only WAV files are allowed.'), false);
        }
    }
});
router.get('/models', authMiddleware, mlController.getModels);
router.get('/models/all', authMiddleware, mlController.getAllModels);
router.get('/models/by-kks/:kks', authMiddleware, mlController.getModelsByKks);
router.put('/models/:id/threshold', authMiddleware, mlController.updateModelThreshold);
router.delete('/models/:id', authMiddleware, mlController.deleteModel);
router.post('/predict-test-all', authMiddleware, upload.single('audio'), mlController.predictTestAll);
router.get('/training-files/:kks', authMiddleware, mlController.listTrainingFiles);
router.all('/v1/*', authMiddleware, mlController.proxyMlServer);

module.exports = router;
