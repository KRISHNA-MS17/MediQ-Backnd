import { GoogleGenerativeAI } from '@google/generative-ai';
import doctorModel from '../models/doctorModel.js';

// Initialize Gemini AI - get API key from environment
const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
if (!geminiApiKey) {
  console.warn('⚠️  GEMINI_API_KEY not found in environment variables. Medical Assistant will use rule-based mode only.');
}
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

/**
 * Symptom to Specialization Mapping
 * Maps symptoms/keywords to recommended doctor specializations
 */
const symptomToSpecialization = {
  // Respiratory & General
  fever: ['General Physician', 'Pulmonologist'],
  cough: ['General Physician', 'Pulmonologist'],
  cold: ['General Physician', 'Pulmonologist'],
  flu: ['General Physician', 'Pulmonologist'],
  'sore throat': ['General Physician', 'ENT Specialist'],
  'throat pain': ['General Physician', 'ENT Specialist'],
  'runny nose': ['General Physician', 'ENT Specialist'],
  'nasal congestion': ['ENT Specialist', 'General Physician'],
  'difficulty breathing': ['Pulmonologist', 'General Physician'],
  'shortness of breath': ['Pulmonologist', 'Cardiologist'],
  'chest congestion': ['Pulmonologist', 'General Physician'],
  
  // Cardiac
  'chest pain': ['Cardiologist', 'General Physician'],
  'chest discomfort': ['Cardiologist', 'General Physician'],
  'heart palpitations': ['Cardiologist'],
  'irregular heartbeat': ['Cardiologist'],
  'high blood pressure': ['Cardiologist', 'General Physician'],
  'hypertension': ['Cardiologist', 'General Physician'],
  'heart problem': ['Cardiologist'],
  
  // Dermatology
  'skin rash': ['Dermatologist'],
  rash: ['Dermatologist'],
  itching: ['Dermatologist'],
  'skin irritation': ['Dermatologist'],
  acne: ['Dermatologist'],
  'skin infection': ['Dermatologist'],
  eczema: ['Dermatologist'],
  psoriasis: ['Dermatologist'],
  'skin allergy': ['Dermatologist'],
  hives: ['Dermatologist'],
  'dry skin': ['Dermatologist'],
  
  // Neurological
  dizziness: ['Neurologist', 'General Physician'],
  numbness: ['Neurologist'],
  'tingling sensation': ['Neurologist'],
  'severe headache': ['Neurologist', 'General Physician'],
  migraine: ['Neurologist'],
  seizures: ['Neurologist'],
  'memory problems': ['Neurologist'],
  'vision problems': ['Neurologist', 'Ophthalmologist'],
  'blurred vision': ['Ophthalmologist', 'Neurologist'],
  'loss of balance': ['Neurologist'],
  
  // ENT
  'ear pain': ['ENT Specialist'],
  'ear infection': ['ENT Specialist'],
  'hearing loss': ['ENT Specialist'],
  'ear discharge': ['ENT Specialist'],
  sinus: ['ENT Specialist'],
  sinusitis: ['ENT Specialist'],
  'nasal bleeding': ['ENT Specialist', 'General Physician'],
  'nosebleed': ['ENT Specialist', 'General Physician'],
  
  // Orthopedic & Musculoskeletal
  'joint pain': ['Orthopedician', 'General Physician'],
  'bone pain': ['Orthopedician'],
  fracture: ['Orthopedician'],
  'back pain': ['Orthopedician', 'General Physician'],
  'neck pain': ['Orthopedician', 'General Physician'],
  'muscle pain': ['Orthopedician', 'General Physician'],
  arthritis: ['Orthopedician', 'Rheumatologist'],
  'knee pain': ['Orthopedician'],
  'shoulder pain': ['Orthopedician'],
  'ankle pain': ['Orthopedician'],
  'wrist pain': ['Orthopedician'],
  sprain: ['Orthopedician'],
  'muscle strain': ['Orthopedician'],
  
  // Gastrointestinal
  'stomach pain': ['Gastroenterologist', 'General Physician'],
  'abdominal pain': ['Gastroenterologist', 'General Physician'],
  nausea: ['Gastroenterologist', 'General Physician'],
  vomiting: ['Gastroenterologist', 'General Physician'],
  diarrhea: ['Gastroenterologist', 'General Physician'],
  constipation: ['Gastroenterologist', 'General Physician'],
  'stomach ache': ['Gastroenterologist', 'General Physician'],
  'acid reflux': ['Gastroenterologist'],
  'heartburn': ['Gastroenterologist'],
  'indigestion': ['Gastroenterologist', 'General Physician'],
  'stomach upset': ['Gastroenterologist', 'General Physician'],
  
  // Pediatric
  'child fever': ['Pediatrician'],
  'child vomiting': ['Pediatrician'],
  'child illness': ['Pediatrician'],
  'infant health': ['Pediatrician'],
  'baby health': ['Pediatrician'],
  'child cough': ['Pediatrician'],
  'child cold': ['Pediatrician'],
  
  // Gynecological
  'women\'s health': ['Gynecologist'],
  'menstrual problems': ['Gynecologist'],
  'period pain': ['Gynecologist'],
  pregnancy: ['Gynecologist'],
  'gynecological': ['Gynecologist'],
  'pelvic pain': ['Gynecologist'],
  'vaginal discharge': ['Gynecologist'],
  'urinary problems': ['Gynecologist', 'Urologist'],
  
  // Dental
  'tooth pain': ['Dentist'],
  toothache: ['Dentist'],
  'bleeding gums': ['Dentist'],
  'dental pain': ['Dentist'],
  'gum problems': ['Dentist'],
  'oral health': ['Dentist'],
  'tooth infection': ['Dentist'],
  'jaw pain': ['Dentist', 'Orthopedician'],
  
  // General symptoms
  headache: ['General Physician'],
  fatigue: ['General Physician'],
  weakness: ['General Physician'],
  'body ache': ['General Physician'],
  'general illness': ['General Physician'],
  'feeling unwell': ['General Physician'],
};

