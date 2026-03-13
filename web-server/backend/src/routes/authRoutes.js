const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const authMiddleware = require('../middleware/authMiddleware');

// @route   POST /auth/register
// @desc    Register a user
router.post('/register', authController.register);

// @route   POST /auth/login
// @desc    Login and get JWT token
router.post('/login', authController.login);

// @route   GET /auth/users
// @desc    Get all users
router.get('/users', authMiddleware, authController.getAllUsers);

// @route   PUT /auth/users/:id
// @desc    Update a user
router.put('/users/:id', authMiddleware, authController.updateUser);

// @route   DELETE /auth/users/:id
// @desc    Delete a user
router.delete('/users/:id', authMiddleware, authController.deleteUser);

module.exports = router;
