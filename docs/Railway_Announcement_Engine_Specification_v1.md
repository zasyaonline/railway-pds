# Railway Appliance — Announcement Engine Specification
## Customer Requirements → Implementation Specification v1.0

**Mode:** SPECIFY  
**Status:** Proposed specification pending explicit resolution of open questions  
**Scope:** Local Railway Announcement Engine only  
**Basis:** Customer's Announcement Requirements Specification

## 1. Purpose

Define implementation-ready behavior for automatic and manual train announcements on the standalone Railway appliance.

The system shall:
- use NTES as the sole source for automatic train information;
- operate without cloud services;
- support automatic TTS announcements;
- support live manual staff announcements;
- send announcement audio to the existing Railway PA system;
- maintain a complete announcement history/audit log.

## 2. Confirmed Customer Decisions

### Announcement types
1. Train arriving
2. Train departing — wording represents "will depart / is going to depart", never "has departed"
3. Train delayed
4. Platform change
5. Train cancelled
6. Train rescheduled
7. Special announcements
8. Greetings
9. Advisories

Special trains not present in NTES are manually announced by staff.

### Languages
Automatic announcement language sequence:

**Telugu → English → Hindi**

Languages are sequential, never simultaneous.

### TTS
Automatic announcements use computer-generated TTS. The production engine remains undecided pending the separate offline TTS POC.

### NTES dependency
All automatic train announcements are completely dependent on live NTES information.

When NTES pauses or goes down:
- automatic announcements stop;
- the system does NOT use last-known train data for new automatic announcements;
- staff handles announcements manually.

## 3. Automatic Arrival Announcement

Automatic arrival announcements begin **30 minutes before arrival**, using the original NTES arrival timing. Customer explicitly states: "from original NTES fetch, no delay applied".

The implementation shall therefore keep the original NTES arrival reference separate from any delay-adjusted/expected timing.

### Repetition

| Time before arrival | Frequency |
|---|---|
| 30–15 minutes | Every 3 minutes |
| 15–0 minutes | Every 5 minutes |

Boundary behavior at exactly 15 minutes must be explicitly tested/confirmed; do not silently invent it.

### Short-notice train

If arrival is discovered with **less than 5 minutes notice**:
- make 2 announcements within the 5-minute period;
- manual override can halt the sequence.

Exact placement of the two announcements within the five-minute period is not specified and must not be invented.

## 4. Delay Announcement

Automatic delay announcement condition:

**delay >= 15 minutes**

Delay shall always be expressed in minutes.

Examples:
- 15 minutes → "15 minutes"
- 60 minutes → "60 minutes"
- 90 minutes → "90 minutes"

Do not render hour-based shorthand such as "1 hour" or "1 hr".

The customer has not specified whether an unchanged qualifying delay is announced once, repeatedly, or again only after a larger increase. This remains open.

## 5. Platform Change

Platform-change announcements require **staff confirmation before broadcasting**.

Flow:

```text
Detected platform change
        ↓
Create pending announcement
        ↓
Staff confirmation
        ↓
Queue / broadcast
```

No automatic broadcast without confirmation.

## 6. Cancellation and Rescheduling

The system shall support:
- cancelled;
- rescheduled.

The customer response does not define exact trigger conditions or repetition policies. Do not invent them.

Open:
- NTES state constituting cancellation;
- NTES state constituting reschedule;
- announcement timing;
- repetition;
- confirmation requirement.

## 7. Departure Announcements

Departure announcements are supported.

Required semantic rule:
- use "will depart" / "is going to depart";
- never use "has departed".

Exact trigger timing and repetition are not specified.

## 8. Announcement Event Model

Announcements shall be represented internally as events rather than directly playing audio.

Conceptual:

```text
AnnouncementEvent
  id
  trainId
  trainNumber
  eventType
  detectedAt
  source
  priority
  confirmationRequired
  languages
  status
```

Event types:

```text
ARRIVING
DEPARTING
DELAYED
PLATFORM_CHANGE
CANCELLED
RESCHEDULED
SPECIAL
GREETING
ADVISORY
```

## 9. Automatic Pipeline

```text
NTES Poller
    ↓
Normalized NTES State
    ↓
Freshness / Availability Gate
    ↓
Announcement Event Detection
    ↓
Rule Evaluation
    ↓
Announcement Event
    ↓
Language-specific Text Generation
    ↓
TTS
    ↓
Audio
    ↓
Announcement Queue
    ↓
Railway PA
```

The Announcement Engine must NOT call NTES directly. There remains exactly one NTES poller at appliance level.

## 10. Freshness / NTES Failure

Automatic announcements require current NTES data.

When NTES is unavailable:
```text
Automatic announcements = STOP
```

The engine must not generate new automatic announcements from stale data.

Manual announcements remain available.

## 11. Duplicate Suppression

