'use strict';

const SCHEMA_VERSION = 2;

function defaultAnnouncements() {
  return {
    schemaVersion: SCHEMA_VERSION,
    version: SCHEMA_VERSION,
    stationCode: 'BG',
    enabledTypes: [
      'arriving',
      'departing',
      'delayed',
      'platform_changed',
      'cancelled',
      'rescheduled',
      'special',
      'greeting',
      'advisory',
      'boarding'
    ],
    languages: ['te', 'en', 'hi'],
    languageOrder: ['te', 'en', 'hi'],
    multilingual: true,
    arrival: {
      clock: 'scheduled',
      startMinutes: 30,
      windows: [
        { fromMinutes: 30, toMinutes: 15, intervalMinutes: 3 },
        { fromMinutes: 15, toMinutes: 0, intervalMinutes: 5 }
      ],
      shortNoticeMinutes: 5,
      shortNoticeCount: 2
    },
    delay: {
      minMinutes: 15,
      mode: 'first_only',
      stepMinutes: 15,
      expressAs: 'minutes'
    },
    departure: {
      clock: 'scheduled',
      minutesBefore: 10,
      repeat: false
    },
    platformChange: {
      auto: false,
      requireStaffConfirm: true
    },
    cancelled: {
      auto: true,
      requireStaffConfirm: false
    },
    rescheduled: {
      auto: true,
      requireStaffConfirm: false
    },
    triggers: {
      approachingMinutes: 30,
      arrivingWhenArrived: true,
      departedWhenDeparted: false
    },
    repeat: {
      count: 1,
      intervalMinutes: 0,
      untilCancelled: false
    },
    priority: {
      manualOverAuto: true,
      ranking: [
        'live',
        'manual',
        'cancelled',
        'platform_changed',
        'arriving',
        'delayed',
        'departing',
        'rescheduled',
        'boarding',
        'special',
        'greeting',
        'advisory'
      ]
    },
    staleNtes: 'stop',
    skipFailedLanguage: true,
    ntesRecovery: 'auto',
    suppress: {
      cancelled: false,
      diverted: true,
      platformUnknown: false,
      nightStart: null,
      nightEnd: null
    },
    volume: {
      mode: 'time_of_day',
      default: 80,
      periods: [
        { id: 'day', start: '06:00', end: '18:00', db: 85 },
        { id: 'evening', start: '18:00', end: '22:00', db: 75 },
        { id: 'night', start: '22:00', end: '06:00', db: 70 }
      ],
      dbToGain: { 85: 100, 75: 80, 70: 60 }
    },
    audio: {
      sink: 'default',
      capture: 'default',
      playCommand: null
    },
    advisory: {
      idleSeconds: 120,
      clips: []
    },
    voices: {
      en: '',
      hi: '',
      te: ''
    },
    historyRetention: 200,
    /* IR PA slot frames: attention → train (digits) → name → route → event → platform.
       Vendor wording until Railway-approved copy arrives. Do not clone station PA audio. */
    templates: {
      approaching: {
        en: 'Attention please. Train number {trainNo}. {trainName}. {from} to {to}. Expected to arrive on platform number {platform} in {minutes} minutes.',
        hi: 'यात्रियों कृपया ध्यान दें। गाड़ी संख्या {trainNo}. {trainName}. {from} से {to} तक। प्लेटफॉर्म नंबर {platform} पर {minutes} मिनट में आने वाली है।',
        te: 'యాత్రీకుల దయచేసి గమనించండి. రైలు నంబర్ {trainNo}. {trainName}. {from} నుండి {to} వరకు. ప్లాట్‌ఫామ్ నంబర్ {platform} పై {minutes} నిమిషాల్లో రావచ్చు.'
      },
      arriving: {
        en: 'Attention please. Train number {trainNo}. {trainName}. {from} to {to}. Will arrive on platform number {platform} in {minutes} minutes.',
        hi: 'यात्रियों कृपया ध्यान दें। गाड़ी संख्या {trainNo}. {trainName}. {from} से {to} तक। प्लेटफॉर्म नंबर {platform} पर {minutes} मिनट में आने वाली है।',
        te: 'యాత్రీకుల దయచేసి గమనించండి. రైలు నంబర్ {trainNo}. {trainName}. {from} నుండి {to} వరకు. ప్లాట్‌ఫామ్ నంబర్ {platform} పై {minutes} నిమిషాల్లో వస్తుంది.'
      },
      departing: {
        en: 'Attention please. Train number {trainNo}. {trainName}. {from} to {to}. Will depart from platform number {platform}.',
        hi: 'यात्रियों कृपया ध्यान दें। गाड़ी संख्या {trainNo}. {trainName}. {from} से {to} तक। प्लेटफॉर्म नंबर {platform} से रवाना होगी।',
        te: 'యాత్రీకుల దయచేసి గమనించండి. రైలు నంబర్ {trainNo}. {trainName}. {from} నుండి {to} వరకు. ప్లాట్‌ఫామ్ నంబర్ {platform} నుంచి బయలుదేరబోతోంది.'
      },
      delayed: {
        en: 'Attention please. Train number {trainNo}. {trainName}. {from} to {to}. Is currently delayed by {delay} minutes.',
        hi: 'यात्रियों कृपया ध्यान दें। गाड़ी संख्या {trainNo}. {trainName}. {from} से {to} तक। वर्तमान में {delay} मिनट विलंब से चल रही है।',
        te: 'యాత్రీకుల దయచేసి గమనించండి. రైలు నంబర్ {trainNo}. {trainName}. {from} నుండి {to} వరకు. ప్రస్తుతం {delay} నిమిషాలు ఆలస్యంగా నడుస్తోంది.'
      },
      platform_changed: {
        en: 'Attention please. Train number {trainNo}. {trainName}. Will now arrive on platform number {platform}.',
        hi: 'यात्रियों कृपया ध्यान दें। गाड़ी संख्या {trainNo}. {trainName}. अब प्लेटफॉर्म नंबर {platform} पर आएगी।',
        te: 'యాత్రీకుల దయచేసి గమనించండి. రైలు నంబర్ {trainNo}. {trainName}. ఇప్పుడు ప్లాట్‌ఫామ్ నంబర్ {platform} పై వస్తుంది.'
      },
      cancelled: {
        en: 'Attention please. Train number {trainNo}. {trainName}. Is cancelled today.',
        hi: 'यात्रियों कृपया ध्यान दें। गाड़ी संख्या {trainNo}. {trainName}. आज रद्द है।',
        te: 'యాత్రీకుల దయచేసి గమనించండి. రైలు నంబర్ {trainNo}. {trainName}. ఈరోజు రద్దు చేయబడింది.'
      },
      rescheduled: {
        en: 'Attention please. Train number {trainNo}. {trainName}. Has been rescheduled.',
        hi: 'यात्रियों कृपया ध्यान दें। गाड़ी संख्या {trainNo}. {trainName}. का समय बदल दिया गया है।',
        te: 'యాత్రీకుల దయచేసి గమనించండి. రైలు నంబర్ {trainNo}. {trainName}. సమయం మార్చబడింది.'
      },
      boarding: {
        en: 'Attention please. Passengers are requested to board train number {trainNo}. {trainName}. On platform number {platform}.',
        hi: 'यात्रियों कृपया ध्यान दें। गाड़ी संख्या {trainNo}. {trainName}. में प्लेटफॉर्म नंबर {platform} से सवार हों।',
        te: 'యాత్రీకుల దయచేసి గమనించండి. రైలు నంబర్ {trainNo}. {trainName}. ప్లాట్‌ఫామ్ నంబర్ {platform} నుంచి ఎక్కవలసిందిగా కోరడమైనది.'
      },
      special: {
        en: 'Attention please. Special train number {trainNo}. {extra}.',
        hi: 'यात्रियों कृपया ध्यान दें। विशेष गाड़ी संख्या {trainNo}. {extra}.',
        te: 'యాత్రీకుల దయచేసి గమనించండి. ప్రత్యేక రైలు నంబర్ {trainNo}. {extra}.'
      },
      greeting: {
        en: '{extra}',
        hi: '{extra}',
        te: '{extra}'
      },
      advisory: {
        en: '{extra}',
        hi: '{extra}',
        te: '{extra}'
      },
      manual: {
        en: 'Attention please. {extra}',
        hi: 'यात्रियों कृपया ध्यान दें। {extra}',
        te: 'యాత్రీకుల దయచేసి గమనించండి. {extra}'
      }
    }
  };
}

module.exports = { defaultAnnouncements, SCHEMA_VERSION };
