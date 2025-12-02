import { GoogleGenerativeAI } from '@google/generative-ai';
import doctorModel from '../models/doctorModel.js';

// Initialize Gemini AI
const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
if (!geminiApiKey) {
  console.warn('⚠️  GEMINI_API_KEY not found. Medical Assistant will use rule-based mode only.');
}
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

/**
 * Symptom Normalization Dictionary
 */
const symptomNormalization = {
  'stomac': 'stomach',
  'stomachache': 'stomach pain',
  'stomach ache': 'stomach pain',
  'breth': 'breath',
  'breathles': 'breathlessness',
  'breathless': 'breathlessness',
  'short of breath': 'breathlessness',
  'runny nose': 'nasal discharge',
  'stuffy nose': 'nasal congestion',
  'sore throat': 'throat pain',
  'body ache': 'body pain',
  'muscle ache': 'muscle pain',
  'joint ache': 'joint pain',
};

/**
 * Red Flag Symptoms (Emergency Indicators)
 */
const redFlagSymptoms = {
  'chest pain': { severity: 'severe', triage: 'emergency' },
  'severe chest pain': { severity: 'severe', triage: 'emergency' },
  'difficulty breathing': { severity: 'severe', triage: 'emergency' },
  'severe breathing difficulty': { severity: 'severe', triage: 'emergency' },
  'cannot breathe': { severity: 'severe', triage: 'emergency' },
  'slurred speech': { severity: 'severe', triage: 'emergency' },
  'weakness on one side': { severity: 'severe', triage: 'emergency' },
  'left side weakness': { severity: 'severe', triage: 'emergency' },
  'right side weakness': { severity: 'severe', triage: 'emergency' },
  'facial drooping': { severity: 'severe', triage: 'emergency' },
  'loss of consciousness': { severity: 'severe', triage: 'emergency' },
  'unconscious': { severity: 'severe', triage: 'emergency' },
  'severe bleeding': { severity: 'severe', triage: 'emergency' },
  'major bleeding': { severity: 'severe', triage: 'emergency' },
  'severe head injury': { severity: 'severe', triage: 'emergency' },
  'neck stiffness': { severity: 'severe', triage: 'urgent' },
  'severe abdominal pain': { severity: 'severe', triage: 'urgent' },
  'severe headache': { severity: 'severe', triage: 'urgent' },
  'high fever': { severity: 'moderate', triage: 'urgent' },
};

/**
 * Symptom to Specialization Mapping
 */
const symptomToSpecialization = {
  // Cardiac
  'chest pain': 'Cardiologist',
  'chest discomfort': 'Cardiologist',
  'heart palpitations': 'Cardiologist',
  'irregular heartbeat': 'Cardiologist',
  'shortness of breath': 'Cardiologist',
  'breathlessness': 'Cardiologist',
  
  // Respiratory
  'cough': 'Pulmonologist',
  'fever': 'Pulmonologist',
  'difficulty breathing': 'Pulmonologist',
  'breathing difficulty': 'Pulmonologist',
  'chest congestion': 'Pulmonologist',
  
  // Dermatology
  'rash': 'Dermatologist',
  'skin rash': 'Dermatologist',
  'itching': 'Dermatologist',
  'skin irritation': 'Dermatologist',
  'acne': 'Dermatologist',
  'eczema': 'Dermatologist',
  'psoriasis': 'Dermatologist',
  
  // Neurological
  'headache': 'Neurologist',
  'severe headache': 'Neurologist',
  'migraine': 'Neurologist',
  'dizziness': 'Neurologist',
  'numbness': 'Neurologist',
  'tingling': 'Neurologist',
  'seizures': 'Neurologist',
  'slurred speech': 'Neurologist',
  'weakness': 'Neurologist',
  'neck stiffness': 'Neurologist',
  
  // Orthopedic
  'joint pain': 'Orthopedician',
  'bone pain': 'Orthopedician',
  'back pain': 'Orthopedician',
  'neck pain': 'Orthopedician',
  'knee pain': 'Orthopedician',
  'ankle pain': 'Orthopedician',
  'swelling': 'Orthopedician',
  'injury': 'Orthopedician',
  'fracture': 'Orthopedician',
  'sprain': 'Orthopedician',
  'twisted ankle': 'Orthopedician',
  'cannot walk': 'Orthopedician',
  
  // Gastrointestinal
  'stomach pain': 'Gastroenterologist',
  'abdominal pain': 'Gastroenterologist',
  'nausea': 'Gastroenterologist',
  'vomiting': 'Gastroenterologist',
  'diarrhea': 'Gastroenterologist',
  'constipation': 'Gastroenterologist',
  'indigestion': 'Gastroenterologist',
  
  // ENT
  'ear pain': 'ENT Specialist',
  'throat pain': 'ENT Specialist',
  'sore throat': 'ENT Specialist',
  'nasal congestion': 'ENT Specialist',
  'sinus': 'ENT Specialist',
  'hearing loss': 'ENT Specialist',
  
  // General
  'cold': 'General Physician',
  'flu': 'General Physician',
  'fever': 'General Physician',
  'mild cold': 'General Physician',
};

