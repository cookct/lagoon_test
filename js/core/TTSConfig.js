/**
 * Venice & Google TTS Configuration
 * List of available voices and default settings
 */

export const TTS_PROVIDERS = {
  VENICE: 'venice',
  GOOGLE: 'google'
};

export const VENICE_VOICES = [
  { id: 'af_sky', name: 'Sky (Female, Default)' },
  { id: 'af_alloy', name: 'Alloy (Female)' },
  { id: 'af_aoede', name: 'Aoede (Female)' },
  { id: 'af_bella', name: 'Bella (Female)' },
  { id: 'af_heart', name: 'Heart (Female)' },
  { id: 'af_jadzia', name: 'Jadzia (Female)' },
  { id: 'af_jessica', name: 'Jessica (Female)' },
  { id: 'af_kore', name: 'Kore (Female)' },
  { id: 'af_nicole', name: 'Nicole (Female)' },
  { id: 'af_nova', name: 'Nova (Female)' },
  { id: 'af_river', name: 'River (Female)' },
  { id: 'af_sarah', name: 'Sarah (Female)' },
  { id: 'am_adam', name: 'Adam (Male)' },
  { id: 'am_echo', name: 'Echo (Male)' },
  { id: 'am_eric', name: 'Eric (Male)' },
  { id: 'am_fenrir', name: 'Fenrir (Male)' },
  { id: 'am_liam', name: 'Liam (Male)' },
  { id: 'am_michael', name: 'Michael (Male)' },
  { id: 'am_onyx', name: 'Onyx (Male)' },
  { id: 'am_puck', name: 'Puck (Male)' },
  { id: 'bf_alice', name: 'Alice (UK Female)' },
  { id: 'bf_emma', name: 'Emma (UK Female)' },
  { id: 'bm_daniel', name: 'Daniel (UK Male)' },
  { id: 'bm_george', name: 'George (UK Male)' }
];

export const GOOGLE_VOICES = [
  { id: 'Puck', name: 'Puck (Upbeat)' },
  { id: 'Charon', name: 'Charon (Informative)' },
  { id: 'Kore', name: 'Kore (Firm)' },
  { id: 'Fenrir', name: 'Fenrir (Excitable)' },
  { id: 'Leda', name: 'Leda (Youthful)' },
  { id: 'Zephyr', name: 'Zephyr (Bright)' },
  { id: 'Orus', name: 'Orus (Firm)' },
  { id: 'Aoede', name: 'Aoede (Breezy)' },
  { id: 'Callirrhoe', name: 'Callirrhoe (Easy-going)' },
  { id: 'Autonoe', name: 'Autonoe (Bright)' },
  { id: 'Enceladus', name: 'Enceladus (Breathy)' },
  { id: 'Iapetus', name: 'Iapetus (Clear)' },
  { id: 'Umbriel', name: 'Umbriel (Easy-going)' },
  { id: 'Algieba', name: 'Algieba (Smooth)' },
  { id: 'Despina', name: 'Despina (Smooth)' },
  { id: 'Erinome', name: 'Erinome (Clear)' },
  { id: 'Algenib', name: 'Algenib (Gravelly)' },
  { id: 'Rasalgethi', name: 'Rasalgethi (Informative)' },
  { id: 'Laomedeia', name: 'Laomedeia (Upbeat)' },
  { id: 'Achernar', name: 'Achernar (Soft)' },
  { id: 'Alnilam', name: 'Alnilam (Firm)' },
  { id: 'Schedar', name: 'Schedar (Even)' },
  { id: 'Gacrux', name: 'Gacrux (Mature)' },
  { id: 'Pulcherrima', name: 'Pulcherrima (Forward)' },
  { id: 'Achird', name: 'Achird (Friendly)' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi (Casual)' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix (Gentle)' },
  { id: 'Sadachbia', name: 'Sadachbia (Lively)' },
  { id: 'Sadaltager', name: 'Sadaltager (Knowledgeable)' },
  { id: 'Sulafat', name: 'Sulafat (Warm)' }
];

export const DEFAULT_PROVIDER = 'google';
export const DEFAULT_VOICE = 'Aoede';
export const DEFAULT_GOOGLE_VOICE = 'Aoede';