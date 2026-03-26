const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MachineLog = sequelize.define('MachineLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    kks: {
        type: DataTypes.STRING(100),
        references: {
            model: 'machine_master',
            key: 'kks'
        }
    },
    file_name: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    measurement_type: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    measurement_point: {
        type: DataTypes.INTEGER
    },
    latitude: {
        type: DataTypes.DECIMAL(9, 6)
    },
    longitude: {
        type: DataTypes.DECIMAL(9, 6)
    },
    location: {
        type: DataTypes.STRING(100)
    },
    abnormal_case: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    tableName: 'machine_logs',
    underscored: true,
    timestamps: false // The schema doesn't specify 'updated_at' but 'created_at' should be there
});

// Adding manual 'created_at' as standard behavior
MachineLog.beforeCreate((log, options) => {
    log.created_at = new Date();
});

module.exports = MachineLog;