/**
 * Condition Candidates with Patterns
 */
function generateConditionCandidates(symptoms, normalizedInput) {
  const candidates = [];
  const lowerInput = normalizedInput.toLowerCase();
  
  // Pattern 1: Fever + Headache + Neck Stiffness → Meningitis
  if ((lowerInput.includes('fever') || lowerInput.includes('high temperature')) &&
      (lowerInput.includes('headache') || lowerInput.includes('head pain')) &&
      (lowerInput.includes('neck stiffness') || lowerInput.includes('stiff neck'))) {
    candidates.push({
      name: 'Meningitis / Serious Infection',
      confidence: 0.85,
      rationale: 'Fever with headache and neck stiffness suggests possible meningitis or serious infection requiring urgent evaluation.'
    });
  }
  
  // Pattern 2: Chest Pain → Cardiac Issue
  if (lowerInput.includes('chest pain') || lowerInput.includes('chest discomfort')) {
    candidates.push({
      name: 'Cardiac Condition / Angina',
      confidence: 0.80,
      rationale: 'Chest pain requires cardiac evaluation to rule out heart-related conditions.'
    });
  }
  
  // Pattern 3: Fever + Cough → Respiratory Infection
  if ((lowerInput.includes('fever') || lowerInput.includes('temperature')) &&
      (lowerInput.includes('cough') || lowerInput.includes('coughing'))) {
    candidates.push({
      name: 'Respiratory Infection (Flu/URTI)',
      confidence: 0.75,
      rationale: 'Fever with cough suggests upper respiratory tract infection or influenza.'
    });
  }
  
  // Pattern 4: Sudden Weakness + Speech Issues → Stroke
  if ((lowerInput.includes('weakness') || lowerInput.includes('numbness')) &&
      (lowerInput.includes('slurred speech') || lowerInput.includes('speech problem') ||
       lowerInput.includes('facial drooping'))) {
    candidates.push({
      name: 'Stroke / TIA',
      confidence: 0.90,
      rationale: 'Sudden weakness with speech issues or facial drooping suggests possible stroke - requires immediate emergency care.'
    });
  }
  
  // Pattern 5: Injury + Swelling + Cannot Walk → Orthopedic Injury
  if ((lowerInput.includes('injury') || lowerInput.includes('twisted') || lowerInput.includes('sprain')) &&
      (lowerInput.includes('swelling') || lowerInput.includes('swollen')) &&
      (lowerInput.includes('cannot walk') || lowerInput.includes('unable to walk'))) {
    candidates.push({
      name: 'Orthopedic Injury / Fracture',
      confidence: 0.85,
      rationale: 'Injury with swelling and inability to walk suggests possible fracture or severe sprain requiring orthopedic evaluation.'
    });
  }
  
  // Pattern 6: Stomach Pain + Vomiting → GI Issue
  if ((lowerInput.includes('stomach pain') || lowerInput.includes('abdominal pain')) &&
      (lowerInput.includes('vomiting') || lowerInput.includes('nausea'))) {
    candidates.push({
      name: 'Gastrointestinal Disorder',
      confidence: 0.75,
      rationale: 'Abdominal pain with vomiting suggests gastrointestinal issue requiring gastroenterology evaluation.'
    });
  }
  
  // Pattern 7: Rash / Itching → Dermatological
  if (lowerInput.includes('rash') || lowerInput.includes('itching') || lowerInput.includes('skin irritation')) {
    candidates.push({
      name: 'Dermatological Condition',
      confidence: 0.70,
      rationale: 'Skin rash or itching suggests dermatological condition requiring specialist evaluation.'
    });
  }
  
  // Pattern 8: Mild Cold + Sore Throat → URTI
  if ((lowerInput.includes('cold') || lowerInput.includes('runny nose')) &&
      (lowerInput.includes('sore throat') || lowerInput.includes('throat pain')) &&
      !lowerInput.includes('fever')) {
    candidates.push({
      name: 'Upper Respiratory Tract Infection (URTI)',
      confidence: 0.70,
      rationale: 'Mild cold symptoms with sore throat and no fever suggests common URTI.'
    });
  }
  
  // Default: General Illness
  if (candidates.length === 0) {
    candidates.push({
      name: 'General Medical Condition',
      confidence: 0.50,
      rationale: 'Symptoms require general medical evaluation for proper diagnosis.'
    });
  }
  
  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);
  
  return candidates;
}

