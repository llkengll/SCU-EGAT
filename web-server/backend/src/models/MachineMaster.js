const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MachineMaster = sequelize.define('MachineMaster', {
    kks: {
        type: DataTypes.STRING(100),
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    unit: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    plant: {
        type: DataTypes.STRING(100),
        allowNull: false
    }
}, {
    tableName: 'machine_master',
    underscored: true,
    timestamps: true
});

module.exports = MachineMaster;