/**
 * First Aid Guidance for Common Conditions
 */
const firstAidGuidance = {
  fever: {
    advice: 'Drink plenty of water and fluids. Rest in a cool, well-ventilated room. Use a cold compress on your forehead. Monitor your temperature regularly. If fever persists above 102°F (38.9°C) or lasts more than 3 days, consult a doctor.',
    steps: [
      'Stay hydrated - drink water, ORS, or clear fluids',
      'Rest and avoid strenuous activities',
      'Apply a cool, damp cloth to forehead and neck',
      'Take a lukewarm bath if comfortable',
      'Monitor temperature every 4-6 hours',
      'Seek medical care if fever is very high or persists'
    ]
  },
  cough: {
    advice: 'Stay hydrated with warm liquids like tea or soup. Use a humidifier or take steam inhalation. Avoid irritants like smoke. Rest and get plenty of sleep. If cough persists more than 2 weeks or is severe, consult a doctor.',
    steps: [
      'Drink warm liquids (tea, soup, warm water with honey)',
      'Use a humidifier or take steam inhalation',
      'Avoid smoking and secondhand smoke',
      'Rest and get adequate sleep',
      'Gargle with warm salt water if throat is irritated',
      'Consult doctor if cough is severe or persistent'
    ]
  },
  'chest pain': {
    advice: 'Sit upright and stay calm. Avoid exertion. If chest pain is severe, persistent, or accompanied by shortness of breath, seek immediate medical attention. Do not ignore chest pain as it could indicate a serious condition.',
    steps: [
      'Sit upright in a comfortable position',
      'Stay calm and avoid panic',
      'Do not exert yourself',
      'If pain is severe or persistent, call emergency services immediately',
      'If you have heart disease risk factors, seek immediate care',
      'Do not drive yourself to the hospital if pain is severe'
    ]
  },
  'stomach pain': {
    advice: 'Avoid solid foods for a few hours. Take small sips of water or clear fluids. Rest in a comfortable position. Avoid lying flat - try sitting up or lying on your side. If pain is severe, persistent, or accompanied by fever/vomiting, seek medical attention.',
    steps: [
      'Avoid solid foods initially',
      'Take small sips of water or clear fluids',
      'Rest in a comfortable position',
      'Apply a warm compress to the abdomen if helpful',
      'Avoid lying flat - sit up or lie on your side',
      'Seek medical care if pain is severe or persistent'
    ]
  },
  'skin rash': {
    advice: 'Apply a cool, damp compress to the affected area. Avoid scratching to prevent infection. Keep the area clean and dry. Use mild, fragrance-free soap. If rash spreads, becomes painful, or shows signs of infection, consult a dermatologist.',
    steps: [
      'Apply a cool, damp cloth to the rash',
      'Avoid scratching the affected area',
      'Keep the area clean and dry',
      'Use mild, fragrance-free soap',
      'Wear loose, breathable clothing',
      'Consult a doctor if rash worsens or spreads'
    ]
  },
  headache: {
    advice: 'Rest in a dark, quiet room. Drink water to stay hydrated. Apply a cold or warm compress to your forehead. Avoid screens and bright lights. If headache is severe, sudden, or accompanied by other symptoms, seek medical attention.',
    steps: [
      'Rest in a dark, quiet room',
      'Drink water to stay hydrated',
      'Apply a cold or warm compress to forehead',
      'Avoid screens, bright lights, and loud noises',
      'Try gentle neck and shoulder stretches',
      'Seek medical care if headache is severe or unusual'
    ]
  },
  'joint pain': {
    advice: 'Rest the affected joint. Apply ice wrapped in a cloth for 15-20 minutes. Elevate the joint if possible. Avoid strenuous activities. If pain is severe, persistent, or the joint appears swollen/deformed, consult an orthopedic doctor.',
    steps: [
      'Rest the affected joint',
      'Apply ice wrapped in a cloth for 15-20 minutes',
      'Elevate the joint above heart level if possible',
      'Avoid putting weight or strain on the joint',
      'Use over-the-counter pain relief if appropriate',
      'Consult a doctor if pain is severe or joint appears abnormal'
    ]
  },
  'ear pain': {
    advice: 'Apply a warm compress to the affected ear. Avoid inserting anything into the ear. Keep the ear dry. Rest and stay hydrated. If pain is severe, persistent, or accompanied by discharge or hearing loss, consult an ENT specialist.',
    steps: [
      'Apply a warm, dry compress to the affected ear',
      'Do not insert anything into the ear canal',
      'Keep the ear dry - avoid swimming or showering',
      'Rest in an upright position to reduce pressure',
      'Take over-the-counter pain relief if appropriate',
      'Consult an ENT doctor if pain persists or worsens'
    ]
  },
  'throat pain': {
    advice: 'Gargle with warm salt water several times a day. Drink warm liquids like tea or soup. Rest your voice. Stay hydrated. Avoid irritants like smoke. If throat pain is severe, persistent, or accompanied by difficulty swallowing, consult a doctor.',
    steps: [
      'Gargle with warm salt water (1/2 tsp salt in 1 cup water)',
      'Drink warm liquids (tea, soup, warm water with honey)',
      'Rest your voice - avoid shouting or whispering',
      'Stay hydrated with plenty of fluids',
      'Avoid smoking and secondhand smoke',
      'Consult a doctor if pain is severe or persists'
    ]
  },
  'tooth pain': {
    advice: 'Rinse your mouth with warm salt water. Apply a cold compress to the outside of your cheek near the painful area. Avoid very hot or cold foods. Use over-the-counter pain relief if appropriate. If pain is severe or persistent, consult a dentist as soon as possible.',
    steps: [
      'Rinse mouth with warm salt water',
      'Apply a cold compress to the outside of your cheek',
      'Avoid very hot, cold, or sweet foods',
      'Use dental floss to remove any trapped food',
      'Take over-the-counter pain relief if appropriate',
      'Consult a dentist as soon as possible'
    ]
  },
  vomiting: {
    advice: 'Take small sips of water or ORS solution. Avoid solid foods for a few hours. Rest in an upright position. Stay hydrated. If vomiting persists, is severe, or contains blood, seek immediate medical attention.',
    steps: [
      'Take small, frequent sips of water or ORS',
      'Avoid solid foods for 4-6 hours',
      'Rest in an upright or semi-upright position',
      'Avoid strong smells that might trigger nausea',
      'Gradually reintroduce bland foods when ready',
      'Seek medical care if vomiting is severe or persistent'
    ]
  },
  dizziness: {
    advice: 'Sit or lie down immediately to prevent falls. Drink water to stay hydrated. Avoid sudden movements. If dizziness is severe, persistent, or accompanied by other symptoms, seek medical attention.',
    steps: [
      'Sit or lie down immediately',
      'Stay still until dizziness passes',
      'Drink water to stay hydrated',
      'Avoid sudden head movements',
      'Get up slowly when feeling better',
      'Consult a doctor if dizziness is frequent or severe'
    ]
  },
  injury: {
    advice: 'Stop any bleeding by applying direct pressure with a clean cloth. Clean the wound with water if possible. Apply a sterile bandage. Elevate the injured area if possible. If bleeding is severe, the wound is deep, or there are signs of infection, seek immediate medical care.',
    steps: [
      'Stop bleeding by applying direct pressure',
      'Clean the wound gently with clean water',
      'Apply a sterile bandage or dressing',
      'Elevate the injured area above heart level',
      'Keep the wound clean and dry',
      'Seek medical care for severe injuries or signs of infection'
    ]
  },
  'child fever': {
    advice: 'Keep the child hydrated with water or ORS. Dress them in light, breathable clothing. Use a lukewarm sponge bath (not cold water). Monitor temperature regularly. If fever is very high (above 102°F), persists, or the child appears very unwell, consult a pediatrician immediately.',
    steps: [
      'Keep child hydrated with water or ORS solution',
      'Dress in light, breathable clothing',
      'Use lukewarm sponge bath (avoid cold water)',
      'Monitor temperature every 2-4 hours',
      'Ensure adequate rest and sleep',
      'Consult pediatrician if fever is high or child is very unwell'
    ]
  }
};

