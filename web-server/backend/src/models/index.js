const User = require('./User');
const MachineMaster = require('./MachineMaster');
const MachineConfig = require('./MachineConfig');
const MachineLog = require('./MachineLog');
const AlertLog = require('./AlertLog');
const Device = require('./Device');

// Define Relationships
MachineLog.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(MachineLog, { foreignKey: 'user_id' });

MachineLog.belongsTo(MachineMaster, { foreignKey: 'kks' });
MachineMaster.hasMany(MachineLog, { foreignKey: 'kks' });

// 1:1 relationship between MachineMaster and MachineConfig
MachineMaster.hasOne(MachineConfig, { foreignKey: 'kks', as: 'config', onDelete: 'CASCADE' });
MachineConfig.belongsTo(MachineMaster, { foreignKey: 'kks', as: 'master' });

AlertLog.belongsTo(MachineLog, { foreignKey: 'machine_log_id' });
MachineLog.hasMany(AlertLog, { foreignKey: 'machine_log_id' });

module.exports = {
    User,
    MachineMaster,
    MachineConfig,
    MachineLog,
    AlertLog,
    Device
};
