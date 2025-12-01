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

    // Prepare prompt for Gemini
    const prompt = `You are a medical assistant. A user has described the following symptoms: "${symptoms}"

Based on these symptoms, please:
1. Provide first-aid guidance (brief, practical advice)
2. Suggest the most appropriate doctor speciality from this list: ${availableSpecialities.join(', ')}
3. Identify if this is a serious/emergency condition that requires immediate medical attention

IMPORTANT: 
- Only suggest specialities from the provided list: ${availableSpecialities.join(', ')}
- If the symptoms suggest a serious condition, clearly indicate it's an emergency
- Keep first-aid guidance concise and practical
- Return your response in this JSON format:
{
  "isSerious": true/false,
  "firstAidGuidance": "brief first-aid advice",
  "suggestedSpeciality": "one of the specialities from the list",
  "explanation": "brief explanation of why this speciality"
}

Available doctors in database:
${doctors.map((doc) => `- ${doc.name} (${doc.speciality})`).join('\n')}

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
      // Fallback response
      aiResponse = {
        isSerious: false,
        firstAidGuidance: 'Please consult a doctor for proper diagnosis and treatment.',
        suggestedSpeciality: availableSpecialities[0] || 'General physician',
        explanation: 'Based on your symptoms, a consultation is recommended.',
      };
    }

    // Find matching doctors from database based on suggested speciality
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
    const recommendedDoctors = matchedDoctors.slice(0, 3);

    res.json({
      success: true,
      data: {
        isSerious: aiResponse.isSerious || false,
        firstAidGuidance: aiResponse.firstAidGuidance || 'Please consult a doctor for proper diagnosis and treatment.',
        suggestedSpeciality: aiResponse.suggestedSpeciality || availableSpecialities[0],
        explanation: aiResponse.explanation || 'Based on your symptoms, a consultation is recommended.',
        recommendedDoctors: recommendedDoctors,
      },
    });
  } catch (error) {
    console.error('Error in analyzeSymptoms:', error);

    // Fallback: Return basic response with available doctors
    try {
      const doctors = await doctorModel
        .find({ available: true })
        .select(['name', 'speciality', 'degree', 'experience', 'fees', 'about', 'image', '_id'])
        .limit(3)
        .lean();

      res.json({
        success: true,
        data: {
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

