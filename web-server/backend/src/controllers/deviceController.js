const { Device } = require('../models');

// @desc    Get all devices
// @route   GET /devices
exports.getAllDevices = async (req, res) => {
    try {
        const devices = await Device.findAll({
            order: [['created_at', 'DESC']]
        });
        res.json(devices);
    } catch (error) {
        console.error('Error fetching devices:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// @desc    Get device by ID
// @route   GET /devices/:id
exports.getDeviceById = async (req, res) => {
    try {
        const device = await Device.findByPk(req.params.id);
        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }
        res.json(device);
    } catch (error) {
        console.error('Error fetching device:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// @desc    Create new device
// @route   POST /devices
exports.createDevice = async (req, res) => {
    try {
        const { device_name, device_gain_vibration, device_gain_sound } = req.body;
        
        if (!device_name) {
            return res.status(400).json({ message: 'Device name is required' });
        }

        const device = await Device.create({ 
            device_name, 
            device_gain_vibration: device_gain_vibration || 1.0,
            device_gain_sound: device_gain_sound || 1.0
        });

        res.status(201).json(device);
    } catch (error) {
        console.error('Error creating device:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// @desc    Update device
// @route   PUT /devices/:id
exports.updateDevice = async (req, res) => {
    try {
        const { device_name, device_gain_vibration, device_gain_sound } = req.body;
        const device = await Device.findByPk(req.params.id);

        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        if (device_name) device.device_name = device_name;
        if (device_gain_vibration !== undefined) device.device_gain_vibration = device_gain_vibration;
        if (device_gain_sound !== undefined) device.device_gain_sound = device_gain_sound;
        
        await device.save();

        res.json(device);
    } catch (error) {
        console.error('Error updating device:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// @desc    Delete device
// @route   DELETE /devices/:id
exports.deleteDevice = async (req, res) => {
    try {
        const device = await Device.findByPk(req.params.id);

        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        await device.destroy();
        res.json({ message: 'Device deleted successfully' });
    } catch (error) {
        console.error('Error deleting device:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
