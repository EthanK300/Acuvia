import { useEffect, useMemo, useState } from "react";
import acuviaLogo from "./assets/acuvia-logo.png";
import "./App.css";

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL || "";
const backendUrl = apiBaseUrl || "same-origin /api proxy";
const patientsApiUrl = `${apiBaseUrl}/api/patients`;
const DEBUG_PREFIX = "[patient-ui]";

const initialForm = {
  firstName: "",
  lastName: "",
  birthday: "",
  areaOfPain: "",
  painLevel: "",
  urgentSymptoms: "",
  medication: "",
  allergies: "",
  painDuration: "",
  hasHadBefore: "",
  reason: "",
  updateNote: ""
};

const selectFields = [
  {
    id: "areaOfPain",
    label: "Area of Pain",
    options: ["Head", "Chest", "Abdomen", "Back", "Arm or Hand", "Leg or Foot", "Skin", "Other"]
  },
  {
    id: "painLevel",
    label: "Rate Overall Pain Level",
    options: ["1 - Mild", "2", "3", "4", "5 - Moderate", "6", "7", "8", "9", "10 - Severe"]
  },
  {
    id: "urgentSymptoms",
    label: "Any trouble breathing, chest pain, or feel like you might pass out?",
    options: ["No", "Yes", "Not sure"]
  },
  {
    id: "medication",
    label: "Any Medication?",
    options: ["No", "Yes", "Not sure"]
  },
  {
    id: "allergies",
    label: "Any Allergies?",
    options: ["No", "Yes", "Not sure"]
  }
];

const durationOptions = ["Just Started", "A Few Hours", "More than a Day"];

async function requestJson(url, options = {}) {
  const method = options.method || "GET";
  console.info(`${DEBUG_PREFIX} request:start`, {
    method,
    url,
    pageOrigin: window.location.origin,
    backendUrl
  });

  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    const payload = await response.json().catch(() => ({}));
    console.info(`${DEBUG_PREFIX} request:finish`, {
      method,
      url,
      status: response.status,
      payload
    });

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || "Request failed");
    }

    return payload;
  } catch (error) {
    console.error(`${DEBUG_PREFIX} request:error`, {
      method,
      url,
      message: error.message,
      online: navigator.onLine
    });
    throw error;
  }
}

function buildLogEntry(message, detail = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleTimeString(),
    message,
    detail
  };
}

async function checkPatientSession() {
  return requestJson(`${patientsApiUrl}/session`);
}

