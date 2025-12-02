import express from 'express';
import { getETA } from '../controllers/etaController.js';
import authUser from '../middlewares/authUser.js';

const etaRouter = express.Router();

// Get ETA between two coordinates
etaRouter.get('/', authUser, getETA);

// Health check endpoint (no auth required for testing)
etaRouter.get('/health', (req, res) => {
    res.json({ success: true, message: 'ETA endpoint is working' });
});

export default etaRouter;

