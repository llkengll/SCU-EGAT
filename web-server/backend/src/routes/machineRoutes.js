const express = require('express');
const router = express.Router();
const machineController = require('../controllers/machineController');
const authMiddleware = require('../middleware/authMiddleware');

const multer = require('multer');

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

// @route   GET /machines/search
// @desc    Search machines by KKS or name
router.get('/search', authMiddleware, machineController.searchMachines);

// @route   GET /machines
// @desc    Get all machines
router.get('/', authMiddleware, machineController.getAllMachines);

// @route   POST /machines
// @desc    Create new machine
router.post('/', authMiddleware, machineController.createMachine);

// @route   PUT /machines/:kks
// @desc    Update machine
router.put('/:kks', authMiddleware, machineController.updateMachine);

// @route   DELETE /machines/:kks
// @desc    Delete machine
router.delete('/:kks', authMiddleware, machineController.deleteMachine);

// @route   GET /machines/:kks
// @desc    Get machine by KKS
router.get('/:kks', authMiddleware, machineController.getMachineByKks);

// @route   POST /machines/logs
// @desc    Create new machine log and upload file
router.post('/logs', authMiddleware, upload.single('audio'), machineController.createMachineLog);

// @route   GET /machines/alerts
// @desc    Get all active alert logs
router.get('/alerts/all', authMiddleware, machineController.getAlertLogs);

module.exports = router;