/**
 * Extract Patient Information
 */
function extractPatientInfo(input) {
  const lowerInput = input.toLowerCase();
  const info = {
    age: null,
    pregnancy: false,
    allergies: [],
    duration: null,
    feverValue: null,
  };
  
  // Extract age
  const ageMatch = lowerInput.match(/(\d+)\s*(?:years?|yrs?|year old|years old)/);
  if (ageMatch) {
    info.age = parseInt(ageMatch[1]);
  }
  
  // Check pregnancy
  if (lowerInput.includes('pregnant') || lowerInput.includes('pregnancy')) {
    info.pregnancy = true;
  }
  
  // Extract duration
  const durationMatch = lowerInput.match(/(\d+)\s*(?:days?|hours?|weeks?|months?)/);
  if (durationMatch) {
    info.duration = durationMatch[0];
  }
  
  // Extract fever value
  const feverMatch = lowerInput.match(/(?:fever|temperature)\s*(?:of|is)?\s*(\d+)\s*(?:degrees?|°|f|°f)/i);
  if (feverMatch) {
    info.feverValue = parseInt(feverMatch[1]);
  }
  
  return info;
}

/**
 * Normalize Input
 */
function normalizeInput(input) {
  let normalized = input.toLowerCase().trim();
  
  // Apply normalization dictionary
  for (const [key, value] of Object.entries(symptomNormalization)) {
    normalized = normalized.replace(new RegExp(key, 'gi'), value);
  }
  
  return normalized;
}

/**
 * Generate Red Flags
 */
function generateRedFlags(normalizedInput) {
  const redFlags = [];
  const lowerInput = normalizedInput.toLowerCase();
  
  for (const [symptom, data] of Object.entries(redFlagSymptoms)) {
    if (lowerInput.includes(symptom)) {
      redFlags.push(`Presence of ${symptom} - requires immediate medical attention`);
    }
  }
  
  // Additional pattern-based red flags
  if (lowerInput.includes('fever') && lowerInput.includes('neck stiffness')) {
    redFlags.push('Fever with neck stiffness may indicate meningitis - seek urgent care');
  }
  
  if (lowerInput.includes('chest pain') && (lowerInput.includes('left') || lowerInput.includes('radiating'))) {
    redFlags.push('Chest pain, especially if radiating, requires immediate cardiac evaluation');
  }
  
  if (lowerInput.includes('weakness') && lowerInput.includes('speech')) {
    redFlags.push('Sudden weakness with speech changes may indicate stroke - call emergency immediately');
  }
  
  return redFlags;
}

/**
 * Determine Triage Level
 */
function determineTriage(normalizedInput, redFlags, conditionCandidates) {
  const lowerInput = normalizedInput.toLowerCase();
  
  // Emergency indicators
  if (redFlags.length > 0) {
    const emergencyKeywords = ['chest pain', 'cannot breathe', 'unconscious', 'severe bleeding', 'slurred speech', 'weakness on one side'];
    if (emergencyKeywords.some(keyword => lowerInput.includes(keyword))) {
      return 'emergency';
    }
  }
  
  // Urgent indicators
  if (lowerInput.includes('severe') || lowerInput.includes('high fever') || 
      lowerInput.includes('neck stiffness') || lowerInput.includes('severe pain')) {
    return 'urgent';
  }
  
  // See in 24h indicators
  if (lowerInput.includes('fever') || lowerInput.includes('persistent') || 
      lowerInput.includes('worsening') || conditionCandidates[0]?.confidence > 0.7) {
    return 'see_in_24h';
  }
  
  // Self-care
  return 'self_care';
}

