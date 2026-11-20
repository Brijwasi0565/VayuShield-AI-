import type { LanguageCode } from '../types/env';

export interface LanguageOption {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
  dir: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', dir: 'ltr' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', dir: 'ltr' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', dir: 'ltr' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', dir: 'ltr' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi', dir: 'ltr' },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati', dir: 'ltr' },
];

type TranslationDict = {
  navOverview: string;
  nav3D: string;
  navMap: string;
  navHealth: string;
  navAI: string;
  emergencyBanner: string;
  emergencyAction: string;
  aqiLabel: string;
  weatherLabel: string;
  fireAlertsLabel: string;
  pollenLabel: string;
  pollenComingSoon: string;
  forecast7Day: string;
  personalizedAdvice: string;
  dailyRoutines: string;
  householdProfiler: string;
  symptomTracker: string;
  iaqTools: string;
  challenges: string;
  regionalTipTitle: string;
};

const TRANSLATIONS: Record<LanguageCode, TranslationDict> = {
  en: {
    navOverview: 'Overview',
    nav3D: '3D Air Lab',
    navMap: 'Community Map',
    navHealth: 'Household & IAQ',
    navAI: 'AI Studio',
    emergencyBanner: 'Hazardous Air / Fire Emergency Protocol Active',
    emergencyAction: 'Open Emergency Checklist',
    aqiLabel: 'Live Air Quality Index',
    weatherLabel: 'Local Meteorology',
    fireAlertsLabel: 'NASA Fire & Smoke Alerts',
    pollenLabel: 'Pollen & Allergens',
    pollenComingSoon: 'Coming Soon (Regional sensor feed)',
    forecast7Day: '7-Day AQI & Weather Outlook',
    personalizedAdvice: 'Personalized Household Health Guidance',
    dailyRoutines: 'Daily Routine & Commute Optimizer',
    householdProfiler: 'Household Vulnerability Profiles',
    symptomTracker: 'Health Impact & Symptom Log',
    iaqTools: 'Indoor Air Quality (IAQ) Calculators',
    challenges: 'Clean Air Challenges & Badges',
    regionalTipTitle: 'Regional Environmental Context',
  },
  hi: {
    navOverview: 'अवलोकन',
    nav3D: '3D वायु लैब',
    navMap: 'सामुदायिक मानचित्र',
    navHealth: 'परिवार और IAQ',
    navAI: 'AI स्टूडियो',
    emergencyBanner: 'खतरनाक वायु / आग आपातकालीन प्रोटोकॉल सक्रिय',
    emergencyAction: 'आपातकालीन चेकलिस्ट खोलें',
    aqiLabel: 'लाइव वायु गुणवत्ता सूचकांक (AQI)',
    weatherLabel: 'स्थानीय मौसम',
    fireAlertsLabel: 'नासा आग और धुआँ अलर्ट',
    pollenLabel: 'पराग और एलर्जी',
    pollenComingSoon: 'जल्द आ रहा है (क्षेत्रीय डेटा)',
    forecast7Day: '7-दिवसीय AQI और मौसम पूर्वानुमान',
    personalizedAdvice: 'परिवार के लिए व्यक्तिगत स्वास्थ्य सलाह',
    dailyRoutines: 'दैनिक दिनचर्या और यात्रा समय अनुकूलक',
    householdProfiler: 'परिवार स्वास्थ्य प्रोफ़ाइल',
    symptomTracker: 'लक्षण और जोखिम लॉग',
    iaqTools: 'घर के अंदर की वायु (IAQ) उपकरण',
    challenges: 'स्वच्छ वायु चुनौतियाँ और बैज',
    regionalTipTitle: 'क्षेत्रीय पर्यावरण सलाह',
  },
  ta: {
    navOverview: 'கண்ணோட்டம்',
    nav3D: '3D காற்று ஆய்வகம்',
    navMap: 'சமூக வரைபடம்',
    navHealth: 'குடும்பம் & IAQ',
    navAI: 'AI ஸ்டுடியோ',
    emergencyBanner: 'அபாயகரமான காற்று / தீ அவசர நிலை',
    emergencyAction: 'அவசர சரிபார்ப்பு பட்டியல்',
    aqiLabel: 'நேரடி காற்றின் தர குறியீடு',
    weatherLabel: 'உள்ளூர் வானிலை',
    fireAlertsLabel: 'நாசா தீ & புகை எச்சரிக்கை',
    pollenLabel: 'மகரந்தம் & ஒவ்வாமை',
    pollenComingSoon: 'விரைவில் வருகிறது',
    forecast7Day: '7-நாள் AQI & வானிலை முன்னறிவிப்பு',
    personalizedAdvice: 'குடும்ப ஆரோக்கிய வழிகாட்டுதல்',
    dailyRoutines: 'தினசரி அட்டவணை & பயண நேரம்',
    householdProfiler: 'குடும்ப சுகாதார சுயவிவரம்',
    symptomTracker: 'அறிகுறி & வெளிப்பாடு பதிவு',
    iaqTools: 'உட்புற காற்றுத் தர கருவிகள்',
    challenges: 'தூய காற்று சவால்கள்',
    regionalTipTitle: 'பிராந்திய சுற்றுச்சூழல் குறிப்பு',
  },
  te: {
    navOverview: 'సమీక్ష',
    nav3D: '3D ఎయిర్ ల్యాబ్',
    navMap: 'కమ్యూనిటీ మ్యాప్',
    navHealth: 'కుటుంబం & IAQ',
    navAI: 'AI స్టూడియో',
    emergencyBanner: 'ప్రమాదకర వాయు / అగ్ని అత్యవసర స్థితి',
    emergencyAction: 'అత్యవసర చెక్‌లిస్ట్ తెరవండి',
    aqiLabel: 'లైవ్ వాయు నాణ్యత సూచిక (AQI)',
    weatherLabel: 'స్థానిక వాతావరణం',
    fireAlertsLabel: 'నాసా అగ్ని & పొగ హెచ్చరికలు',
    pollenLabel: 'పుప్పొడి & అలెర్జీలు',
    pollenComingSoon: 'త్వరలో వస్తుంది',
    forecast7Day: '7-రోజుల AQI & వాతావరణ అంచనా',
    personalizedAdvice: 'కుటుంబ ఆరోగ్య సూచనలు',
    dailyRoutines: 'రోజువారీ దినచర్య & ప్రయాణ సమయం',
    householdProfiler: 'కుటుంబ ఆరోగ్య ప్రొఫైల్',
    symptomTracker: 'లక్షణాల & ఎక్స్‌పోజర్ లాగ్',
    iaqTools: 'ఇండోర్ ఎయిర్ క్వాలిటీ టూల్స్',
    challenges: 'స్వచ్ఛమైన గాలి సవాళ్లు',
    regionalTipTitle: 'ప్రాంతీయ పర్యావరణ సూచన',
  },
  bn: {
    navOverview: 'সংক্ষিপ্তসার',
    nav3D: '3D বায়ু ল্যাব',
    navMap: 'কমিউনিটি মানচিত্র',
    navHealth: 'পরিবার ও IAQ',
    navAI: 'AI স্টুডিও',
    emergencyBanner: 'বিপজ্জনক বায়ু / অগ্নি জরুরি প্রোটোকল সক্রিয়',
    emergencyAction: 'জরুরি চেকলিস্ট দেখুন',
    aqiLabel: 'লাইভ বায়ু মান সূচক (AQI)',
    weatherLabel: 'স্থানীয় আবহাওয়া',
    fireAlertsLabel: 'নাসা অগ্নি ও ধোঁয়া সতর্কতা',
    pollenLabel: 'পরাগ ও অ্যালার্জি',
    pollenComingSoon: 'শীঘ্রই আসছে',
    forecast7Day: '৭-দিনের AQI ও আবহাওয়ার পূর্বাভাস',
    personalizedAdvice: 'পরিবারের স্বাস্থ্য নির্দেশিকা',
    dailyRoutines: 'দৈনন্দিন রুটিন ও যাতায়াত পরামর্শ',
    householdProfiler: 'পরিবার স্বাস্থ্য প্রোফাইল',
    symptomTracker: 'উপসর্গ ও এক্সপোজার লগ',
    iaqTools: 'ঘরোয়া বায়ু মান (IAQ) সরঞ্জাম',
    challenges: 'নির্মল বায়ু চ্যালেঞ্জ',
    regionalTipTitle: 'আঞ্চলিক পরিবেশগত পরামর্শ',
  },
  mr: {
    navOverview: 'आढावा',
    nav3D: '3D हवा प्रयोगशाळा',
    navMap: 'समुदाय नकाशा',
    navHealth: 'कुटुंब आणि IAQ',
    navAI: 'AI स्टुडिओ',
    emergencyBanner: 'धोकादायक हवा / आग आणीबाणी प्रोटोकॉल सक्रिय',
    emergencyAction: 'आणीबाणी तपासणी यादी',
    aqiLabel: 'थेट हवा गुणवत्ता निर्देशांक (AQI)',
    weatherLabel: 'स्थानिक हवामान',
    fireAlertsLabel: 'नासा आग व धूर सूचना',
    pollenLabel: 'परागकण व अ‍ॅलर्जी',
    pollenComingSoon: 'लवकरच येत आहे',
    forecast7Day: '७-दिवसांचा AQI व हवामान अंदाज',
    personalizedAdvice: 'कुटुंबासाठी वैयक्तिक आरोग्य सल्ला',
    dailyRoutines: 'दैनिक दिनचर्या व प्रवास नियोजक',
    householdProfiler: 'कुटुंब आरोग्य प्रोफाइल',
    symptomTracker: 'लक्षणे आणि संपर्क नोंद',
    iaqTools: 'घरातील हवेची गुणवत्ता (IAQ) साधने',
    challenges: 'स्वच्छ हवा आव्हाने',
    regionalTipTitle: 'प्रादेशिक पर्यावरण संदर्भ',
  },
  gu: {
    navOverview: 'ઝાંખી',
    nav3D: '3D એર લેબ',
    navMap: 'સમુદાય નકશો',
    navHealth: 'પરિવાર અને IAQ',
    navAI: 'AI સ્ટુડિયો',
    emergencyBanner: 'જોખમી હવા / આગ કટોકટી પ્રોટોકોલ સક્રિય',
    emergencyAction: 'કટોકટી ચેકલિસ્ટ ખોલો',
    aqiLabel: 'લાઇવ હવા ગુણવત્તા સૂચકાંક (AQI)',
    weatherLabel: 'સ્થાનિક હવામાન',
    fireAlertsLabel: 'નાસા આગ અને ધુમાડાની ચેતવણી',
    pollenLabel: 'પરાગ અને એલર્જી',
    pollenComingSoon: 'ટૂંક સમયમાં આવી રહ્યું છે',
    forecast7Day: '૭-દિવસનું AQI અને હવામાન પૂર્વાનુમાન',
    personalizedAdvice: 'પરિવાર માટે વ્યક્તિગત આરોગ્ય સલાહ',
    dailyRoutines: 'દૈનિક રૂટિન અને મુસાફરી આયોજक',
    householdProfiler: 'પરિવાર આરોગ્ય પ્રોફાઇલ',
    symptomTracker: 'લક્ષણો અને એક્સપોઝર લોગ',
    iaqTools: 'ઇન્ડોર એર ક્વોલિટી (IAQ) સાધનો',
    challenges: 'સ્વચ્છ હવા પડકારો',
    regionalTipTitle: 'પ્રાદેશિક પર્યાવરણીય સલાહ',
  },
};

