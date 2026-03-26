const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Device = sequelize.define('Device', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    device_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    device_gain_vibration: {
        type: DataTypes.DECIMAL(10, 3),
        defaultValue: 1.000
    },
    device_gain_sound: {
        type: DataTypes.DECIMAL(10, 3),
        defaultValue: 1.000,
        comment: 'Hardware or software gain setting for the device'
    }
}, {
    tableName: 'devices',
    underscored: true,
    timestamps: true, // This handles created_at and updated_at automatically
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = Device;