The engine shall prevent duplicate logical events except where the configured arrival repetition schedule explicitly requires repetition.

A logical event should have a stable identity sufficient to distinguish:
- train entering arrival window;
- delay reaching qualifying state;
- platform change;
- cancellation/reschedule state changes.

For event types without a customer-defined repetition rule, do not invent periodic repetition.

## 12. Manual Announcement Path

Customer requirement: staff speaks freely; no manual input form is required.

Authorized users:
- Station Master;
- Ticketing Office / person in charge.

Conceptual:

```text
Staff microphone
      ↓
Live audio capture
      ↓
Manual announcement
      ↓
Railway PA
```

Manual speech must not be forced through the TTS text-entry workflow.

## 13. Manual Override

When staff makes a manual announcement:

**Automatic announcement playback must be stopped.**

Stop is manually triggered by staff; the system must not auto-detect voice and pause.

Controls:
- stop/interrupt automatic announcements;
- clear all queued announcements;
- resume queued announcements;
- resume in original queue order.

## 14. Queue

The queue shall serialize playback and prevent overlap.

Minimum operations:

```text
enqueue()
cancel()
clearAll()
pauseAutomatic()
resumeAutomatic()
replay()
```

Manual announcements take precedence.

Conceptual behavior:

```text
Automatic playback
        ↓
Staff manual override
        ↓
STOP
        ↓
Manual announcement
        ↓
Clear queue OR resume queue
```

Queue ordering must be preserved.

## 15. Pre-recorded Greetings / Advisories

Pre-recorded greetings and advisories shall be allowed between train announcements.

They must not conflict with primary train announcements or interrupt a higher-priority train announcement.

Exact scheduling remains open.

## 16. Language Sequencing

Every automatic multilingual announcement plays:

**TELUGU → ENGLISH → HINDI**

Sequentially.

Conceptually:

```text
AnnouncementEvent
   ├── Telugu audio
   ├── English audio
   └── Hindi audio
```

No simultaneous playback.

Failure behavior for an individual language remains open and must be explicitly defined before production.

## 17. Text Generation

Automatic announcement text shall be generated from structured data.

```text
Train data
  +
Event type
  +
Language
  ↓
Announcement Text Generator
  ↓
Language-specific normalization
  ↓
TTS
```

Normalization will eventually need to address:
- train numbers;
- platform numbers;
- delay minutes;
- times;
- train names;
- station names.

TTS itself must remain unaware of railway business rules.

## 18. TTS Boundary

Production interface:

```text
synthesize(
    text,
    language,
    voiceProfile
) -> audio
```

The production engine is TBD.

The implementation shall isolate engine-specific APIs behind an adapter.

## 19. Audio Output

Customer requires the existing Railway PA system plus PC connection.

Conceptual:

```text
TTS / recorded audio
       ↓
Audio Player
       ↓
Configured system audio output
       ↓
Railway PA
```

Do not hard-code a particular Linux audio device until hardware is confirmed.

## 20. Volume

Customer specifies fixed time-based levels:

| Period | Volume |
|---|---:|
| Daytime | 85 dB |
| Evening | 75 dB |
| Night | 70 dB |

Staff cannot adjust volume.

Important engineering distinction: software cannot guarantee physical acoustic SPL without calibration against the actual PA system. Treat these as target acoustic levels pending hardware calibration.

Day/evening/night clock boundaries are not specified and remain open.

## 21. History / Audit

The system shall maintain a complete announcement history.

Customer-required fields:
- Timestamp
- Train Number
- Announcement Type
- Language(s)
- Manual/Automatic
- Success/Failure

For manual announcements:
- audio must be retained;
- transcript must be retained.

Suggested internal fields:

```text
announcementId
timestamp
mode
trainNumber
eventType
languages
status
failureReason
operator/session
audioReference
transcriptReference
```

## 22. Station Configuration

Customer PDF: same rules apply to all stations.

**Product add-on:** the appliance still ships those PDF rules as defaults, but Station Master can override them per station in Admin → Announcement rules. Overrides persist as `/etc/zasya/railway/overlays/{STATION}/announcements.json` (schemaVersion, updatedAt, updatedBy, full settings) so a future central console can list and sync each station without a format change.

## 23. Special Trains

Special trains, typically beginning with "0":
- may not appear in NTES;
- have no name;
- have route information;
- are manually announced;
- staff may stop automatic announcements while a special train is in effect.

Do not manufacture NTES events for non-NTES special trains.

## 24. Minimum Engine States

Suggested states:

```text
RUNNING
PAUSED
NTES_UNAVAILABLE
MANUAL_OVERRIDE
```

Mandatory invariant:

**NTES_UNAVAILABLE prevents creation of new automatic train announcements.**

## 25. Failure Handling