/**
 * Serious symptoms that require immediate medical attention
 */
const seriousSymptoms = [
  'severe chest pain',
  'difficulty breathing',
  'unconsciousness',
  'severe bleeding',
  'severe burns',
  'severe allergic reaction',
  'stroke symptoms',
  'heart attack',
  'severe head injury',
  'severe abdominal pain',
  'severe dehydration',
  'seizures',
  'severe trauma',
  'choking',
  'severe difficulty swallowing',
  'loss of consciousness',
  'severe dizziness',
  'severe headache',
  'sudden vision loss',
  'severe shortness of breath'
];

/**
 * Rule-based symptom analysis
 */
function analyzeSymptomsRuleBased(userInput) {
  const lowerInput = userInput.toLowerCase().trim();
  
  // Check for greetings
  const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'howdy', 'hola', 'namaste', 'thanks', 'thank you'];
  const isGreeting = greetings.some(
    (greeting) =>
      lowerInput === greeting ||
      lowerInput.startsWith(greeting + ' ') ||
      lowerInput.endsWith(' ' + greeting) ||
      lowerInput.includes(' ' + greeting + ' ')
  );
  
  if (isGreeting || lowerInput.length < 10) {
    return {
      isGreeting: true,
      isSerious: false,
      firstAidGuidance: "Hello! I'm your medical assistant. I can help you with:\n\n• Analyzing your symptoms\n• Providing first-aid guidance\n• Suggesting the right doctor for your condition\n\nPlease describe your symptoms or health concern, and I'll help you find the best care.",
      suggestedSpeciality: null,
      explanation: null,
      generalAdvice: null,
      firstAidSteps: null
    };
  }
  
  // Check for serious symptoms first
  const isSerious = seriousSymptoms.some((serious) => lowerInput.includes(serious));
  
  if (isSerious) {
    return {
      isGreeting: false,
      isSerious: true,
      firstAidGuidance: "⚠️ WARNING: These symptoms may indicate a serious medical emergency. Please seek immediate medical care or call emergency services (108/911) right away. Do not delay. If you're experiencing a life-threatening emergency, go to the nearest emergency room immediately.",
      suggestedSpeciality: 'Emergency',
      explanation: 'These symptoms require immediate medical attention. Please do not wait.',
      generalAdvice: 'Seek emergency medical care immediately. Do not drive yourself if symptoms are severe.',
      firstAidSteps: [
        'Call emergency services (108/911) immediately',
        'Stay calm and follow operator instructions',
        'Do not drive yourself if symptoms are severe',
        'Have someone take you to the emergency room',
        'Bring any relevant medical information',
        'Do not delay seeking care'
      ]
    };
  }
  
  // Find matching symptoms and determine specialization
  const matchedSymptoms = [];
  const matchedSpecializations = new Set();
  
  for (const [symptom, specializations] of Object.entries(symptomToSpecialization)) {
    if (lowerInput.includes(symptom)) {
      matchedSymptoms.push(symptom);
      specializations.forEach(spec => matchedSpecializations.add(spec));
    }
  }
  
  // Determine primary specialization (first match or General Physician)
  let suggestedSpeciality = null;
  if (matchedSpecializations.size > 0) {
    // Prioritize: Cardiologist > Pulmonologist > other specialists > General Physician
    const priority = ['Cardiologist', 'Pulmonologist', 'Neurologist', 'Orthopedician', 'Gastroenterologist', 
                      'Dermatologist', 'ENT Specialist', 'Pediatrician', 'Gynecologist', 'Dentist', 'Ophthalmologist'];
    
    for (const spec of priority) {
      if (matchedSpecializations.has(spec)) {
        suggestedSpeciality = spec;
        break;
      }
    }
    
    // If no priority match, take first from matched
    if (!suggestedSpeciality) {
      suggestedSpeciality = Array.from(matchedSpecializations)[0];
    }
  } else {
    // No specific match - default to General Physician
    suggestedSpeciality = 'General Physician';
  }
  
  // Find first aid guidance
  let firstAidData = null;
  let matchedCondition = null;
  
  // Check for specific conditions first
  for (const [condition, guidance] of Object.entries(firstAidGuidance)) {
    if (lowerInput.includes(condition)) {
      firstAidData = guidance;
      matchedCondition = condition;
      break;
    }
  }
  
  // If no specific match, use generic guidance
  if (!firstAidData) {
    // Determine generic guidance based on primary symptom
    if (matchedSymptoms.length > 0) {
      const primarySymptom = matchedSymptoms[0];
      firstAidData = {
        advice: `Based on your symptoms, rest and stay hydrated. Monitor your condition closely. If symptoms persist, worsen, or you develop new symptoms, consult a ${suggestedSpeciality} for proper evaluation and treatment.`,
        steps: [
          'Rest and avoid strenuous activities',
          'Stay hydrated with water and clear fluids',
          'Monitor your symptoms closely',
          'Avoid self-medication without doctor consultation',
          'Seek medical care if symptoms persist or worsen',
          `Consult a ${suggestedSpeciality} for proper diagnosis`
        ]
      };
    } else {
      firstAidData = {
        advice: 'Rest, stay hydrated, and monitor your symptoms. If symptoms persist or worsen, consult a doctor for proper diagnosis and treatment.',
        steps: [
          'Rest and get adequate sleep',
          'Stay hydrated with water and fluids',
          'Monitor your symptoms',
          'Avoid self-medication',
          'Consult a doctor if symptoms persist',
          'Seek immediate care if symptoms worsen'
        ]
      };
    }
  }
  
  // Generate explanation
  let explanation = `Based on your symptoms (${matchedSymptoms.length > 0 ? matchedSymptoms.slice(0, 3).join(', ') : 'general symptoms'}), I recommend consulting a ${suggestedSpeciality}.`;
  if (matchedSymptoms.length > 0) {
    explanation += ` Your symptoms suggest a condition that a ${suggestedSpeciality} is best equipped to diagnose and treat.`;
  }
  
  return {
    isGreeting: false,
    isSerious: false,
    firstAidGuidance: firstAidData.advice,
    suggestedSpeciality: suggestedSpeciality,
    explanation: explanation,
    generalAdvice: firstAidData.advice,
    firstAidSteps: firstAidData.steps,
    matchedSymptoms: matchedSymptoms.slice(0, 5) // Limit to top 5
  };
}

