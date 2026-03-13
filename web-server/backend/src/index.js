const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { initializeBucket } = require('./services/minioService');
const { connectDB, sequelize } = require('./config/db');
require('./models'); // Load models and associations

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Routes
const uploadRoutes = require('./routes/uploadRoutes');
const authRoutes = require('./routes/authRoutes');
const machineRoutes = require('./routes/machineRoutes');
const mlRoutes = require('./routes/mlRoutes');
const deviceRoutes = require('./routes/deviceRoutes');

app.use('/upload', uploadRoutes);
app.use('/auth', authRoutes);
app.use('/machines', machineRoutes);
app.use('/ml', mlRoutes);
app.use('/devices', deviceRoutes);

// General endpoints
app.get('/', (req, res) => {
    res.json({ message: 'SCU Web API is running' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date() });
});

// Start server and initialize resources
const startServer = async () => {
    try {
        await connectDB(); // Connect to PostgreSQL
        await sequelize.sync(); // Sync tables (avoid {force: true} in prod)
        console.log('Database synced');
        await initializeBucket(); // Ensure MinIO bucket exists
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

startServer();

