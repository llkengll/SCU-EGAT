const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AlertLog = sequelize.define('AlertLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    machine_log_id: {
        type: DataTypes.INTEGER,
        references: {
            model: 'machine_logs',
            key: 'id'
        }
    },
    kks: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    measurement_point: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    model_name: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    measurement_type: {
        type: DataTypes.STRING(50)
    },
    is_anomaly: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    abnormal_case: {
        type: DataTypes.STRING(255)
    },
    percent_match: {
        type: DataTypes.DECIMAL(5, 2)
    },
    details: {
        type: DataTypes.JSONB
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'alert_logs',
    underscored: true,
    timestamps: true
});

module.exports = AlertLog;
