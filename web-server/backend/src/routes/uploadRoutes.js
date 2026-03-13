const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadController = require('../controllers/uploadController');
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

router.post('/train', authMiddleware, upload.single('audio'), uploadController.uploadAudio);
router.post('/all', authMiddleware, upload.single('audio'), uploadController.uploadAllAudio);

module.exports = router;