/**
 * Find doctors by specialization with fallback to General Physician
 */
async function findRecommendedDoctors(suggestedSpeciality, allDoctors) {
  if (!suggestedSpeciality) {
    return [];
  }
  
  const lowerSpeciality = suggestedSpeciality.toLowerCase();
  
  // Try exact match first
  let matchedDoctors = allDoctors.filter((doc) => 
    doc.speciality.toLowerCase() === lowerSpeciality
  );
  
  // Try partial match
  if (matchedDoctors.length === 0) {
    matchedDoctors = allDoctors.filter((doc) => {
      const docSpec = doc.speciality.toLowerCase();
      return docSpec.includes(lowerSpeciality) || lowerSpeciality.includes(docSpec);
    });
  }
  
  // Fallback to General Physician if no specialist found
  if (matchedDoctors.length === 0 && lowerSpeciality !== 'general physician') {
    matchedDoctors = allDoctors.filter((doc) => {
      const docSpec = doc.speciality.toLowerCase();
      return docSpec.includes('general') || docSpec.includes('physician') || docSpec.includes('gp');
    });
  }
  
  // If still no match, return first 3 available doctors
  if (matchedDoctors.length === 0) {
    matchedDoctors = allDoctors.slice(0, 3);
  }
  
  // Limit to top 3
  return matchedDoctors.slice(0, 3);
}

