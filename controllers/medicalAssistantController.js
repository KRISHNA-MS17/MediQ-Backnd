import { GoogleGenerativeAI } from '@google/generative-ai';
import doctorModel from '../models/doctorModel.js';

// Initialize Gemini AI
const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
console.log('═══════════════════════════════════════════════════════════════');
console.log('[GEMINI INIT] Initializing Gemini AI...');
console.log(`[GEMINI INIT] GEMINI_API_KEY from env exists: ${!!process.env.GEMINI_API_KEY}`);
console.log(`[GEMINI INIT] GEMINI_API_KEY from env length: ${process.env.GEMINI_API_KEY?.length || 0}`);
console.log(`[GEMINI INIT] geminiApiKey after trim exists: ${!!geminiApiKey}`);
console.log(`[GEMINI INIT] geminiApiKey after trim length: ${geminiApiKey.length}`);
console.log(`[GEMINI INIT] geminiApiKey first 10 chars: ${geminiApiKey.substring(0, 10)}...`);
console.log(`[GEMINI INIT] genAI instance will be created: ${!!geminiApiKey}`);
if (!geminiApiKey) {
  console.warn('⚠️  GEMINI_API_KEY not found. Medical Assistant will use fallback mode only.');
} else {
  console.log('✅ GEMINI_API_KEY found and configured');
}
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
console.log(`[GEMINI INIT] genAI instance created: ${!!genAI}`);
console.log('═══════════════════════════════════════════════════════════════');

// Cache for working model name
let cachedWorkingModel = null;

/**
 * Detect and cache the working Gemini model
 */
async function detectWorkingModel() {
  if (cachedWorkingModel) {
    console.log(`[GEMINI MODEL] Using cached working model: ${cachedWorkingModel}`);
    return cachedWorkingModel;
  }
  
  if (!genAI || !geminiApiKey) {
    console.error('[GEMINI MODEL] genAI or API key not available');
    return null;
  }
  
  // List of models to try (in order of preference)
  // Start with gemini-2.5-flash since we know it works from the test endpoint
  const modelsToTry = [
    'gemini-2.5-flash',  // Known working model from test
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-1.0-pro',
    'gemini-pro',
    'models/gemini-2.5-flash',
    'models/gemini-2.5-pro',
    'models/gemini-1.5-flash',
    'models/gemini-1.5-pro',
    'models/gemini-1.0-pro',
    'models/gemini-pro'
  ];
  
  // Try to fetch available models from API (non-blocking)
  try {
    const https = await import('https');
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`;
    const response = await new Promise((resolve, reject) => {
      const req = https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
    
    if (response.models) {
      const availableModels = response.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''));
      console.log('[GEMINI MODEL] Available models from API:', availableModels);
      // Prepend available models to the list
      modelsToTry.unshift(...availableModels.slice(0, 5));
    }
  } catch (error) {
    console.warn('[GEMINI MODEL] Could not fetch available models (non-critical):', error.message);
    // Continue with default models
  }
  
  // Try each model with a simple test
  for (const modelName of modelsToTry) {
    try {
      console.log(`[GEMINI MODEL] Testing model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('test');
      const response = await result.response;
      const text = response.text();
      if (text) {
        cachedWorkingModel = modelName;
        console.log(`[GEMINI MODEL] ✅ Working model detected and cached: ${modelName}`);
        return modelName;
      }
    } catch (error) {
      console.log(`[GEMINI MODEL] ❌ Model ${modelName} failed: ${error.message}`);
      continue;
    }
  }
  
  console.error('[GEMINI MODEL] ❌ No working model found after trying all models!');
  return null;
}

/**
 * Get available specializations from database
 */
