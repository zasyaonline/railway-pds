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
    templates: {
      approaching: {
        en: 'Attention please. Train number {trainNo} {trainName} is expected to arrive on platform number {platform} in {minutes} minutes.',
        hi: 'कृपया ध्यान दें। गाड़ी संख्या {trainNo} {trainName} प्लेटफॉर्म संख्या {platform} पर {minutes} मिनट में आने वाली है।',
        te: 'దయచేసి శ్రద్ధ వహించండి. రైలు నంబర్ {trainNo} {trainName} ప్లాట్‌ఫామ్ నంబర్ {platform} పై {minutes} నిమిషాల్లో రావచ్చు.'
      },
      arriving: {
        en: 'Attention please. Train number {trainNo} {trainName} will arrive on platform number {platform} in {minutes} minutes.',
        hi: 'कृपया ध्यान दें। गाड़ी संख्या {trainNo} {trainName} प्लेटफॉर्म संख्या {platform} पर {minutes} मिनट में आने वाली है।',
        te: 'దయచేసి శ్రద్ధ వహించండి. రైలు నంబర్ {trainNo} {trainName} ప్లాట్‌ఫామ్ నంబర్ {platform} పై {minutes} నిమిషాల్లో వస్తుంది.'
      },
      departing: {
        en: 'Attention please. Train number {trainNo} {trainName} will depart from platform number {platform}.',
        hi: 'कृपया ध्यान दें। गाड़ी संख्या {trainNo} {trainName} प्लेटफॉर्म संख्या {platform} से रवाना होगी।',
        te: 'దయచేసి శ్రద్ధ వహించండి. రైలు నంబర్ {trainNo} {trainName} ప్లాట్‌ఫామ్ నంబర్ {platform} నుంచి బయలుదేరబోతోంది.'
      },
      delayed: {
        en: 'Attention please. Train number {trainNo} {trainName} is delayed by {delay} minutes.',
        hi: 'कृपया ध्यान दें। गाड़ी संख्या {trainNo} {trainName} {delay} मिनट विलंब से चल रही है।',
        te: 'దయచేసి శ్రద్ధ వహించండి. రైలు నంబర్ {trainNo} {trainName} {delay} నిమిషాలు ఆలస్యంగా నడుస్తోంది.'
      },
      platform_changed: {
        en: 'Attention please. Train number {trainNo} {trainName} will now arrive on platform number {platform}.',
        hi: 'कृपया ध्यान दें। गाड़ी संख्या {trainNo} {trainName} अब प्लेटफॉर्म संख्या {platform} पर आएगी।',
        te: 'దయచేసి శ్రద్ధ వహించండి. రైలు నంబర్ {trainNo} {trainName} ఇప్పుడు ప్లాట్‌ఫామ్ నంబర్ {platform} పై వస్తుంది.'
      },
      cancelled: {
        en: 'Attention please. Train number {trainNo} {trainName} is cancelled today.',
        hi: 'कृपया ध्यान दें। गाड़ी संख्या {trainNo} {trainName} आज रद्द है।',
        te: 'దయచేసి శ్రద్ధ వహించండి. రైలు నంబర్ {trainNo} {trainName} ఈరోజు రద్దు చేయబడింది.'
      },
      rescheduled: {
        en: 'Attention please. Train number {trainNo} {trainName} has been rescheduled.',
        hi: 'कृपया ध्यान दें। गाड़ी संख्या {trainNo} {trainName} का समय बदल दिया गया है।',
        te: 'దయచేసి శ్రద్ధ వహించండి. రైలు నంబర్ {trainNo} {trainName} సమయం మార్చబడింది.'
      },
      boarding: {
        en: 'Passengers are requested to board train number {trainNo} {trainName} on platform number {platform}.',
        hi: 'यात्रियों से अनुरोध है कि गाड़ी संख्या {trainNo} {trainName} में प्लेटफॉर्म संख्या {platform} से सवार हों।',
        te: 'ప్రయాణికులు రైలు నంబర్ {trainNo} {trainName}లో ప్లాట్‌ఫామ్ నంబర్ {platform} నుంచి ఎక్కవలసిందిగా కోరడమైనది.'
      },
      special: {
        en: 'Attention please. Special train {trainNo} {extra}.',
        hi: 'कृपया ध्यान दें। विशेष गाड़ी {trainNo} {extra}।',
        te: 'దయచేసి శ్రద్ధ వహించండి. ప్రత్యేక రైలు {trainNo} {extra}.'
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
        hi: 'कृपया ध्यान दें। {extra}',
        te: 'దయచేసి శ్రద్ధ వహించండి. {extra}'
      }
    }
  };
}

module.exports = { defaultAnnouncements, SCHEMA_VERSION };
