const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MachineConfig = sequelize.define('MachineConfig', {
    kks: {
        type: DataTypes.STRING(100),
        primaryKey: true,
        references: {
            model: 'machine_master',
            key: 'kks'
        }
    },
    measurement_point: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    measurement_interval: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30
    }
}, {
    tableName: 'machine_config',
    underscored: true,
    timestamps: true
});

module.exports = MachineConfig;