async function getAvailableSpecializations() {
  try {
    const doctors = await doctorModel.find({ available: true }).select('speciality').lean();
    const specializations = [...new Set(doctors.map(doc => doc.speciality).filter(Boolean))];
    
    // If no specializations found, return common defaults
    if (specializations.length === 0) {
      return ['General Physician', 'Cardiologist', 'Dermatologist', 'Neurologist', 'ENT Specialist', 'Orthopedic Doctor', 'Pediatrician', 'Gynecologist'];
    }
    
    return specializations;
  } catch (error) {
    console.error('Error fetching specializations:', error);
    return ['General Physician', 'Cardiologist', 'Dermatologist', 'Neurologist', 'ENT Specialist', 'Orthopedic Doctor', 'Pediatrician', 'Gynecologist'];
  }
}

/**
 * Generate AI response using Gemini - RAW TEXT GENERATION ONLY
 * MANDATORY: This function MUST be called for EVERY request - no caching, no reuse
 * Returns natural language text from Gemini, not templates or static responses
 */
async function generateAIResponse(patientInput, availableSpecializations) {
  // Generate unique request ID with timestamp to prove each call is unique
  const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = new Date().toISOString();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`[GEMINI REQUEST] @ ${timestamp}`);
  console.log(`[GEMINI REQUEST] Request ID: ${requestId}`);
  console.log(`[GEMINI REQUEST] User Input: "${patientInput}"`);
  console.log(`[GEMINI REQUEST] Input Length: ${patientInput.length} characters`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Verify API key configuration BEFORE making API call
  console.log(`[GEMINI CHECK] @ ${timestamp} - Verifying API key configuration...`);
  console.log(`[GEMINI CHECK] genAI instance exists: ${!!genAI}`);
  console.log(`[GEMINI CHECK] geminiApiKey variable exists: ${!!geminiApiKey}`);
  console.log(`[GEMINI CHECK] GEMINI_API_KEY from env exists: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`[GEMINI CHECK] GEMINI_API_KEY from env length: ${process.env.GEMINI_API_KEY?.length || 0}`);
  console.log(`[GEMINI CHECK] geminiApiKey after trim length: ${geminiApiKey?.length || 0}`);
  if (geminiApiKey) {
    console.log(`[GEMINI CHECK] geminiApiKey first 10 chars: ${geminiApiKey.substring(0, 10)}...`);
    console.log(`[GEMINI CHECK] geminiApiKey last 10 chars: ...${geminiApiKey.substring(geminiApiKey.length - 10)}`);
  }
  
  if (!genAI || !geminiApiKey) {
    console.error(`[GEMINI ERROR] @ ${timestamp} - Gemini API not configured`);
    console.error(`[GEMINI ERROR] genAI instance: ${!!genAI}`);
    console.error(`[GEMINI ERROR] geminiApiKey variable: ${!!geminiApiKey}`);
    console.error(`[GEMINI ERROR] GEMINI_API_KEY from env exists: ${!!process.env.GEMINI_API_KEY}`);
    console.error(`[GEMINI ERROR] GEMINI_API_KEY from env length: ${process.env.GEMINI_API_KEY?.length || 0}`);
    console.error(`[GEMINI ERROR] geminiApiKey after trim length: ${geminiApiKey?.length || 0}`);
    throw new Error('Gemini API not configured - GEMINI_API_KEY environment variable is missing or invalid');
  }
  
  // Verify API key format
  if (geminiApiKey.length < 20) {
    console.error(`[GEMINI ERROR] @ ${timestamp} - API key seems too short (${geminiApiKey.length} chars)`);
    throw new Error('Gemini API key appears to be invalid (too short)');
  }
  
  console.log(`[GEMINI VERIFY] @ ${timestamp} - API key verified: length=${geminiApiKey.length}`);

  // Use gemini-2.5-flash directly (known working model from test endpoint)
  // Skip detection to avoid delays - we know this model works
  const workingModelName = cachedWorkingModel || 'gemini-2.5-flash';
  
  // Cache it for future requests
  if (!cachedWorkingModel) {
    cachedWorkingModel = 'gemini-2.5-flash';
  }
  
  console.log(`[GEMINI MODEL] Using model: ${workingModelName} (direct, no detection)`);
  
  // Create a fresh model instance for each request to avoid caching
  const safetySettings = [
    {
      category: 'HARM_CATEGORY_MEDICAL',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    }
  ];
  const generationConfig = {
    temperature: 0.9, // Higher temperature for more varied responses
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 1024,
  };
  
  let model;
  try {
    model = genAI.getGenerativeModel({ 
      model: workingModelName,
      safetySettings,
      generationConfig
    });
    console.log(`[GEMINI MODEL] ✅ Model instance created: ${workingModelName}`);
  } catch (modelError) {
    console.error(`[GEMINI MODEL] ❌ Failed with ${workingModelName}: ${modelError.message}`);
    // Try detection as fallback
    console.log(`[GEMINI MODEL] Attempting model detection...`);
    cachedWorkingModel = null;
    try {
      const detectedModel = await detectWorkingModel();
      if (detectedModel) {
        workingModelName = detectedModel;
        cachedWorkingModel = detectedModel;
        model = genAI.getGenerativeModel({ 
          model: workingModelName,
          safetySettings,
          generationConfig
        });
        console.log(`[GEMINI MODEL] ✅ Using detected model: ${workingModelName}`);
      } else {
        throw new Error(`Model detection failed. Original error: ${modelError.message}`);
      }
    } catch (detectError) {
      throw new Error(`Failed to create model instance. Tried ${workingModelName} and detection failed. Error: ${detectError.message}`);
    }
  }

  const availableSpecsList = availableSpecializations.join(', ');

  // Build clear, structured prompt for Gemini
  const prompt = `You are a helpful medical assistant. Analyze the patient's symptoms and provide guidance.

PATIENT SYMPTOMS: "${patientInput}"

AVAILABLE DOCTOR SPECIALIZATIONS: ${availableSpecsList}

YOUR TASK:
1. Provide basic first-aid guidance specific to these symptoms
2. Recommend the most appropriate doctor specialization from the list above
3. Write in a natural, conversational tone

CRITICAL RULES:
- DO NOT diagnose, prescribe medications, or give treatment plans
- DO NOT provide medication names or dosages
- ONLY provide basic first-aid measures and general wellness advice
- For chest pain, difficulty breathing, severe bleeding, or loss of consciousness, mark as emergency
- Your response MUST be specific to the exact symptoms - different symptoms = different advice

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no code blocks, just valid JSON):
{
  "aiText": "Write 3-4 sentences providing first-aid guidance for ${patientInput}. Be specific and helpful. Explain why you recommend a particular doctor type.",
  "recommendedSpecialization": "Choose ONE from: ${availableSpecsList}. Examples: 'Cardiologist' for chest pain, 'Dentist' for teeth pain, 'Orthopedic' for joint pain, 'Dermatologist' for skin issues, 'General physician' for general symptoms.",
  "isEmergency": false
}

IMPORTANT: 
- Return ONLY valid JSON, no other text
- recommendedSpecialization MUST match exactly one from: ${availableSpecsList}
- aiText should be natural conversation, not bullet points`;

  try {
    console.log(`[GEMINI API CALL] @ ${timestamp} - Calling Gemini API`);
    console.log(`[GEMINI API CALL] Model: ${workingModelName}`);
    console.log(`[GEMINI API CALL] User Input: "${patientInput}"`);
    console.log(`[GEMINI API CALL] Prompt length: ${prompt.length} characters`);
    
    if (!model) {
      throw new Error('Model instance is null - cannot generate content');
    }
    
    const callStartTime = Date.now();
    console.log(`[GEMINI API CALL] Starting API call...`);
    const result = await model.generateContent(prompt);
    const callEndTime = Date.now();
    const callDuration = callEndTime - callStartTime;
    
    console.log(`[GEMINI API CALL] ✅ API call completed successfully in ${callDuration}ms`);
    console.log(`[GEMINI API CALL] API key was used successfully!`);
    const response = await result.response;
    const text = response.text();
    
    const responseTimestamp = new Date().toISOString();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[GEMINI RESPONSE] @ ${responseTimestamp}`);
    console.log(`[GEMINI RESPONSE] Request ID: ${requestId}`);
    console.log(`[GEMINI RESPONSE] Raw response length: ${text.length} characters`);
    console.log(`[GEMINI RESPONSE] Raw response (first 800 chars):`);
    console.log(text.substring(0, 800));
    console.log(`[GEMINI RESPONSE] Full raw response:`);
    console.log(text);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON, use the raw text as aiText
      console.warn('[GEMINI] No JSON found, using raw text as aiText');
      return {
        aiText: text.trim(),
        recommendedSpecialization: 'General physician',
        isEmergency: false,
      };
    }
    
    let parsedResponse;
    try {
      // Try parsing the matched JSON
      const cleanedText = jsonMatch[0].replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('[GEMINI] JSON parse failed, extracting fields manually:', parseError.message);
      console.error('[GEMINI] Parse error details:', parseError);
      const cleanedText = jsonMatch[0];
      
      // Extract aiText and specialization
      const aiTextMatch = cleanedText.match(/"aiText"\s*:\s*"([^"]+(?:"[^"]*")*[^"]*)"/s) || 
                         cleanedText.match(/"aiText"\s*:\s*"([^"]+)"/);
      const specializationMatch = cleanedText.match(/"recommendedSpecialization"\s*:\s*"([^"]+)"/);
      const isEmergencyMatch = cleanedText.match(/"isEmergency"\s*:\s*(true|false)/);
      
      parsedResponse = {
        aiText: aiTextMatch ? aiTextMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : text.trim(),
        recommendedSpecialization: specializationMatch ? specializationMatch[1] : 'General physician',
        isEmergency: isEmergencyMatch ? isEmergencyMatch[1] === 'true' : false,
      };
    }
    
    // Validate response has aiText
    if (!parsedResponse.aiText || parsedResponse.aiText.trim().length === 0) {
      console.error('[GEMINI] No aiText in response, using raw text');
      parsedResponse.aiText = text.trim();
    }
    
    // Log parsed response for verification
    console.log(`[GEMINI PARSED] Request ID: ${requestId}`);
    console.log(`[GEMINI PARSED] aiText length: ${parsedResponse.aiText.length} characters`);
    console.log(`[GEMINI PARSED] aiText preview: "${parsedResponse.aiText.substring(0, 200)}..."`);
    console.log(`[GEMINI PARSED] Full aiText: "${parsedResponse.aiText}"`);
    console.log(`[GEMINI PARSED] Specialization: ${parsedResponse.recommendedSpecialization}`);
    console.log(`[GEMINI PARSED] Is Emergency: ${parsedResponse.isEmergency}`);
    
    // Ensure specialization is from available list (case-insensitive match with variations)
    const lowerSpecialization = (parsedResponse.recommendedSpecialization || '').toLowerCase().trim();
    let validSpecialization = availableSpecializations.find(
      spec => spec.toLowerCase() === lowerSpecialization
    );
    
    // If no exact match, try partial match
    if (!validSpecialization) {
      validSpecialization = availableSpecializations.find(
        spec => spec.toLowerCase().includes(lowerSpecialization) || lowerSpecialization.includes(spec.toLowerCase())
      );
    }
    
    // Map common variations to actual specializations
    if (!validSpecialization) {
      const specializationMap = {
        'dentist': 'Dentist',
        'dental': 'Dentist',
        'orthopedic': 'Orthopedic',
        'orthopedist': 'Orthopedic',
        'orthopedician': 'Orthopedic',
        'orthopedic doctor': 'Orthopedic',
        'cardiologist': 'Cardiologist',
        'cardiology': 'Cardiologist',
        'dermatologist': 'Dermatologist',
        'dermatology': 'Dermatologist',
        'neurologist': 'Neurologist',
        'neurology': 'Neurologist',
        'ent': 'ENT Specialist',
        'ent specialist': 'ENT Specialist',
        'ear nose throat': 'ENT Specialist',
        'ophthalmologist': 'Ophthalmologist',
        'eye': 'Ophthalmologist',
        'eye specialist': 'Ophthalmologist',
        'general physician': 'General physician',
        'general practitioner': 'General physician',
        'gp': 'General physician',
        'pediatrician': 'Pediatricians',
        'pediatricians': 'Pediatricians',
        'pediatrics': 'Pediatricians',
        'gynecologist': 'Gynecologist',
        'gynaecologist': 'Gynecologist',
      };
      
      validSpecialization = specializationMap[lowerSpecialization] || 'General physician';
      
      // Check if mapped specialization exists in available list
      if (!availableSpecializations.find(s => s.toLowerCase() === validSpecialization.toLowerCase())) {
        validSpecialization = 'General physician';
      }
    }
    
    parsedResponse.recommendedSpecialization = validSpecialization;
    
    console.log(`[GEMINI SUCCESS] Request ID: ${requestId} - Response generated successfully`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return parsedResponse;
  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`[GEMINI ERROR] @ ${errorTimestamp}`);
    console.error(`[GEMINI ERROR] Request ID: ${requestId}`);
    console.error(`[GEMINI ERROR] Error Name: ${error.name}`);
    console.error(`[GEMINI ERROR] Error Message: ${error.message}`);
    console.error(`[GEMINI ERROR] Error Code: ${error.code || 'N/A'}`);
    console.error(`[GEMINI ERROR] Error Status: ${error.status || 'N/A'}`);
    console.error(`[GEMINI ERROR] Error Status Code: ${error.statusCode || 'N/A'}`);
    console.error(`[GEMINI ERROR] Error Response:`, error.response?.data || 'N/A');
    console.error(`[GEMINI ERROR] Full Error:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error(`[GEMINI ERROR] Error Stack:`, error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    throw error;
  }
}

/**
 * Find recommended doctors based on specialization
 */
async function findRecommendedDoctors(specialization, limit = 3) {
  try {
    // Try exact match first (case-insensitive)
    let doctors = await doctorModel
      .find({ 
        available: true,
        speciality: { $regex: new RegExp(`^${specialization}$`, 'i') }
      })
      .select(['name', 'speciality', 'degree', 'experience', 'fees', 'about', 'image', '_id', 'available'])
      .limit(limit)
      .lean();
    
    // If no exact match, try partial match
    if (doctors.length === 0) {
      doctors = await doctorModel
        .find({ 
          available: true,
          speciality: { $regex: new RegExp(specialization, 'i') }
        })
        .select(['name', 'speciality', 'degree', 'experience', 'fees', 'about', 'image', '_id', 'available'])
        .limit(limit)
        .lean();
    }
    
    // If still no match and not General Physician, try General Physician
    if (doctors.length === 0 && specialization !== 'General Physician') {
      doctors = await doctorModel
        .find({ 
          available: true,
          speciality: { $regex: /general|physician/i }
        })
        .select(['name', 'speciality', 'degree', 'experience', 'fees', 'about', 'image', '_id', 'available'])
        .limit(limit)
        .lean();
    }
    
    // If still no match, get any available doctors
    if (doctors.length === 0) {
      doctors = await doctorModel
        .find({ available: true })
        .select(['name', 'speciality', 'degree', 'experience', 'fees', 'about', 'image', '_id', 'available'])
        .limit(limit)
        .lean();
    }
    
    // Sort by availability (available first), then by experience
    doctors.sort((a, b) => {
      if (a.available && !b.available) return -1;
      if (!a.available && b.available) return 1;
      return (b.experience || 0) - (a.experience || 0);
    });
    
    return doctors.map(doc => ({
      _id: doc._id.toString(),
      name: doc.name,
      speciality: doc.speciality,
      degree: doc.degree,
      experience: doc.experience,
      fees: doc.fees,
      about: doc.about,
      image: doc.image,
      available: doc.available
    }));
  } catch (error) {
    console.error('Error finding doctors:', error);
    return [];
  }
}

/**
 * Main Analyze Symptoms Function
 */
export const analyzeSymptoms = async (req, res) => {
  try {
    // Check if Gemini API is configured BEFORE processing request
    if (!genAI || !geminiApiKey) {
      console.error('[ANALYZE SYMPTOMS] Gemini API not configured - GEMINI_API_KEY missing');
      return res.json({
        success: false,
        message: 'AI service is not configured. The GEMINI_API_KEY environment variable is missing. Please contact support.',
        error: 'GEMINI_API_KEY_NOT_SET',
        requiresRetry: false,
      });
    }
    
    const { symptoms } = req.body;
    
    if (!symptoms || !symptoms.trim()) {
      return res.json({
        success: false,
        message: 'Please provide symptoms to analyze',
      });
    }
    
    const patientInput = symptoms.trim();
    
    // Check for greetings - ONLY exact greetings, not short symptom descriptions
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'howdy', 'namaste'];
    const lowerInput = patientInput.toLowerCase().trim();
    const isGreeting = greetings.some(greeting => 
      lowerInput === greeting.toLowerCase() // Only exact match, not partial
    );
    
    // Generate debug nonce for ALL responses (including greetings)
    const debugNonce = `NONCE-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const backendTimestamp = new Date().toISOString();
    
    // Only return greeting response for exact greetings, not short symptom descriptions
    if (isGreeting && patientInput.length <= 15) {
      // Even greetings should have debugNonce to prove dynamism
      return res.json({
        success: true,
        data: {
          isGreeting: true,
          aiText: "Hello! I'm your medical assistant. Please describe your symptoms, and I'll provide first-aid guidance and suggest the right doctor for you.",
          suggestedSpeciality: null,
          isSerious: false,
          debugNonce: debugNonce,
          backendTimestamp: backendTimestamp,
        },
      });
    }
    
    // All other inputs (including short symptom descriptions) go to Gemini
    
    // Get available specializations
    const availableSpecializations = await getAvailableSpecializations();
    
    // Generate AI response using Gemini - ALWAYS call Gemini for symptom analysis
    // MANDATORY: No fallback responses - return error if Gemini fails
    const requestStartTime = Date.now();
    const requestTimestamp = new Date().toISOString();
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`[ANALYZE SYMPTOMS] @ ${requestTimestamp}`);
    console.log(`[ANALYZE SYMPTOMS] User Input: "${patientInput}"`);
    console.log(`[ANALYZE SYMPTOMS] Input Length: ${patientInput.length} characters`);
    console.log('═══════════════════════════════════════════════════════════════');
    
    let aiResponse;
    try {
      // MANDATORY: Call Gemini API - this MUST execute for every request
      aiResponse = await generateAIResponse(patientInput, availableSpecializations);
      
      const requestEndTime = Date.now();
      const requestDuration = requestEndTime - requestStartTime;
      
      console.log(`[ANALYZE SYMPTOMS] Gemini API call completed in ${requestDuration}ms`);
      console.log(`[ANALYZE SYMPTOMS] Response received - Specialization: ${aiResponse.recommendedSpecialization}`);
      console.log(`[ANALYZE SYMPTOMS] Response received - aiText length: ${aiResponse.aiText.length} chars`);
      console.log(`[ANALYZE SYMPTOMS] Response received - aiText preview: "${aiResponse.aiText.substring(0, 200)}..."`);
      console.log('═══════════════════════════════════════════════════════════════\n');
      
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      console.error('═══════════════════════════════════════════════════════════════');
      console.error(`[ANALYZE SYMPTOMS ERROR] @ ${errorTimestamp}`);
      console.error(`[ANALYZE SYMPTOMS ERROR] User Input: "${patientInput}"`);
      console.error(`[ANALYZE SYMPTOMS ERROR] Error Name: ${error.name}`);
      console.error(`[ANALYZE SYMPTOMS ERROR] Error Message: ${error.message}`);
      console.error(`[ANALYZE SYMPTOMS ERROR] Error Code: ${error.code || 'N/A'}`);
      console.error(`[ANALYZE SYMPTOMS ERROR] Error Status: ${error.status || 'N/A'}`);
      console.error(`[ANALYZE SYMPTOMS ERROR] Error Response:`, error.response?.data || 'N/A');
      console.error(`[ANALYZE SYMPTOMS ERROR] Full Error Object:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      console.error(`[ANALYZE SYMPTOMS ERROR] Stack: ${error.stack}`);
      console.error('═══════════════════════════════════════════════════════════════\n');
      
      // FAIL-SAFE: Return error instead of static fallback
      // DO NOT return generic chatbot response
      console.error('[ANALYZE SYMPTOMS] Returning error response to client');
      
      // Provide more specific error messages
      let errorMessage = 'AI service is currently unavailable. Please try again in a moment or contact support.';
      let errorType = 'gemini_error';
      
      if (error.message?.includes('Gemini API not configured') || error.message?.includes('GEMINI_API_KEY')) {
        errorMessage = 'AI service is not configured. The GEMINI_API_KEY environment variable is missing. Please contact support.';
        errorType = 'config_error';
      } else if (error.message?.includes('API key expired') || error.message?.includes('API_KEY_INVALID') || error.message?.includes('API key expired')) {
        errorMessage = 'AI service API key has expired. Please contact support to renew the API key.';
        errorType = 'api_key_expired';
      } else if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        errorMessage = 'AI service request timed out. Please try again.';
        errorType = 'timeout_error';
      } else if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        errorMessage = 'AI service quota exceeded. Please try again later.';
        errorType = 'quota_error';
      } else if (error.message?.includes('API key') || error.message?.includes('authentication')) {
        errorMessage = 'AI service authentication failed. The API key may be invalid or expired. Please contact support.';
        errorType = 'auth_error';
      } else if (error.message) {
        // Include error message in development for debugging
        if (process.env.NODE_ENV === 'development') {
          errorMessage = `AI service error: ${error.message}`;
        }
      }
      
      return res.json({
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requiresRetry: errorType !== 'config_error' && errorType !== 'auth_error',
        errorType: errorType,
      });
    }
    
    // Ensure we always have a specialization
    const finalSpecialization = aiResponse.recommendedSpecialization || 'General physician';
    
    console.log(`[ANALYZE SYMPTOMS] Specialization from AI: "${aiResponse.recommendedSpecialization}"`);
    console.log(`[ANALYZE SYMPTOMS] Final specialization: "${finalSpecialization}"`);
    console.log(`[ANALYZE SYMPTOMS] Finding doctors for specialization: "${finalSpecialization}"`);
    
    // Find recommended doctors based on specialization
    const recommendedDoctors = await findRecommendedDoctors(finalSpecialization, 3);
    
    console.log(`[ANALYZE SYMPTOMS] Found ${recommendedDoctors.length} doctors for "${finalSpecialization}"`);
    console.log(`[ANALYZE SYMPTOMS] aiText length: ${aiResponse.aiText.length} characters`);
    console.log(`[ANALYZE SYMPTOMS] aiText preview: "${aiResponse.aiText.substring(0, 200)}..."`);
    
    // Build response with all required fields
    const responseData = {
      isGreeting: false,
      isSerious: aiResponse.isEmergency || false,
      aiText: aiResponse.aiText.trim(), // RAW Gemini-generated text
      suggestedSpeciality: finalSpecialization,
      recommendedDoctors: recommendedDoctors, // Array of available doctors
      debugNonce: debugNonce,
      backendTimestamp: backendTimestamp,
    };
    
    // Add emergency warning if needed
    if (aiResponse.isEmergency) {
      responseData.emergencyWarning = '🚨 EMERGENCY: Please seek immediate medical attention or call emergency services.';
    }
    
    console.log(`[ANALYZE SYMPTOMS] ✅ Response ready - Specialization: "${finalSpecialization}", Doctors: ${recommendedDoctors.length}`);
    
    return res.json({
      success: true,
      data: responseData,
    });
    
  } catch (error) {
    console.error('Error in analyzeSymptoms:', error);
    
    return res.json({
      success: false,
      message: 'Unable to process symptoms. Please try again or contact support.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
