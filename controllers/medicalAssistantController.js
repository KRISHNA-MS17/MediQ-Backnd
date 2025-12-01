import { GoogleGenerativeAI } from '@google/generative-ai';
import doctorModel from '../models/doctorModel.js';

// Initialize Gemini AI - get API key from environment
const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
if (!geminiApiKey) {
  console.warn('⚠️  GEMINI_API_KEY not found in environment variables. Medical Assistant will use fallback mode.');
}
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

/**
 * Analyze symptoms using Gemini AI and suggest doctors from database
 */
export const analyzeSymptoms = async (req, res) => {
  try {
    const { symptoms } = req.body;

    if (!symptoms || !symptoms.trim()) {
      return res.json({
        success: false,
        message: 'Please provide symptoms to analyze',
      });
    }

    const userInput = symptoms.trim();
    const lowerInput = userInput.toLowerCase();

    // Check for greetings and conversational messages
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'howdy', 'hola', 'namaste'];
    const isGreeting = greetings.some(
      (greeting) =>
        lowerInput === greeting ||
        lowerInput.startsWith(greeting + ' ') ||
        lowerInput.endsWith(' ' + greeting) ||
        lowerInput.includes(' ' + greeting + ' ')
    );

    // Check for questions about the assistant
    const assistantQuestions = ['who are you', 'what are you', 'what can you do', 'help', 'how can you help'];
    const isQuestion = assistantQuestions.some((q) => lowerInput.includes(q));

    // Check if it's a very short message (likely not symptoms)
    if (isGreeting || isQuestion || userInput.length < 10) {
      if (isGreeting) {
        return res.json({
          success: true,
          data: {
            isGreeting: true,
            isSerious: false,
            firstAidGuidance: "Hello! I'm your medical assistant. I can help you with:\n\n• Analyzing your symptoms\n• Providing first-aid guidance\n• Suggesting the right doctor\n\nPlease describe your symptoms, and I'll help you find the best care.",
            suggestedSpeciality: null,
            explanation: null,
            recommendedDoctors: [],
          },
        });
      } else if (isQuestion) {
        return res.json({
          success: true,
          data: {
            isGreeting: false,
            isSerious: false,
            firstAidGuidance: "I'm a medical assistant powered by AI. I can:\n\n• Analyze your symptoms\n• Provide first-aid advice\n• Recommend the right doctor\n• Help you understand when to seek immediate care\n\nHow can I help you today?",
            suggestedSpeciality: null,
            explanation: null,
            recommendedDoctors: [],
          },
        });
      } else {
        // Very short message - ask for more details
        return res.json({
          success: true,
          data: {
            isGreeting: false,
            isSerious: false,
            firstAidGuidance: "I'd like to help you better. Could you please describe your symptoms in more detail?\n\nFor example:\n• What symptoms are you experiencing?\n• How long have you had them?",
            suggestedSpeciality: null,
            explanation: null,
            recommendedDoctors: [],
          },
        });
      }
    }

    // Get all available doctors from database
    const doctors = await doctorModel
      .find({ available: true })
      .select(['name', 'speciality', 'degree', 'experience', 'fees', 'about', 'image', '_id'])
      .lean();

    if (!doctors || doctors.length === 0) {
      return res.json({
        success: false,
        message: 'No doctors available in the database',
      });
    }

    // Create a list of available specialities from database
    const availableSpecialities = [...new Set(doctors.map((doc) => doc.speciality))];

    // Prepare prompt for Gemini with conversation understanding
    const prompt = `You are a friendly and helpful medical assistant. Analyze the user's message and determine if they are:
1. Just greeting or having a conversation (respond conversationally)
2. Asking about your capabilities (explain what you can do)
3. Describing actual medical symptoms (analyze and provide guidance)

User message: "${userInput}"

If this is a greeting or general conversation, respond with:
{
  "isGreeting": true,
  "isSerious": false,
  "firstAidGuidance": "A friendly conversational response",
  "suggestedSpeciality": null,
  "explanation": null
}

If this contains actual medical symptoms, analyze them and provide:
{
  "isGreeting": false,
  "isSerious": true/false,
  "firstAidGuidance": "Brief, practical first-aid advice",
  "suggestedSpeciality": "One of: ${availableSpecialities.join(', ')}",
  "explanation": "Brief explanation of why this speciality"
}

IMPORTANT RULES:
- If the message is just "hi", "hello", "thanks", "thank you", etc., respond conversationally
- Only suggest doctors when actual symptoms are described
- Only suggest specialities from this list: ${availableSpecialities.join(', ')}
- If symptoms suggest an emergency, set isSerious: true
- Keep responses helpful and friendly

Available doctor specialities: ${availableSpecialities.join(', ')}

Respond ONLY with valid JSON, no additional text.`;

    // Check if Gemini API is configured
    if (!genAI || !geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Get Gemini model - try gemini-1.5-pro first, fallback to gemini-pro
    let model;
    try {
      model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    } catch (error) {
      try {
        model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      } catch (error2) {
        // Try gemini-1.5-flash as another fallback
        model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      }
    }

    // Generate response
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response (remove markdown code blocks if present)
    let aiResponse;
    try {
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      console.error('Raw response:', text);
      // Fallback response
      aiResponse = {
        isGreeting: false,
        isSerious: false,
        firstAidGuidance: 'Please consult a doctor for proper diagnosis and treatment.',
        suggestedSpeciality: availableSpecialities[0] || 'General physician',
        explanation: 'Based on your symptoms, a consultation is recommended.',
      };
    }

    // If it's a greeting, return early without doctor matching
    if (aiResponse.isGreeting) {
      return res.json({
        success: true,
        data: {
          isGreeting: true,
          isSerious: false,
          firstAidGuidance: aiResponse.firstAidGuidance || "Hello! I'm here to help you with medical guidance. Please describe your symptoms, and I'll provide first-aid advice and suggest the right doctor for you.",
          suggestedSpeciality: null,
          explanation: null,
          recommendedDoctors: [],
        },
      });
    }

    // Find matching doctors from database based on suggested speciality
    let recommendedDoctors = [];
    if (aiResponse.suggestedSpeciality) {
      const suggestedDoctors = doctors.filter(
        (doc) => doc.speciality.toLowerCase() === aiResponse.suggestedSpeciality?.toLowerCase()
      );

      // If no exact match, try to find similar speciality or default to General physician
      let matchedDoctors = suggestedDoctors;
      if (matchedDoctors.length === 0) {
        // Try to find doctors with similar speciality names
        const lowerSpeciality = aiResponse.suggestedSpeciality?.toLowerCase() || '';
        matchedDoctors = doctors.filter((doc) =>
          doc.speciality.toLowerCase().includes(lowerSpeciality) ||
          lowerSpeciality.includes(doc.speciality.toLowerCase())
        );

        // If still no match, default to General physician or first available
        if (matchedDoctors.length === 0) {
          matchedDoctors = doctors.filter(
            (doc) => doc.speciality.toLowerCase().includes('general')
          );
          if (matchedDoctors.length === 0) {
            matchedDoctors = doctors.slice(0, 3); // Return first 3 doctors as fallback
          }
        }
      }

      // Limit to top 3 doctors
      recommendedDoctors = matchedDoctors.slice(0, 3);
    }

    res.json({
      success: true,
      data: {
        isGreeting: false,
        isSerious: aiResponse.isSerious || false,
        firstAidGuidance: aiResponse.firstAidGuidance || 'Please consult a doctor for proper diagnosis and treatment.',
        suggestedSpeciality: aiResponse.suggestedSpeciality || null,
        explanation: aiResponse.explanation || null,
        recommendedDoctors: recommendedDoctors,
      },
    });
  } catch (error) {
    console.error('Error in analyzeSymptoms:', error);

    // Fallback: Check if it's a greeting first, then return basic response
    try {
      const lowerInput = userInput.toLowerCase();
      const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'howdy', 'hola', 'namaste'];
      const isGreeting = greetings.some(
        (greeting) =>
          lowerInput === greeting ||
          lowerInput.startsWith(greeting + ' ') ||
          lowerInput.endsWith(' ' + greeting) ||
          lowerInput.includes(' ' + greeting + ' ')
      );

      if (isGreeting || userInput.length < 10) {
        return res.json({
          success: true,
          data: {
            isGreeting: true,
            isSerious: false,
            firstAidGuidance: "Hello! I'm your medical assistant. I can help you with:\n\n• Analyzing your symptoms\n• Providing first-aid guidance\n• Suggesting the right doctor for your condition\n\nPlease describe your symptoms or health concern, and I'll help you find the best care.",
            suggestedSpeciality: null,
            explanation: null,
            recommendedDoctors: [],
          },
        });
      }

      const doctors = await doctorModel
        .find({ available: true })
        .select(['name', 'speciality', 'degree', 'experience', 'fees', 'about', 'image', '_id'])
        .limit(3)
        .lean();

      res.json({
        success: true,
        data: {
          isGreeting: false,
          isSerious: false,
          firstAidGuidance: 'Please consult a doctor for proper diagnosis and treatment. If symptoms are severe, seek immediate medical attention.',
          suggestedSpeciality: 'General physician',
          explanation: 'Based on your symptoms, a consultation is recommended.',
          recommendedDoctors: doctors,
        },
      });
    } catch (fallbackError) {
      res.json({
        success: false,
        message: 'Unable to process symptoms. Please try again or contact support.',
      });
    }
  }
};