/**
 * Generate Symptom-Specific Suggestions
 */
function generateSuggestions(normalizedInput, primaryCondition) {
  const suggestions = [];
  const lowerInput = normalizedInput.toLowerCase();
  
  // Fever-related
  if (lowerInput.includes('fever') || lowerInput.includes('temperature')) {
    suggestions.push('Stay hydrated - drink plenty of water, ORS, or clear fluids');
    suggestions.push('Rest in a cool, well-ventilated room');
    suggestions.push('Use a cool compress on forehead and neck');
    suggestions.push('Monitor temperature every 4-6 hours');
    suggestions.push('Seek medical care if fever is above 102°F (38.9°C) or persists more than 3 days');
  }
  
  // Cough/Cold
  if (lowerInput.includes('cough') || lowerInput.includes('cold') || lowerInput.includes('runny nose')) {
    suggestions.push('Drink warm liquids (tea, soup, warm water with honey)');
    suggestions.push('Use a humidifier or take steam inhalation');
    suggestions.push('Avoid smoking and secondhand smoke');
    suggestions.push('Gargle with warm salt water if throat is irritated');
    suggestions.push('Rest and get adequate sleep');
  }
  
  // Injury/Orthopedic
  if (lowerInput.includes('injury') || lowerInput.includes('pain') && 
      (lowerInput.includes('joint') || lowerInput.includes('ankle') || lowerInput.includes('knee'))) {
    suggestions.push('Rest the affected area - avoid putting weight on it');
    suggestions.push('Apply ice wrapped in a cloth for 15-20 minutes, 3-4 times daily');
    suggestions.push('Elevate the injured area above heart level if possible');
    suggestions.push('Use compression bandage if appropriate');
    suggestions.push('Monitor for increased swelling, severe pain, or inability to move');
  }
  
  // Stomach/GI
  if (lowerInput.includes('stomach') || lowerInput.includes('abdominal') || 
      lowerInput.includes('nausea') || lowerInput.includes('vomiting')) {
    suggestions.push('Avoid solid foods initially - take small sips of water or clear fluids');
    suggestions.push('Rest in a comfortable position - avoid lying flat');
    suggestions.push('Gradually reintroduce bland foods (rice, toast, bananas) when ready');
    suggestions.push('Avoid spicy, fatty, or acidic foods');
    suggestions.push('Monitor for signs of dehydration (dry mouth, decreased urination)');
  }
  
  // Headache
  if (lowerInput.includes('headache') || lowerInput.includes('head pain')) {
    suggestions.push('Rest in a dark, quiet room');
    suggestions.push('Apply a cold or warm compress to forehead');
    suggestions.push('Stay hydrated - drink water regularly');
    suggestions.push('Avoid screens, bright lights, and loud noises');
    suggestions.push('If headache is severe, sudden, or accompanied by other symptoms, seek immediate care');
  }
  
  // Rash/Skin
  if (lowerInput.includes('rash') || lowerInput.includes('itching') || lowerInput.includes('skin')) {
    suggestions.push('Apply a cool, damp compress to the affected area');
    suggestions.push('Avoid scratching to prevent infection');
    suggestions.push('Keep the area clean and dry');
    suggestions.push('Use mild, fragrance-free soap');
    suggestions.push('Wear loose, breathable clothing');
  }
  
  // Default suggestions
  if (suggestions.length === 0) {
    suggestions.push('Rest and get adequate sleep');
    suggestions.push('Stay hydrated with water and clear fluids');
    suggestions.push('Monitor your symptoms closely');
    suggestions.push('Avoid strenuous activities');
    suggestions.push('Seek medical care if symptoms persist or worsen');
  }
  
  return suggestions.slice(0, 5); // Limit to 5 suggestions
}

/**
 * Generate First-Aid Steps
 */
