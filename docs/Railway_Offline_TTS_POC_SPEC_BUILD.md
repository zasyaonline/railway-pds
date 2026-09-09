# Railway Appliance — Offline TTS POC
## SPECIFY → BUILD Artifact v1.0

### 1. Objective

Validate offline Text-to-Speech (TTS) for railway announcements on the target Ubuntu appliance.

Languages:
- English
- Hindi
- Telugu

Primary candidate:
- Piper

Baseline/fallback candidate:
- eSpeak NG

The POC must remain isolated from the existing Railway Platform, Coach and NTES applications.

---

## 2. Scope

### IN SCOPE
- Ubuntu 24.04 ARM64
- Offline synthesis after installation/models are available
- English, Hindi and Telugu
- WAV generation
- Local audio playback
- Railway-specific test sentences
- Generation latency measurement
- CPU/memory observation
- Piper vs eSpeak NG comparison

### OUT OF SCOPE
- NTES integration
- Announcement rules
- Automatic triggering
- Announcement queue
- Admin UI
- Production systemd service
- Production PA integration
- Final customer-approved wording
- Final production voice selection

---

## 3. Architecture

    Test sentence
          |
          v
    Language-specific text
          |
          v
       TTS Engine
      /          \
   Piper       eSpeak NG
      \          /
          v
         WAV
          |
          v
    Local playback

Production boundary to preserve:

    Announcement Generator
             |
             v
    Text normalization
             |
             v
          TTS Service
             |
             v
           Audio

TTS must not know about NTES, trains, platforms, delays, or announcement rules.

Conceptual API:

    synthesize(text, language, voice) -> WAV

---

## 4. Test Corpus

Use the same semantic content for both engines.

### T1 — Basic
English:
"Attention please. The train is arriving shortly."

Provide natural Hindi and Telugu equivalents for testing.

### T2 — Train number
"Train number 12723 is arriving."

### T3 — Platform
"Train number 12723 is arriving on platform number 2."

### T4 — Delay
"Train number 12723 is delayed by 25 minutes."

### T5 — Larger numbers
Test representative train/platform/delay values, including multi-digit values.

### T6 — Time
"Train number 12723 is expected to arrive at 10:45 AM."

### T7 — Proper nouns
Use actual railway train and station names available to the development team.

NOTE:
Do not assume raw numeric strings or proper nouns will be pronounced correctly. These become candidates for a later language-specific text-normalization layer.

---

## 5. Execution Plan

### Phase A — eSpeak NG baseline

On Ubuntu:

    sudo apt update
    sudo apt install -y espeak-ng

Verify voices:

    espeak-ng --voices=en
    espeak-ng --voices=hi
    espeak-ng --voices=te

Generate WAV samples using the selected language voice.

Record:
- command used
- voice selected
- generation time
- output file size
- subjective pronunciation result

### Phase B — Piper

Install the current Piper implementation appropriate for Ubuntu 24.04 ARM64.

Obtain one candidate voice for:
- English
- Hindi
- Telugu

Generate the same T1–T7 corpus.

Record:
- Piper version
- voice/model name
- model size
- generation time
- output file size
- CPU/memory observation
- subjective pronunciation result

### Phase C — Playback

Play generated WAV files through the Ubuntu VM's available audio output.

Confirm:
- WAV is playable
- speech is intelligible
- no unexpected clipping/distortion
- pauses are acceptable

If the VM cannot expose a useful audio device, retain WAV files and defer physical PA testing to the target appliance.

---

## 6. Measurement Method

For each synthesis:

1. Start timing immediately before synthesis.
2. Stop timing when the WAV file is completely generated.
3. Record elapsed time.
4. Record WAV size.
5. Observe CPU/memory during several generations.
6. Repeat representative samples where useful.

Suggested result table:

| Language | Engine | Voice | T1 | T2 | T3 | T4 | T5 | T6 | T7 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| English | Piper | TBD | | | | | | | | |
| Hindi | Piper | TBD | | | | | | | | |
| Telugu | Piper | TBD | | | | | | | | |
| English | eSpeak NG | TBD | | | | | | | | |
| Hindi | eSpeak NG | TBD | | | | | | | | |
| Telugu | eSpeak NG | TBD | | | | | | | | |

For quality columns use:
- GOOD
- ACCEPTABLE
- POOR
- FAIL

---

## 7. Acceptance Criteria

A candidate passes the technical POC only if:

1. It operates locally without a runtime cloud dependency.
2. It can synthesize all three required languages.
3. Generated WAV files are playable.
4. Railway numbers and common announcement phrases are understandable.
5. Generation latency is operationally acceptable for the intended workflow.
6. CPU and memory consumption are reasonable for the appliance.
7. The voice is sufficiently clear for further PA evaluation.

There is intentionally no arbitrary numeric quality threshold at this stage.

---

## 8. Engineering Rules

1. Do not modify the existing Railway application for this POC.
2. Do not add NTES calls.
3. Do not add cloud TTS.
4. Do not commit downloaded voice/model binaries into the application repository.
5. Keep POC assets in a separate test/work directory.
6. Record exact versions and commands.
7. Do not freeze Piper as production until Hindi/Telugu and railway-specific pronunciation are evaluated.
8. Keep the eventual TTS adapter boundary independent of the chosen engine.

---

## 9. Deliverables

The POC should produce:

    tts-poc/
      README.md
      scripts/
      corpus/
      output/
        piper/
          en/
          hi/
          te/
        espeak/
          en/
          hi/
          te/
      results/
        results.md
        measurements.csv

The exact installation mechanism may differ between ARM64 development and the final appliance. Record the mechanism used rather than assuming it is production-ready.

---

## 10. Decision Gate

After Phase C, make one of:

### A — Piper selected
Piper becomes the production TTS candidate and the TTS subsystem can be specified around it.

### B — eSpeak NG selected
Use eSpeak NG if Piper does not meet operational requirements.

### C — Neither selected
Investigate another offline TTS option before integrating TTS into the announcement subsystem.

Do not make the production decision from installation success alone. Audio quality and railway-specific pronunciation are mandatory inputs.

---

## 11. Next Step After POC

Once the POC is complete:

SPECIFY → TTS production subsystem

including:
- voice configuration
- language profiles
- text normalization
- caching
- WAV format
- synthesis timeout/error handling
- audio handoff
- logging
- resource limits
- service lifecycle
- production Ubuntu packaging
- PA integration

Only then should TTS be connected to the Announcement Engine.