At minimum:
- TTS failure → mark language/event failure and log it;
- audio playback failure → log failure;
- NTES unavailable → stop automatic generation;
- platform change → wait for staff confirmation;
- manual override → stop automatic playback;
- queue clear → remove pending automatic items;
- replay → create a controlled replay/history entry.

Exact retry/recovery behavior is not yet customer-specified; do not invent silent retries.

## 26. Open Questions

Before production BUILD, resolve:

1. Exact NTES fields/semantics for original arrival vs expected arrival.
2. Delay announcement repetition behavior.
3. Departure trigger timing.
4. Departure repetition.
5. Cancellation trigger and repetition.
6. Reschedule trigger and repetition.
7. Exact timing of two <5-minute announcements.
8. Whether cancellation/reschedule require confirmation.
9. Greeting/advisory scheduling.
10. Day/evening/night clock boundaries.
11. Exact PA hardware/interface.
12. Manual recording retention duration.
13. Manual transcription method and accuracy requirement.
14. Behavior if one language TTS generation fails.
15. Behavior if PA output fails.
16. Whether automatic announcements resume automatically after NTES recovery.
17. Whether an interrupted announcement restarts or resumes.
18. Maximum queue size.
19. Whether replay repeats all three languages.
20. Whether special announcements/advisories use TTS or pre-recorded audio.

## 27. Acceptance Test Categories

### Arrival
- enters 30-minute window;
- 30–15 minute repetition;
- 15–0 minute repetition;
- exact 15-minute boundary;
- <5-minute discovery;
- NTES recovery.

### Delay
- 14 min → no delay announcement;
- 15 min → announcement;
- 60 min → 60-minute representation;
- subsequent delay updates.

### Platform
- platform changes;
- no broadcast before confirmation;
- staff confirmation.

### NTES
- unavailable;
- stale data;
- recovery;
- no new announcement from stale data.

### Languages
- Telugu first;
- English second;
- Hindi third;
- no overlap;
- language failure behavior.

### Manual
- free speech;
- automatic playback stops;
- clear queue;
- resume queue;
- original order;
- replay.

### Queue
- simultaneous events;
- no overlap;
- cancellation;
- manual interruption.

### Audit
- automatic success/failure;
- manual audio;
- transcript;
- replay/history.

### Volume
- time-period transitions;
- configured output levels;
- physical SPL validation on target PA.

## 28. Architectural Decisions

**DECISION:** Announcement Engine is local to the Railway Appliance, consumes normalized NTES state, does not call NTES directly, and requires no cloud service.

**DECISION:** Manual live speech and automatic TTS are separate input paths converging on a controlled audio/queue layer.

**DECISION:** Automatic train announcements stop when current NTES data is unavailable; stale data cannot generate new automatic announcements.

**DECISION:** Automatic multilingual announcements play Telugu → English → Hindi sequentially.

**DECISION:** Platform-change announcements require staff confirmation.

**DECISION:** Station rules are common across stations; no per-station rule editor in MVP.

## 29. Recommended Component Boundary

```text
edge/announcements/
  announcement-engine.js
  event-detector.js
  announcement-rules.js
  announcement-generator.js
  announcement-queue.js

  tts/
    tts-service.js
    tts-adapter.js

  audio/
    audio-player.js
    audio-output.js

  manual/
    manual-announcement.js
    recorder.js
    transcript.js

  history/
    announcement-history.js
```

For MVP, prefer one Announcement service/process with internal modules rather than microservices.

## 30. Scope

### IN SCOPE
- automatic train announcements;
- manual live announcements;
- TTS abstraction;
- three-language sequencing;
- queueing;
- manual override;
- NTES freshness gate;
- platform confirmation;
- announcement history;
- time-based volume control;
- Railway PA audio boundary.

### OUT OF SCOPE
- cloud TTS;
- cloud announcement processing;
- per-station rule customization;
- NTES client redesign;
- Kiosk functionality;
- Platform display redesign;
- Coach display redesign.

### FUTURE
- station-specific configuration if later requested;
- central announcement analytics;
- remote management;
- additional languages;
- advanced rule authoring.

## 31. Status

### Frozen from customer response
- announcement categories;
- 30-minute arrival start;
- repetition windows;
- 15-minute delay threshold;
- delay expressed in minutes;
- platform confirmation;
- <5-minute two-announcement requirement;
- Telugu → English → Hindi;
- TTS;
- NTES-only automatic dependency;
- manual free speech;
- manual override;
- queue controls;
- fixed time-based volume;
- history requirements;
- common station rules.

### Not yet frozen
- NTES field mapping;
- several event triggers/repetition rules;
- PA hardware;
- volume time boundaries/calibration;
- manual recording/transcription implementation;
- TTS engine/voices;
- failure/recovery behaviors.

## 32. Next Step

Resolve behaviorally significant open items, then:

**SPECIFY → FINALIZE → BUILD → VERIFY**

The separate offline TTS POC may continue in parallel.