function generateFirstAid(normalizedInput, primaryCondition) {
  const firstAid = [];
  const lowerInput = normalizedInput.toLowerCase();
  
  // Emergency first-aid
  if (lowerInput.includes('chest pain')) {
    firstAid.push('Sit upright in a comfortable position');
    firstAid.push('Stay calm and avoid exertion');
    firstAid.push('If pain is severe or persistent, call emergency services immediately');
    firstAid.push('Do not drive yourself if pain is severe');
    return firstAid;
  }
  
  // Injury first-aid (RICE)
  if (lowerInput.includes('injury') || lowerInput.includes('twisted') || 
      lowerInput.includes('sprain') || lowerInput.includes('swelling')) {
    firstAid.push('Rest: Stop using the injured area immediately');
    firstAid.push('Ice: Apply ice wrapped in cloth for 15-20 minutes');
    firstAid.push('Compression: Use elastic bandage if available (not too tight)');
    firstAid.push('Elevation: Raise the injured area above heart level');
    firstAid.push('Seek medical care if unable to bear weight or if pain is severe');
    return firstAid;
  }
  
  // Fever first-aid
  if (lowerInput.includes('fever') || lowerInput.includes('temperature')) {
    firstAid.push('Stay hydrated - drink water, ORS, or clear fluids');
    firstAid.push('Rest in a cool, well-ventilated room');
    firstAid.push('Apply cool, damp cloth to forehead and neck');
    firstAid.push('Take a lukewarm bath if comfortable (avoid cold water)');
    firstAid.push('Monitor temperature every 4-6 hours');
    firstAid.push('Seek medical care if fever is very high (above 102°F) or persists');
    return firstAid;
  }
  
  // GI first-aid
  if (lowerInput.includes('vomiting') || lowerInput.includes('nausea') || 
      lowerInput.includes('stomach pain')) {
    firstAid.push('Take small, frequent sips of water or ORS solution');
    firstAid.push('Avoid solid foods for 4-6 hours');
    firstAid.push('Rest in an upright or semi-upright position');
    firstAid.push('Avoid strong smells that might trigger nausea');
    firstAid.push('Gradually reintroduce bland foods when ready');
    firstAid.push('Seek medical care if vomiting is severe, persistent, or contains blood');
    return firstAid;
  }
  
  // Headache first-aid
  if (lowerInput.includes('headache') || lowerInput.includes('head pain')) {
    firstAid.push('Rest in a dark, quiet room');
    firstAid.push('Apply a cold or warm compress to forehead');
    firstAid.push('Stay hydrated - drink water');
    firstAid.push('Avoid screens, bright lights, and loud noises');
    firstAid.push('Try gentle neck and shoulder stretches if helpful');
    firstAid.push('Seek immediate care if headache is severe, sudden, or unusual');
    return firstAid;
  }
  
  // Default first-aid
  firstAid.push('Rest and avoid strenuous activities');
  firstAid.push('Stay hydrated with water and clear fluids');
  firstAid.push('Monitor symptoms closely');
  firstAid.push('Avoid self-medication without doctor consultation');
  firstAid.push('Seek medical care if symptoms persist or worsen');
  
  return firstAid;
}

/**
 * Find Recommended Doctor
 */
async function findRecommendedDoctor(specialization, allDoctors) {
  if (!allDoctors || allDoctors.length === 0) {
    return null;
  }
  
  const lowerSpecialization = specialization.toLowerCase();
  
  // Try exact match first
  let matchedDoctors = allDoctors.filter(doc => 
    doc.speciality && doc.speciality.toLowerCase() === lowerSpecialization
  );
  
  // Try partial match
  if (matchedDoctors.length === 0) {
    matchedDoctors = allDoctors.filter(doc => {
      const docSpec = (doc.speciality || '').toLowerCase();
      return docSpec.includes(lowerSpecialization) || lowerSpecialization.includes(docSpec);
    });
  }
  
  // Fallback to General Physician
  if (matchedDoctors.length === 0 && lowerSpecialization !== 'general physician') {
    matchedDoctors = allDoctors.filter(doc => {
      const docSpec = (doc.speciality || '').toLowerCase();
      return docSpec.includes('general') || docSpec.includes('physician') || docSpec.includes('gp');
    });
  }
  
  // If still no match, return first available
  if (matchedDoctors.length === 0) {
    matchedDoctors = allDoctors.slice(0, 3);
  }
  
  // Sort by availability (available first), then by rating/experience
  matchedDoctors.sort((a, b) => {
    // Available doctors first
    if (a.available && !b.available) return -1;
    if (!a.available && b.available) return 1;
    // Then by experience (higher first)
    return (b.experience || 0) - (a.experience || 0);
  });
  
  // Return best match
  const bestDoctor = matchedDoctors[0];
  if (!bestDoctor) return null;
  
  return {
    id: bestDoctor._id?.toString() || bestDoctor.id,
    name: bestDoctor.name || 'Unknown Doctor',
    specialization: bestDoctor.speciality || specialization,
    availability: bestDoctor.available ? 'available' : 'unavailable',
  };
}

