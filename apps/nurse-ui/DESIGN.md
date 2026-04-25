# Acuvia Nurse Feature Design

## Goal

The nurse feature gives emergency nursing staff a mobile-first view of every active patient, ordered by injury severity so the highest-risk patients are handled first. This pass is a template only: it defines the screen layout, expected data shape, and function headers that future backend and navigation work can build on.

## Current Template Scope

- Show a priority queue of patients sorted by injury severity.
- Display the key triage information a nurse needs at scan time: priority rank, severity, injury summary, vitals, location, and wait time.
- Include a refresh action placeholder for reloading the queue.
- Include a patient selection placeholder for future detail navigation.
- Include a downloadable app call-to-action placeholder for the future Expo/EAS build or install link.
- Keep implementation contained to `apps/nurse-ui`.

## User Experience

The first screen is the working nurse dashboard, not a marketing page. The nurse sees:

1. A header with the Acuvia Nurse context and a refresh control.
2. Summary counters for all patients, critical patients, and queue status.
3. A vertically scrolling list of patients.
4. Patient rows ordered from most severe to least severe.
5. A footer with the configured backend URL and a `Download App` action.

Severity is visually grouped with restrained badges:

- `critical`: immediate attention
- `high`: urgent attention
- `moderate`: needs care after higher-risk cases
- `low`: stable or lowest current priority

## Data Contract Draft

The eventual backend response can map directly to the template fields:

```js
{
  id: "acu-1042",
  name: "Jordan Lee",
  age: 42,
  injury: "Chest trauma with shortness of breath",
  severity: "critical",
  vitals: "BP 88/54, HR 132",
  location: "Bay 2",
  waitTime: "4 min"
}
```

Expected severity values:

```js
["critical", "high", "moderate", "low"]
```

## Function Headers

These headers exist in `App.js` as placeholders:

```js
function fetchPatients()
function calculateInjuryPriority(patient)
function sortPatientsByPriority(patients)
function handleRefreshPatients()
function handlePatientSelect(patientId)
function requestDownloadableAppBuild()
function getSeverityStyle(severity)
```

Future implementation notes:

- `fetchPatients` should call the nurse/patient backend route and normalize the response.
- `calculateInjuryPriority` should eventually use the final triage scoring model, not just a severity lookup.
- `sortPatientsByPriority` should use severity first, then secondary signals such as abnormal vitals, wait time, and arrival time.
- `handleRefreshPatients` should re-fetch patient data and show loading or error states.
- `handlePatientSelect` should navigate to a patient details screen.
- `requestDownloadableAppBuild` should open an install URL or start an Expo/EAS build distribution flow.

## Downloadable App Plan

This nurse UI is already configured as an Expo React Native app. To make it downloadable later:

1. Add production app icons and splash assets under `apps/nurse-ui/assets`.
2. Finalize `app.json` bundle identifiers for iOS and Android.
3. Configure EAS Build for internal distribution.
4. Wire `requestDownloadableAppBuild` to a signed install link, internal app store, or release page.

## Not In This Template

- Real authentication
- Real backend data fetching
- Websocket/live queue updates
- Patient detail screens
- Clinical decision logic
- Push notifications
- Production app store metadata
