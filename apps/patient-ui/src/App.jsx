import { useEffect, useMemo, useState } from "react";
import "./App.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const patientsApiUrl = `${backendUrl}/api/patients`;

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
    options: ["Head", "Chest", "Abdomen", "Back", "Arm or Hand", "Leg or Foot", "Other"]
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
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Request failed");
  }

  return payload;
}

async function checkPatientSession() {
  return requestJson(`${patientsApiUrl}/session`);
}

async function createPatientEntry({ firstName, lastName, birthday }) {
  return requestJson(patientsApiUrl, {
    method: "POST",
    body: JSON.stringify({ firstName, lastName, birthday })
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

function buildClinicalSummary(form) {
  return {
    type: "text",
    text: JSON.stringify(
      {
        areaOfPain: form.areaOfPain,
        painLevel: form.painLevel,
        urgentSymptoms: form.urgentSymptoms,
        medication: form.medication,
        allergies: form.allergies,
        painDuration: form.painDuration,
        hasHadBefore: form.hasHadBefore,
        reason: form.reason,
        updateNote: form.updateNote
      },
      null,
      2
    )
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

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [patientUuid, setPatientUuid] = useState("");
  const [mode, setMode] = useState("new");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const isExistingPatient = mode === "update" && patientUuid;

  useEffect(() => {
    let isMounted = true;

    checkPatientSession()
      .then((session) => {
        if (!isMounted || !session.hasSession) {
          return;
        }

        setPatientUuid(session.patientUuid);
        setMode("update");
        setMessage("Existing patient session found. Updates will be added to your history.");
      })
      .catch(() => {
        if (isMounted) {
          setMessage("");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

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

  async function submitMedia(patientId) {
    for (const file of mediaFiles) {
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

    try {
      let activePatientUuid = patientUuid;

      if (!activePatientUuid) {
        const created = await createPatientEntry({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          birthday: form.birthday
        });
        activePatientUuid = created.patientUuid;
        setPatientUuid(activePatientUuid);
        setMode("update");
      }

      await appendPatientHistory(activePatientUuid, buildClinicalSummary(form));
      await submitMedia(activePatientUuid);

      setStatus("submitted");
      setMessage(
        isExistingPatient
          ? "Your update was added to your medical history."
          : "Your intake was submitted and added to the patient queue."
      );
      setMediaFiles([]);
      updateField("updateNote", "");
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  function handleSubmitAnotherUpdate() {
    setStatus("idle");
    setMode("update");
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
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <i />
          </div>
          <div>
            <h1 id="patient-form-title">Acuvia</h1>
            <p>We care. Let us know how you feel.</p>
          </div>
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
            <button type="button" className="link-button" onClick={handleSubmitAnotherUpdate}>
              Submit an update to your condition
            </button>
          </div>
        ) : null}

        <form className={status === "submitted" ? "hidden-form" : ""} onSubmit={handleSubmit}>
          {!isExistingPatient ? (
            <fieldset className="identity-grid">
              <legend>Patient Information</legend>
              <label>
                First Name <strong>*</strong>
                <input
                  required
                  value={form.firstName}
                  onChange={(event) => updateField("firstName", event.target.value)}
                  placeholder="First name"
                />
              </label>
              <label>
                Last Name <strong>*</strong>
                <input
                  required
                  value={form.lastName}
                  onChange={(event) => updateField("lastName", event.target.value)}
                  placeholder="Last name"
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
          ) : null}

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
            What is the main reason you are here today?
            <strong>*</strong>
            <span className="voice-indicator" aria-hidden="true">
              mic
            </span>
            <textarea
              required
              value={form.reason}
              onChange={(event) => updateField("reason", event.target.value)}
              placeholder="i.e. what type of pain are you feeling?"
            />
          </label>

          {isExistingPatient ? (
            <label className="field-label">
              What has changed since your last update?
              <textarea
                value={form.updateNote}
                onChange={(event) => updateField("updateNote", event.target.value)}
                placeholder="Describe any changes to your condition."
              />
            </label>
          ) : null}

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
      </section>
    </main>
  );
}