/**
 * Determine Recommended Specialization
 */
function determineSpecialization(normalizedInput, conditionCandidates) {
  const lowerInput = normalizedInput.toLowerCase();
  
  // Check symptom patterns
  for (const [symptom, specialization] of Object.entries(symptomToSpecialization)) {
    if (lowerInput.includes(symptom)) {
      return specialization;
    }
  }
  
  // Check condition candidates
  if (conditionCandidates.length > 0) {
    const primaryCondition = conditionCandidates[0].name.toLowerCase();
    
    if (primaryCondition.includes('cardiac') || primaryCondition.includes('chest')) {
      return 'Cardiologist';
    }
    if (primaryCondition.includes('respiratory') || primaryCondition.includes('flu')) {
      return 'Pulmonologist';
    }
    if (primaryCondition.includes('orthopedic') || primaryCondition.includes('fracture')) {
      return 'Orthopedician';
    }
    if (primaryCondition.includes('gastrointestinal') || primaryCondition.includes('gi')) {
      return 'Gastroenterologist';
    }
    if (primaryCondition.includes('stroke') || primaryCondition.includes('neurological')) {
      return 'Neurologist';
    }
    if (primaryCondition.includes('dermatological') || primaryCondition.includes('skin')) {
      return 'Dermatologist';
    }
  }
  
  return 'General Physician';
}

/**
 * Validate with Gemini
 */