/**
 * Analyze symptoms using rule-based approach with AI fallback
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

    // Perform rule-based analysis first
    let analysisResult = analyzeSymptomsRuleBased(userInput);
    
    // If it's a greeting, return early
    if (analysisResult.isGreeting) {
      return res.json({
        success: true,
        data: {
          ...analysisResult,
          recommendedDoctors: [],
        },
      });
    }
    
    // If it's serious, return immediately with emergency guidance
    if (analysisResult.isSerious) {
      // Still try to find emergency/available doctors
      const emergencyDoctors = await findRecommendedDoctors('General Physician', doctors);
      return res.json({
        success: true,
        data: {
          ...analysisResult,
          recommendedDoctors: emergencyDoctors,
        },
      });
    }
    
    // Find recommended doctors based on suggested specialization
    const recommendedDoctors = await findRecommendedDoctors(
      analysisResult.suggestedSpeciality,
      doctors
    );
    
    // If no doctors found for suggested speciality, fallback to General Physician
    if (recommendedDoctors.length === 0 && analysisResult.suggestedSpeciality !== 'General Physician') {
      const generalDoctors = await findRecommendedDoctors('General Physician', doctors);
      analysisResult.suggestedSpeciality = 'General Physician';
      analysisResult.explanation = 'Specialist not available. Recommended: General Physician who can assess your condition and refer if needed.';
      
      return res.json({
        success: true,
        data: {
          ...analysisResult,
          recommendedDoctors: generalDoctors,
        },
      });
    }
    
    // Return successful response
    return res.json({
      success: true,
      data: {
        isGreeting: false,
        isSerious: analysisResult.isSerious || false,
        firstAidGuidance: analysisResult.firstAidGuidance,
        suggestedSpeciality: analysisResult.suggestedSpeciality,
        explanation: analysisResult.explanation,
        recommendedDoctors: recommendedDoctors,
        generalAdvice: analysisResult.generalAdvice,
        firstAidSteps: analysisResult.firstAidSteps,
      },
    });
    
  } catch (error) {
    console.error('Error in analyzeSymptoms:', error);

    // Fallback: Use rule-based analysis even on error
    try {
      const userInput = (req.body?.symptoms || '').trim();
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

      // Use rule-based fallback
      const fallbackAnalysis = analyzeSymptomsRuleBased(userInput);
      const doctors = await doctorModel
        .find({ available: true })
        .select(['name', 'speciality', 'degree', 'experience', 'fees', 'about', 'image', '_id'])
        .limit(3)
        .lean();
      
      const recommendedDoctors = await findRecommendedDoctors(
        fallbackAnalysis.suggestedSpeciality || 'General Physician',
        doctors
      );

      return res.json({
        success: true,
        data: {
          ...fallbackAnalysis,
          recommendedDoctors: recommendedDoctors,
        },
      });
    } catch (fallbackError) {
      console.error('Fallback error:', fallbackError);
      return res.json({
        success: false,
        message: 'Unable to process symptoms. Please try again or contact support.',
      });
    }
  }
};
