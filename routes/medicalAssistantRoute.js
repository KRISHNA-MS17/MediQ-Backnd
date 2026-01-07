import express from 'express';
import { analyzeSymptoms } from '../controllers/medicalAssistantController.js';

const medicalAssistantRouter = express.Router();

// Test endpoint to check API key configuration and list available models
medicalAssistantRouter.get('/test', async (req, res) => {
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  const apiKeyLength = process.env.GEMINI_API_KEY?.length || 0;
  const trimmedKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  const trimmedKeyLength = trimmedKey.length;
  
  // Try to import and check genAI instance
  let genAICheck = false;
  let availableModels = [];
  let workingModel = null;
  let apiKeyValid = false;
  let apiTestError = null;
  
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const testGenAI = trimmedKey ? new GoogleGenerativeAI(trimmedKey) : null;
    genAICheck = !!testGenAI;
    
    if (trimmedKey && genAICheck) {
      // List available models
      try {
        const https = await import('https');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`;
        const data = await new Promise((resolve, reject) => {
          https.get(url, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
              try {
                resolve(JSON.parse(responseData));
              } catch (e) {
                reject(e);
              }
            });
          }).on('error', reject);
        });
        
        if (data.models) {
          availableModels = data.models
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => m.name.replace('models/', ''));
          console.log('[TEST] Available models:', availableModels);
        }
      } catch (listError) {
        console.error('[TEST] Error listing models:', listError.message);
      }
      
      // Try to find a working model
      const modelsToTry = [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-1.0-pro',
        'gemini-pro',
        'models/gemini-1.5-flash',
        'models/gemini-1.5-pro',
        'models/gemini-1.0-pro',
        'models/gemini-pro'
      ];
      
      // Also try models from the available list
      if (availableModels.length > 0) {
        modelsToTry.unshift(...availableModels.slice(0, 5));
      }
      
      for (const modelName of modelsToTry) {
        try {
          const model = testGenAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent('Say "test"');
          const response = await result.response;
          const text = response.text();
          if (text) {
            workingModel = modelName;
            apiKeyValid = true;
            console.log(`[TEST] Working model found: ${modelName}`);
            break;
          }
        } catch (modelError) {
          console.log(`[TEST] Model ${modelName} failed: ${modelError.message}`);
          continue;
        }
      }
      
      if (!apiKeyValid) {
        apiTestError = `No working model found. Tried: ${modelsToTry.join(', ')}. Available models: ${availableModels.join(', ') || 'Could not fetch'}`;
      }
    }
  } catch (error) {
    console.error('[TEST] Error:', error.message);
    apiTestError = error.message;
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
      workingModel: workingModel,
      availableModels: availableModels,
      apiTestError: apiTestError,
    },
  });
});

// Public endpoint - anyone can use the medical assistant
medicalAssistantRouter.post('/analyze-symptoms', analyzeSymptoms);

export default medicalAssistantRouter;

