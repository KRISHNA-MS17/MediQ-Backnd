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

  // Create a fresh model instance for each request to avoid caching
  // Use correct model names: gemini-1.5-flash or gemini-1.0-pro
  let model;
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
  
  // Try gemini-1.5-flash first (faster, recommended)
  try {
    model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      safetySettings,
      generationConfig
    });
    console.log(`[GEMINI MODEL] Using model: gemini-1.5-flash`);
  } catch (modelError) {
    console.warn(`[GEMINI MODEL] gemini-1.5-flash failed: ${modelError.message}`);
    // Fallback to gemini-1.0-pro
    try {
      model = genAI.getGenerativeModel({ 
        model: 'gemini-1.0-pro',
        safetySettings,
        generationConfig
      });
      console.log(`[GEMINI MODEL] Using model: gemini-1.0-pro`);
    } catch (modelError2) {
      console.error(`[GEMINI MODEL] Both models failed. gemini-1.5-flash error: ${modelError.message}, gemini-1.0-pro error: ${modelError2.message}`);
      throw new Error(`Failed to initialize Gemini model. Tried gemini-1.5-flash and gemini-1.0-pro. Please check API key and model availability.`);
    }
  }

  const availableSpecsList = availableSpecializations.join(', ');

  // Build prompt for NATURAL LANGUAGE response with structured metadata
  // Ask for JSON but with aiText as natural language (not structured templates)
  const prompt = `You are a medical assistant AI. Provide FIRST-AID GUIDANCE and DOCTOR SPECIALIZATION RECOMMENDATIONS only. You do NOT diagnose, prescribe medications, or provide medical treatment advice.

CRITICAL RULES:
1. NEVER provide diagnoses, medication names, dosages, or treatment plans
2. ONLY provide basic first-aid measures and general wellness advice
3. Suggest appropriate doctor specialization for consultation
4. For emergencies (chest pain, difficulty breathing, loss of consciousness, severe bleeding), recommend immediate emergency care
5. **CRITICAL: Your response MUST be UNIQUE and SPECIFIC to the exact symptoms described. Different symptoms MUST receive DIFFERENT advice.**

Patient's Symptoms: "${patientInput}"
Request ID: ${requestId} (This ensures unique responses)
Available Specializations: ${availableSpecsList}

Provide a JSON response with:
{
  "aiText": "Write a natural, conversational response in plain language. Provide first-aid guidance specific to the symptoms described. Make it sound like you're talking to the patient directly. Be specific - 'joint pain' and 'teeth pain' should have completely different advice. Include why you're recommending a specific doctor type. Write naturally, not as bullet points or templates.",
  "recommendedSpecialization": "One specialization from: ${availableSpecsList}. Examples: 'Dentist' for teeth pain, 'Orthopedic' for joint pain, 'Cardiologist' for chest pain, 'Dermatologist' for skin issues.",
  "isEmergency": false
}

IMPORTANT:
- aiText must be natural, conversational language (not structured templates)
- Different symptoms MUST produce different wording and advice
- recommendedSpecialization must be from the list above
- If unsure, use "General physician" but still provide symptom-specific advice`;

  try {
    console.log(`[GEMINI API CALL] @ ${timestamp} - Calling Gemini API with Request ID: ${requestId}`);
    console.log(`[GEMINI API CALL] Prompt length: ${prompt.length} characters`);
    console.log(`[GEMINI API CALL] Prompt includes user input: ${prompt.includes(patientInput) ? 'YES ✓' : 'NO ✗'}`);
    console.log(`[GEMINI API CALL] API Key configured: ${!!geminiApiKey}`);
    console.log(`[GEMINI API CALL] API Key length: ${geminiApiKey?.length || 0}`);
    console.log(`[GEMINI API CALL] genAI instance: ${!!genAI}`);
    console.log(`[GEMINI API CALL] Model instance created: ${!!model}`);
    console.log(`[GEMINI API CALL] About to call model.generateContent() with API key...`);
    
    const callStartTime = Date.now();
    console.log(`[GEMINI API CALL] Starting API call at ${new Date().toISOString()}`);
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
    
    // Find recommended doctors
    const recommendedDoctors = await findRecommendedDoctors(aiResponse.recommendedSpecialization);
    
    // debugNonce and backendTimestamp are already declared above for greeting responses
    // Reuse them here for consistency
    
    // Ensure we always have a specialization
    const finalSpecialization = aiResponse.recommendedSpecialization || 'General physician';
    
    console.log(`[ANALYZE SYMPTOMS] Final specialization being returned: "${finalSpecialization}"`);
    console.log(`[ANALYZE SYMPTOMS] aiText being returned (first 300 chars): "${aiResponse.aiText.substring(0, 300)}..."`);
    console.log(`[ANALYZE SYMPTOMS] Full aiText: "${aiResponse.aiText}"`);
    
    // Build response with RAW Gemini text - NO templates, NO static text assembly
    const responseData = {
      isGreeting: false,
      isSerious: aiResponse.isEmergency || false,
      aiText: aiResponse.aiText, // RAW Gemini-generated text - no templates
      suggestedSpeciality: finalSpecialization,
      recommendedDoctors: recommendedDoctors,
      debugNonce: debugNonce, // MANDATORY: Required to prove backend dynamism
      backendTimestamp: backendTimestamp, // MANDATORY: Prove each response is fresh
    };
    
    // Add emergency warning if needed
    if (aiResponse.isEmergency) {
      responseData.emergencyWarning = '🚨 EMERGENCY: Please seek immediate medical attention or call emergency services.';
    }
    
    console.log(`[ANALYZE SYMPTOMS] Response built with debugNonce: ${debugNonce}`);
    console.log(`[ANALYZE SYMPTOMS] Response contains aiText: ${!!responseData.aiText}`);
    console.log(`[ANALYZE SYMPTOMS] aiText length: ${responseData.aiText.length} characters`);
    
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
