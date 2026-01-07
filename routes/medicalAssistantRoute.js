import express from 'express';
import { analyzeSymptoms } from '../controllers/medicalAssistantController.js';

const medicalAssistantRouter = express.Router();

// Test endpoint to check API key configuration
medicalAssistantRouter.get('/test', async (req, res) => {
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  const apiKeyLength = process.env.GEMINI_API_KEY?.length || 0;
  const trimmedKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  const trimmedKeyLength = trimmedKey.length;
  
  // Try to import and check genAI instance
  let genAICheck = false;
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const testGenAI = trimmedKey ? new GoogleGenerativeAI(trimmedKey) : null;
    genAICheck = !!testGenAI;
  } catch (error) {
    console.error('[TEST] Error creating genAI instance:', error.message);
  }
  
  // Try a simple API call to verify the key works
  let apiKeyValid = false;
  let apiTestError = null;
  if (trimmedKey && genAICheck) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const testGenAI = new GoogleGenerativeAI(trimmedKey);
      const model = testGenAI.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent('Say "test"');
      const response = await result.response;
      const text = response.text();
      apiKeyValid = !!text;
    } catch (error) {
      apiTestError = error.message;
      console.error('[TEST] API key test failed:', error.message);
    }
  }
  
  res.json({
    success: true,
    message: 'Medical Assistant API is working',
    config: {
      hasApiKey: hasApiKey,
      apiKeyLength: apiKeyLength,
      trimmedKeyLength: trimmedKeyLength,
      apiKeyConfigured: hasApiKey && apiKeyLength > 0,
      genAICreated: genAICheck,
      apiKeyValid: apiKeyValid,
      apiTestError: apiTestError,
    },
  });
});

// Public endpoint - anyone can use the medical assistant
medicalAssistantRouter.post('/analyze-symptoms', analyzeSymptoms);

export default medicalAssistantRouter;

