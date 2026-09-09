'use strict';

function defaultAnnouncements() {
  return {
    version: 1,
    stationCode: 'BG',
    enabledTypes: [
      'approaching',
      'arriving',
      'departed',
      'delayed',
      'platform_changed',
      'cancelled',
      'boarding'
    ],
    languages: ['en', 'hi', 'te'],
    languageOrder: ['en', 'hi', 'te'],
    multilingual: true,
    triggers: {
      approachingMinutes: 15,
      arrivingWhenArrived: true,
      departedWhenDeparted: true
    },
    delay: {
      minMinutes: 15,
      mode: 'first_then_step',
      stepMinutes: 15
    },
    platformChange: {
      auto: false,
      requireStaffConfirm: true
    },
    repeat: {
      count: 1,
      intervalMinutes: 0,
      untilCancelled: false
    },
    priority: {
      manualOverAuto: true,
      ranking: [
        'manual',
        'cancelled',
        'platform_changed',
        'arriving',
        'delayed',
        'approaching',
        'boarding',
        'departed'
      ]
    },
    staleNtes: 'last_known',
    suppress: {
      cancelled: true,
      diverted: true,
      platformUnknown: false,
      nightStart: null,
      nightEnd: null
    },
    volume: {
      mode: 'staff',
      default: 80
    },
    audio: {
      sink: 'file',
      playCommand: null
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
        en: 'Attention please. Train number {trainNo} {trainName} is arriving on platform number {platform}.',
        hi: 'कृपया ध्यान दें। गाड़ी संख्या {trainNo} {trainName} प्लेटफॉर्म संख्या {platform} पर आ रही है।',
        te: 'దయచేసి శ్రద్ధ వహించండి. రైలు నంబర్ {trainNo} {trainName} ప్లాట్‌ఫామ్ నంబర్ {platform} పై వస్తోంది.'
      },
      departed: {
        en: 'Train number {trainNo} {trainName} has departed from platform number {platform}.',
        hi: 'गाड़ी संख्या {trainNo} {trainName} प्लेटफॉर्म संख्या {platform} से रवाना हो गई है।',
        te: 'రైలు నంబర్ {trainNo} {trainName} ప్లాట్‌ఫామ్ నంబర్ {platform} నుంచి బయలుదేరింది.'
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
      boarding: {
        en: 'Passengers are requested to board train number {trainNo} {trainName} on platform number {platform}.',
        hi: 'यात्रियों से अनुरोध है कि गाड़ी संख्या {trainNo} {trainName} में प्लेटफॉर्म संख्या {platform} से सवार हों।',
        te: 'ప్రయాణికులు రైలు నంబర్ {trainNo} {trainName}లో ప్లాట్‌ఫామ్ నంబర్ {platform} నుంచి ఎక్కవలసిందిగా కోరడమైనది.'
      },
      manual: {
        en: 'Attention please. {extra}',
        hi: 'कृपया ध्यान दें। {extra}',
        te: 'దయచేసి శ్రద్ధ వహించండి. {extra}'
      }
    }
  };
}

module.exports = { defaultAnnouncements };
