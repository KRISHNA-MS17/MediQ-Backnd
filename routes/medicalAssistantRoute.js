import express from 'express';
import { analyzeSymptoms } from '../controllers/medicalAssistantController.js';

const medicalAssistantRouter = express.Router();

// Public endpoint - anyone can use the medical assistant
medicalAssistantRouter.post('/analyze-symptoms', analyzeSymptoms);

export default medicalAssistantRouter;