async function createPatientEntry(payload) {
  return requestJson(patientsApiUrl, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function appendPatientHistory(patientUuid, data) {
  return requestJson(`${patientsApiUrl}/${patientUuid}`, {
    method: "PATCH",
    body: JSON.stringify({
      data,
      timestamp: Date.now()
    })
  });
}

function estimateWaitMinutes(category, numberRank) {
  const categoryValue = Number.isInteger(category) ? category : 5;
  const rankValue = Number.isInteger(numberRank) && numberRank > 0 ? numberRank : 1;
  const baseByCategory = {
    1: 2,
    2: 6,
    3: 12,
    4: 20,
    5: 30
  };
  const perRankByCategory = {
    1: 3,
    2: 4,
    3: 5,
    4: 6,
    5: 7
  };
  const base = baseByCategory[categoryValue] ?? baseByCategory[5];
  const perRank = perRankByCategory[categoryValue] ?? perRankByCategory[5];
  return base + (rankValue - 1) * perRank;
}

async function fetchEstimatedWaitForPatient(patientUuid) {
  const queuePayload = await requestJson(`${apiBaseUrl}/api/nurses/queue`);
  const queueRows = Array.isArray(queuePayload?.patients) ? queuePayload.patients : [];
  const queueRow = queueRows.find((row) => row?.uuid === patientUuid);
  if (!queueRow) {
    return "Unavailable";
  }
  const minutes = estimateWaitMinutes(queueRow.category, queueRow.number_rank);
  return `${minutes} min`;
}

function buildClinicalSummary(form) {
  return {
    type: "patient_intake",
    areaOfPain: form.areaOfPain,
    painLevel: form.painLevel,
    urgentSymptoms: form.urgentSymptoms,
    medication: form.medication,
    allergies: form.allergies,
    painDuration: form.painDuration,
    hasHadBefore: form.hasHadBefore,
    reason: form.reason,
    updateNote: form.updateNote
  };
}

function buildUpdateSummary(form) {
  return {
    type: "patient_update",
    description: form.updateNote
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function summarizeMedia(files) {
  if (!files.length) {
    return "No files attached";
  }

  return `${files.length} file${files.length === 1 ? "" : "s"} attached`;
}

async function mediaFilesToPayload(files) {
  const items = [];
  for (const file of files) {
    const contentBase64 = await fileToBase64(file);
    items.push({
      contentBase64,
      mimeType: file.type,
      text: `Patient uploaded ${file.name}`
    });
  }
  return items;
}

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [patientUuid, setPatientUuid] = useState("");
  const [mode, setMode] = useState("new");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [estimatedWaitTime, setEstimatedWaitTime] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [debugLogs, setDebugLogs] = useState(() => [
    buildLogEntry("Patient UI loaded", {
      page: window.location.href,
      backendUrl
    })
  ]);

  const isExistingPatient = mode === "update" && patientUuid;

  function addDebugLog(logMessage, detail = {}) {
    console.info(`${DEBUG_PREFIX} ${logMessage}`, detail);
    setDebugLogs((current) => [buildLogEntry(logMessage, detail), ...current].slice(0, 8));
  }

  useEffect(() => {
    let isMounted = true;

    checkPatientSession()
      .then((session) => {
        addDebugLog("Session check finished", session);
        if (!isMounted || !session.hasSession) {
          return;
        }

        setPatientUuid(session.patientUuid);
        setMode("update");
        setMessage("Existing patient session found. Updates will be added to your history.");
      })
      .catch((error) => {
        addDebugLog("Session check failed", {
          message: error.message,
          backendUrl
        });
        if (isMounted) {
          setMessage("");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (status !== "submitted" || !patientUuid) {
      return undefined;
    }

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 8;
    let timeoutId;

    async function resolveEstimatedWait() {
      attempt += 1;
      const estimated = await fetchEstimatedWaitForPatient(patientUuid).catch(() => "Unavailable");
      if (cancelled) {
        return;
      }

      if (estimated && estimated !== "Unavailable") {
        setEstimatedWaitTime(estimated);
        return;
      }

      if (attempt >= maxAttempts) {
        setEstimatedWaitTime("Unavailable");
        return;
      }

      timeoutId = window.setTimeout(resolveEstimatedWait, 1500);
    }

    setEstimatedWaitTime(null);
    void resolveEstimatedWait();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [status, patientUuid]);

  const submitButtonText = useMemo(() => {
    if (status === "submitting") {
      return "Submitting...";
    }

    return isExistingPatient ? "Submit Update" : "Submit";
  }, [isExistingPatient, status]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function clearField(field) {
    updateField(field, "");
  }

  function handleMediaChange(event) {
    setMediaFiles(Array.from(event.target.files || []));
  }

  function handleSpeechToText(fieldName) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatus("error");
      setMessage("Speech to text is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setMessage("Listening...");
    };

    recognition.onerror = () => {
      setIsListening(false);
      setStatus("error");
      setMessage("Could not capture audio. Please try again or type your answer.");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (!transcript) {
        return;
      }

      updateField(fieldName, form[fieldName] ? `${form[fieldName]} ${transcript}` : transcript);
      setStatus("idle");
      setMessage("");
    };

    recognition.start();
  }

  async function submitMedia(patientId) {
    for (const file of mediaFiles) {
      addDebugLog("Uploading media", {
        name: file.name,
        type: file.type,
        size: file.size
      });
      const contentBase64 = await fileToBase64(file);
      await appendPatientHistory(patientId, {
        type: "media",
        contentBase64,
        mimeType: file.type,
        text: `Patient uploaded ${file.name}`
      });
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    addDebugLog("Submit started", {
      mode,
      isExistingPatient: Boolean(isExistingPatient),
      backendUrl,
      mediaCount: mediaFiles.length
    });

    try {
      let activePatientUuid = patientUuid;

      if (!activePatientUuid) {
        const createMedia = await mediaFilesToPayload(mediaFiles);
        const createPayload = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          birthday: form.birthday,
          incident: form.reason,
          notes: form.updateNote || form.reason,
          data: buildClinicalSummary(form),
          media: createMedia
        };

        addDebugLog("Creating patient row", {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          birthday: form.birthday,
          hasIncident: Boolean(createPayload.incident),
          mediaCount: createMedia.length
        });
        const created = await createPatientEntry(createPayload);
        activePatientUuid = created.patientUuid;
        setPatientUuid(activePatientUuid);
        setMode("update");
        addDebugLog("Patient row created", {
          patientUuid: activePatientUuid
        });
      }

      if (isExistingPatient) {
        addDebugLog("Appending patient update JSON", {
          patientUuid: activePatientUuid,
          payloadType: "patient_update"
        });
        await appendPatientHistory(activePatientUuid, buildUpdateSummary(form));
        await submitMedia(activePatientUuid);
      }

      setStatus("submitted");
      addDebugLog("Submit finished", {
        patientUuid: activePatientUuid
      });
      setMessage(
        isExistingPatient
          ? "Your update was added to your medical history."
          : "Your intake was submitted and added to the patient queue."
      );
      setMediaFiles([]);
      updateField("updateNote", "");
    } catch (error) {
      setStatus("error");
      addDebugLog("Submit failed", {
        message: error.message,
        backendUrl,
        page: window.location.href
      });
      setMessage(`Submission failed: ${error.message}. Backend: ${backendUrl}`);
    }
  }

  function handleSubmitAnotherUpdate() {
    setStatus("idle");
    setMode("update");
    setEstimatedWaitTime(null);
    setForm((current) => ({
      ...current,
      reason: "",
      updateNote: ""
    }));
    setMessage("Add any new changes to your condition below.");
  }

  return (
    <main className="patient-page">
      <section className="form-shell" aria-labelledby="patient-form-title">
        <header className="brand-header">
          <div className="brand-title-row">
            <img className="brand-logo" src={acuviaLogo} alt="" aria-hidden="true" />
            <h1 id="patient-form-title">Acuvia</h1>
          </div>
          <p>We care. Let us know how you feel.</p>
        </header>

        {message ? (
          <div className={`status-message ${status === "error" ? "error" : ""}`} role="status">
            {message}
          </div>
        ) : null}

        {status === "submitted" ? (
          <div className="submitted-panel">
            <h2>Thank you.</h2>
            <p>Your care team will see this in the queue.</p>
            {estimatedWaitTime ? (
              <p>Estimated wait time: {estimatedWaitTime}</p>
            ) : (
              <p>Estimated wait time will appear once your queue ranking updates.</p>
            )}
            <button type="button" className="link-button" onClick={handleSubmitAnotherUpdate}>
              Submit an update to your condition
            </button>
          </div>
        ) : null}

        <form className={status === "submitted" ? "hidden-form" : ""} onSubmit={handleSubmit}>
          {isExistingPatient ? (
            <label className="field-label">
              What has changed since your last update?
              <strong>*</strong>
              <button
                type="button"
                className={`microphone-button ${isListening ? "listening" : ""}`}
                onClick={() => handleSpeechToText("updateNote")}
                aria-label="Use microphone for speech to text"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v5c0 1.66 1.34 3 3 3Z" />
                  <path d="M17.3 11c0 2.93-2.38 5.3-5.3 5.3S6.7 13.93 6.7 11H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-1.7Z" />
                </svg>
              </button>
              <textarea
                required
                value={form.updateNote}
                onChange={(event) => updateField("updateNote", event.target.value)}
                placeholder="Describe any changes to your condition."
              />
            </label>
          ) : (
            <>
              <fieldset className="identity-grid">
                <label>
                  First Name <strong>*</strong>
                  <input
                    required
                    value={form.firstName}
                    onChange={(event) => updateField("firstName", event.target.value)}
                    placeholder="First"
                  />
                </label>
                <label>
                  Last Name <strong>*</strong>
                  <input
                    required
                    value={form.lastName}
                    onChange={(event) => updateField("lastName", event.target.value)}
                    placeholder="Last"
                  />
                </label>
                <label>
                  Birthday <strong>*</strong>
                  <input
                    required
                    type="date"
                    value={form.birthday}
                    onChange={(event) => updateField("birthday", event.target.value)}
                  />
                </label>
              </fieldset>

              {selectFields.map((field) => (
                <label className="field-label" key={field.id}>
                  {field.label}
                  <strong>*</strong>
                  <span className="select-wrap">
                    <select
                      required
                      value={form[field.id]}
                      onChange={(event) => updateField(field.id, event.target.value)}
                    >
                      <option value="">Select</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {form[field.id] ? (
                      <button type="button" aria-label={`Clear ${field.label}`} onClick={() => clearField(field.id)}>
                        x
                      </button>
                    ) : null}
                  </span>
                </label>
              ))}

              <fieldset className="radio-group">
                <legend>
                  Duration of Pain <strong>*</strong>
                </legend>
                {durationOptions.map((option) => (
                  <label key={option}>
                    <input
                      required
                      checked={form.painDuration === option}
                      name="painDuration"
                      type="radio"
                      value={option}
                      onChange={(event) => updateField("painDuration", event.target.value)}
                    />
                    {option}
                  </label>
                ))}
              </fieldset>

              <label className="field-label">
                Have you had this before?
                <strong>*</strong>
                <span className="select-wrap">
                  <select
                    required
                    value={form.hasHadBefore}
                    onChange={(event) => updateField("hasHadBefore", event.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                    <option value="Not sure">Not sure</option>
                  </select>
                  {form.hasHadBefore ? (
                    <button type="button" aria-label="Clear Have you had this before" onClick={() => clearField("hasHadBefore")}>
                      x
                    </button>
                  ) : null}
                </span>
              </label>

              <label className="field-label">
                What is the main reason you're here today?
                <strong>*</strong>
                <button
                  type="button"
                  className={`microphone-button ${isListening ? "listening" : ""}`}
                  onClick={() => handleSpeechToText("reason")}
                  aria-label="Use microphone for speech to text"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v5c0 1.66 1.34 3 3 3Z" />
                    <path d="M17.3 11c0 2.93-2.38 5.3-5.3 5.3S6.7 13.93 6.7 11H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-1.7Z" />
                  </svg>
                </button>
                <textarea
                  required
                  value={form.reason}
                  onChange={(event) => updateField("reason", event.target.value)}
                  placeholder="i.e. what type of pain are you feeling?"
                />
              </label>
            </>
          )}

          <label className="field-label">
            Attach photos or videos
            <span className="media-picker">
              <input accept="image/*,video/*" multiple type="file" onChange={handleMediaChange} />
              <span>Choose media</span>
            </span>
            <em>{summarizeMedia(mediaFiles)}</em>
          </label>

          <button className="submit-button" disabled={status === "submitting"} type="submit">
            {submitButtonText}
          </button>
        </form>

        <details className="debug-panel">
          <summary>Submission logs</summary>
          <p>Backend: {backendUrl}</p>
          <ol>
            {debugLogs.map((log) => (
              <li key={log.id}>
                <strong>{log.time}</strong> {log.message}
                <pre>{JSON.stringify(log.detail, null, 2)}</pre>
              </li>
            ))}
          </ol>
        </details>
      </section>
    </main>
  );
}
