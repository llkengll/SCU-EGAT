const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.POSTGRES_DB || 'scu_db',
    process.env.POSTGRES_USER || 'admin',
    process.env.POSTGRES_PASSWORD || 'admin123',
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    }
);

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('PostgreSQL Connected...');
    } catch (err) {
        console.error('PostgreSQL Connection Error:', err.message);
    }
};

module.exports = { sequelize, connectDB };