export function t(lang: LanguageCode): TranslationDict {
  return TRANSLATIONS[lang] ?? TRANSLATIONS.en;
}

export function getRegionalHealthTip(cityName: string, lang: LanguageCode): string {
  const lower = cityName.toLowerCase();
  const isNorth =
    lower.includes('delhi') ||
    lower.includes('gurugram') ||
    lower.includes('noida') ||
    lower.includes('lucknow') ||
    lower.includes('patna') ||
    lower.includes('jaipur');
  const isCoastal =
    lower.includes('mumbai') || lower.includes('chennai') || lower.includes('kolkata');

  if (lang === 'hi') {
    if (isNorth) {
      return 'उत्तर भारत के मैदानी इलाकों में शीतकालीन इनवर्जन और पराली/धूल के कारण सुबह के समय PM2.5 अधिक रहता है — सुबह की सैर दोपहर 12 बजे के बाद करें।';
    }
    if (isCoastal) {
      return 'तटीय शहरों में समुद्री हवा प्रदूषकों को कम करती है, लेकिन उमस के साथ फफूंद और यातायात धुएं से बचाव के लिए क्रॉस-वेंटिलेशन महत्वपूर्ण है।';
    }
    return 'शहरी निर्माण और वाहन धूल के समय N95 मास्क और गीले पोंछे का उपयोग घर की हवा को स्वच्छ रखता है।';
  }

  if (isNorth) {
    return 'Indo-Gangetic Plain thermal inversions trap winter smog & regional biomass smoke near the ground between 21:00–10:00. Schedule outdoor errands midday.';
  }
  if (isCoastal) {
    return 'Coastal sea breezes aid particulate dispersion midday, though high humidity alongside traffic corridors can trigger mold & allergic airway irritation.';
  }
  return 'Urban road dust and construction PM10 spike near peak commute hours; prioritize wet-mopping indoors and HEPA filtration in bedrooms.';
}