async function validateWithGemini(patientInput, outputJson) {
  if (!genAI || !geminiApiKey) {
    return { valid: true, score: 0.7, corrections: [] };
  }
  
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `Evaluate this medical assistant output against the patient input.

Patient Input: "${patientInput}"

Assistant Output:
${JSON.stringify(outputJson, null, 2)}

Checklist:
1. Are red-flags identified correctly?
2. Is triage correct (emergency/urgent/see_in_24h/self_care)?
3. Is specialization appropriate?
4. Is the assigned doctor from available_doctors?
5. No medication dosages or unsafe content?
6. Suggestions and first-aid must be symptom-specific (not generic).

Return ONLY a JSON object in this exact format:
{
  "valid": true/false,
  "score": 0.0-1.0,
  "corrections": ["correction 1", "correction 2"]
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON
    const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('Gemini validation error:', error);
    return { valid: true, score: 0.7, corrections: [] };
  }
}

/**
 * Main Analyze Symptoms Function
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
    
    const patientInput = symptoms.trim();
    
    // Check for greetings
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'howdy', 'namaste'];
    const lowerInput = patientInput.toLowerCase();
    const isGreeting = greetings.some(greeting => 
      lowerInput === greeting || 
      lowerInput.startsWith(greeting + ' ') || 
      lowerInput.endsWith(' ' + greeting)
    );
    
    if (isGreeting || patientInput.length < 10) {
      return res.json({
        success: true,
        data: {
          isGreeting: true,
          message: "Hello! I'm your medical assistant. Please describe your symptoms, and I'll provide first-aid guidance and suggest the right doctor for you.",
        },
      });
    }
    
    // Get available doctors
    const doctors = await doctorModel
      .find({ available: true })
      .select(['name', 'speciality', 'degree', 'experience', 'fees', 'about', 'image', '_id', 'available'])
      .lean();
    
    if (!doctors || doctors.length === 0) {
      return res.json({
        success: false,
        message: 'No doctors available in the database',
      });
    }
    
    // Normalize input
    const normalizedInput = normalizeInput(patientInput);
    
    // Extract patient info
    const patientInfo = extractPatientInfo(patientInput);
    
    // Generate patient summary
    const patientSummary = `Patient reports: ${patientInput}. ${patientInfo.duration ? `Duration: ${patientInfo.duration}.` : ''} ${patientInfo.age ? `Age: ${patientInfo.age} years.` : ''} ${patientInfo.pregnancy ? 'Patient is pregnant.' : ''}`;
    
    // Generate condition candidates
    const conditionCandidates = generateConditionCandidates(symptoms, normalizedInput);
    
    // Determine primary condition
    const primaryCondition = {
      name: conditionCandidates[0].name,
      confidence: conditionCandidates[0].confidence,
      severity: redFlagSymptoms[Object.keys(redFlagSymptoms).find(key => normalizedInput.includes(key))]?.severity || 'moderate',
      triage: determineTriage(normalizedInput, [], conditionCandidates),
    };
    
    // Generate red flags
    const redFlags = generateRedFlags(normalizedInput);
    
    // Update triage based on red flags
    if (redFlags.length > 0) {
      const hasEmergency = redFlags.some(flag => 
        flag.toLowerCase().includes('emergency') || 
        flag.toLowerCase().includes('immediate')
      );
      if (hasEmergency) {
        primaryCondition.triage = 'emergency';
        primaryCondition.severity = 'severe';
      } else if (primaryCondition.triage === 'self_care') {
        primaryCondition.triage = 'urgent';
      }
    }
    
    // Generate suggestions
    const generalSuggestions = generateSuggestions(normalizedInput, primaryCondition);
    
    // Generate first-aid
    const firstAid = generateFirstAid(normalizedInput, primaryCondition);
    
    // Determine specialization
    const recommendedSpecialization = determineSpecialization(normalizedInput, conditionCandidates);
    
    // Find assigned doctor
    const assignedDoctor = await findRecommendedDoctor(recommendedSpecialization, doctors);
    
    // Generate next steps
    const nextStepsAndTests = [];
    if (primaryCondition.triage === 'emergency') {
      nextStepsAndTests.push('Go to nearest emergency room immediately');
      nextStepsAndTests.push('Call emergency services if unable to transport');
    } else if (primaryCondition.triage === 'urgent') {
      nextStepsAndTests.push('See a doctor within 24 hours');
      nextStepsAndTests.push('Monitor symptoms closely');
    } else if (primaryCondition.triage === 'see_in_24h') {
      nextStepsAndTests.push('Schedule appointment with recommended specialist');
      nextStepsAndTests.push('Continue monitoring symptoms');
    } else {
      nextStepsAndTests.push('Follow self-care suggestions');
      nextStepsAndTests.push('See doctor if symptoms persist or worsen');
    }
    
    // Build output JSON
    const outputJson = {
      patient_summary: patientSummary,
      condition_candidates: conditionCandidates,
      primary_condition: primaryCondition,
      red_flags: redFlags,
      general_suggestions: generalSuggestions,
      first_aid: firstAid,
      recommended_specialization: recommendedSpecialization,
      assigned_doctor: assignedDoctor,
      next_steps_and_tests: nextStepsAndTests,
      confidence_score: primaryCondition.confidence,
      source_note: 'This is not a diagnosis; for emergencies seek hospital immediately',
    };
    
    // Validate with Gemini
    const validation = await validateWithGemini(patientInput, outputJson);
    
    // Apply corrections if needed
    if (validation.corrections && validation.corrections.length > 0) {
      console.log('Gemini validation corrections:', validation.corrections);
      // Apply corrections (simplified - in production, parse and apply intelligently)
    }
    
    // Update confidence score
    outputJson.confidence_score = (primaryCondition.confidence * 0.6) + (validation.score * 0.4);
    
    // Return response in expected format
    return res.json({
      success: true,
      data: {
        isGreeting: false,
        isSerious: primaryCondition.triage === 'emergency' || primaryCondition.triage === 'urgent',
        firstAidGuidance: firstAid.join('\n'),
        suggestedSpeciality: recommendedSpecialization,
        explanation: `Based on your symptoms, I recommend consulting a ${recommendedSpecialization}. ${conditionCandidates[0].rationale}`,
        recommendedDoctors: assignedDoctor ? [{
          _id: assignedDoctor.id,
          name: assignedDoctor.name,
          speciality: assignedDoctor.specialization,
          available: assignedDoctor.availability === 'available',
        }] : [],
        generalAdvice: generalSuggestions.join('\n'),
        firstAidSteps: firstAid,
        // Full structured response
        structuredResponse: outputJson,
      },
    });
    
  } catch (error) {
    console.error('Error in analyzeSymptoms:', error);
    
    return res.json({
      success: false,
      message: 'Unable to process symptoms. Please try again or contact support.',
      error: error.message,
    });
  }
};
