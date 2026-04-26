import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

function getHostFromExpoValue(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  const withoutProtocol = value.replace(/^(?:https?|exp):\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0];
  const withoutAuth = withoutPath.split("@").pop();
  return withoutAuth.split(":")[0];
}

function getExpoHostBackendUrl() {
  const hostCandidates = [
    Constants.expoConfig?.hostUri,
    Constants.manifest?.debuggerHost,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    Constants.manifest2?.extra?.expoGo?.debuggerHost
  ];

  for (const candidate of hostCandidates) {
    const host = getHostFromExpoValue(candidate);
    if (host) {
      return `http://${host}:4000`;
    }
  }

  return "http://localhost:4000";
}

function isLoopbackBackendUrl(value) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(value || "");
}

const configuredBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
const detectedBackendUrl = getExpoHostBackendUrl();
const backendUrl =
  configuredBackendUrl && !isLoopbackBackendUrl(configuredBackendUrl)
    ? configuredBackendUrl
    : detectedBackendUrl;
const DEBUG_PREFIX = "[nurse-ui]";
const SEVERITY_FILTER_OPTIONS = ["All", "ESI 1", "ESI 2", "ESI 3", "ESI 4", "ESI 5"];

function categoryToSeverity(category) {
  if (category === 1) return "ESI 1";
  if (category === 2) return "ESI 2";
  if (category === 3) return "ESI 3";
  if (category === 4) return "ESI 4";
  return "ESI 5";
}

function getSeverityTone(category) {
  return severityTones[category] || severityTones[5];
}

async function fetchPatients() {
  const url = `${backendUrl}/api/nurses/queue`;
  console.info(`${DEBUG_PREFIX} queue request:start`, { url });

  try {
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));
    console.info(`${DEBUG_PREFIX} queue request:finish`, {
      status: response.status,
      ok: response.ok,
      patientCount: Array.isArray(body.patients) ? body.patients.length : 0
    });

    if (!response.ok || body.ok === false) {
      throw new Error(body.message || `Queue request failed: ${response.status}`);
    }

    return Array.isArray(body.patients) ? body.patients : [];
  } catch (error) {
    console.error(`${DEBUG_PREFIX} queue request:error`, {
      url,
      message: error.message
    });
    throw new Error(`${error.message}. Backend: ${backendUrl}`);
  }
}

async function fetchPendingUpdates() {
  const response = await fetch(`${backendUrl}/api/nurses/pending-updates`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.message || `Pending updates request failed: ${response.status}`);
  }
  return Array.isArray(body.updates) ? body.updates : [];
}

async function submitUpdateWebhook({ patientUuid, pendingUpdateId, decision }) {
  const response = await fetch(`${backendUrl}/api/nurses/update-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      patientUuid,
      pendingUpdateId,
      decision
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.message || `Update webhook failed: ${response.status}`);
  }
  return body;
}

function formatElapsedSince(timestamp) {
  if (!timestamp) {
    return "--";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) {
    return `${minutes} mins ago`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
}

function calculateWaitMinutes(timestamp) {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function formatAverageWait(minutes) {
  if (minutes == null) {
    return "--";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatBirthday(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function stringFromValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function getFormValue(form, keys) {
  if (!form || typeof form !== "object") {
    return "";
  }
  for (const key of keys) {
    const value = stringFromValue(form[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function getLatestPayload(row) {
  return row.latest_payload && typeof row.latest_payload === "object" ? row.latest_payload : {};
}

function mapQueuePatient(row, index) {
  const latestPayload = getLatestPayload(row);
  const form = latestPayload.form && typeof latestPayload.form === "object" ? latestPayload.form : {};
  const text = stringFromValue(latestPayload.text);
  const description = stringFromValue(row.description) || text || "No description provided";
  const category = Number(row.category) || 5;
  const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Unknown Patient";

  return {
    id: row.uuid,
    category,
    rank: Number(row.number_rank) || index + 1,
    name,
    birthday: formatBirthday(row.birthday),
    description,
    submittedText: text || description,
    createdAt: row.created_at,
    updatedAt: row.latest_payload_updated_at,
    waitTime: formatElapsedSince(row.created_at),
    updateTime: formatElapsedSince(row.latest_payload_updated_at || row.created_at),
    areaOfPain: getFormValue(form, ["areaOfPain", "area", "painArea"]) || inferInjuryTag(description),
    painLevel: getFormValue(form, ["painLevel", "overallPain", "rateOverallPain"]) || "Not specified",
    breathing: getFormValue(form, ["breathing", "redFlags", "troubleBreathing"]) || "Not specified",
    medications: getFormValue(form, ["medications", "medication"]) || "N/A",
    allergies: getFormValue(form, ["allergies", "allergy"]) || "N/A",
    duration: getFormValue(form, ["duration", "durationOfPain"]) || "Not specified",
    hadBefore: getFormValue(form, ["hadBefore", "previouslyHadThis"]) || "Not specified",
    injuryTag: inferInjuryTag(description)
  };
}

function mapPendingUpdate(update, patientsById) {
  const patient = patientsById.get(update.patientUuid);
  const submittedText = stringFromValue(update.text) || "No text provided";
  const inferredDescription = patient?.description || submittedText;
  const currentCategory = Number(update?.patientSnapshot?.currentCategory) || patient?.category || null;
  const currentRank = Number(update?.patientSnapshot?.currentRank) || patient?.rank || null;
  const proposedCategory = Number(update?.proposal?.proposedCategory) || currentCategory || 5;
  const proposedRank = Number(update?.proposal?.proposedRank) || null;
  return {
    id: update.id,
    patientUuid: update.patientUuid,
    category: proposedCategory,
    name: patient?.name || "Unknown Patient",
    injuryTag: inferInjuryTag(inferredDescription),
    submittedText,
    updateTime: formatElapsedSince(update.submittedAt),
    proposedDescription: stringFromValue(update?.proposal?.proposedDescription) || inferredDescription,
    currentCategory,
    currentRank,
    proposedCategory,
    proposedRank
  };
}

function inferInjuryTag(description) {
  const text = String(description || "").toLowerCase();
  if (text.includes("chest") || text.includes("breath") || text.includes("respiratory")) return "Respiratory";
  if (text.includes("allerg") || text.includes("anaphyl")) return "Anaphylaxis";
  if (text.includes("rash") || text.includes("skin")) return "Dermatological";
  if (text.includes("wrist") || text.includes("ankle") || text.includes("fracture") || text.includes("sprain")) return "Orthopedic";
  if (text.includes("abdomen") || text.includes("stomach")) return "Abdominal";
  return "General";
}

function LogoMark() {
  return (
    <View style={styles.logoMark} accessibilityLabel="Acuvia logo">
      <View style={styles.logoPersonLeft}>
        <View style={styles.logoHeadLeft} />
        <View style={styles.logoBodyLeft} />
      </View>
      <View style={styles.logoHeart}>
        <View style={styles.logoHeartDotLeft} />
        <View style={styles.logoHeartDotRight} />
        <View style={styles.logoHeartBase} />
      </View>
      <View style={styles.logoPersonRight}>
        <View style={styles.logoHeadRight} />
        <View style={styles.logoBodyRight} />
      </View>
    </View>
  );
}

function SeverityBadge({ category, compact = false }) {
  const tone = getSeverityTone(category);
  return (
    <View style={[styles.severityBadge, compact && styles.severityBadgeCompact, { backgroundColor: tone.bg }]}>
      <Text style={[styles.severityText, compact && styles.severityTextCompact, { color: tone.fg }]}>
        {categoryToSeverity(category)}
      </Text>
    </View>
  );
}

function MagnifierIcon() {
  return (
    <View style={styles.magnifierIcon}>
      <View style={styles.magnifierCircle} />
      <View style={styles.magnifierHandle} />
    </View>
  );
}

function FilterPill({ label, active, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.filterPill, active && styles.filterPillActive]}>
      <Text style={styles.filterText}>{label}</Text>
      <View style={styles.filterChevronIcon} />
    </Pressable>
  );
}

function SearchButton({ active, onPress }) {
  return (
    <Pressable
      accessibilityLabel="Search patients"
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.searchButton, active && styles.searchButtonActive]}
    >
      <MagnifierIcon />
    </Pressable>
  );
}

function PatientDetail({ patient }) {
  if (!patient) {
    return (
      <View style={[styles.detailPanel, styles.emptyDetailPanel]}>
        <Text style={styles.emptyTitle}>No patients in queue</Text>
        <Text style={styles.emptyText}>New patient submissions will appear here automatically.</Text>
      </View>
    );
  }

  const detailItems = [
    ["Area of Pain", patient.areaOfPain],
    ["Rate Overall Pain", patient.painLevel],
    ["Duration of Pain", patient.duration],
    ["Are you on any medication? If not, N/A", patient.medications],
    ["Do you have any allergies? If not, N/A", patient.allergies],
    ["Have you had this before?", patient.hadBefore],
    ["Any trouble breathing, chest pain, or feel like you might pass out?", patient.breathing]
  ];

  return (
    <View style={styles.detailPanel}>
      <View style={styles.detailHeader}>
        <View style={styles.detailIdentity}>
          <Text style={styles.detailName}>{patient.name}</Text>
          <View>
            <Text style={styles.detailMetaLabel}>Date of Birth</Text>
            <Text style={styles.detailMetaValue}>{patient.birthday}</Text>
          </View>
        </View>
        <SeverityBadge category={patient.category} />
      </View>

      <View style={styles.intakeGrid}>
        {detailItems.map(([label, value]) => (
          <View key={label} style={styles.intakeItem}>
            <Text style={styles.intakeLabel}>{label}</Text>
            <Text style={styles.intakeValue}>{value}</Text>
          </View>
        ))}
        <View style={[styles.intakeItem, styles.reasonItem]}>
          <Text style={styles.intakeLabel}>What is the main reason you're here today?</Text>
          <Text style={styles.intakeValue}>{patient.submittedText}</Text>
        </View>
      </View>
    </View>
  );
}

function QueueCard({ patient, selected, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(patient)}
      style={[styles.queueCard, selected && styles.queueCardSelected]}
    >
      <View style={styles.cardTopLine}>
        <View style={styles.patientNameLine}>
          <Text style={styles.rankText}>#{patient.rank}</Text>
          <Text style={styles.queueName}>{patient.name}</Text>
          {patient.category <= 2 ? <View style={styles.alertDot} /> : null}
          <View style={styles.injuryPill}>
            <Text style={styles.injuryPillText}>{patient.injuryTag}</Text>
          </View>
        </View>
        <SeverityBadge category={patient.category} compact />
      </View>
      <Text style={styles.queueDescription} numberOfLines={2}>
        {patient.description}
      </Text>
      <View style={styles.queueFooter}>
        <Text style={styles.timeText}>{patient.waitTime}</Text>
        <View style={styles.attendButton}>
          <Text style={styles.attendButtonText}>Attend Patient</Text>
        </View>
      </View>
    </Pressable>
  );
}

function UpdateCard({ patient, pendingAction, onApprove, onReject }) {
  const actionInProgress = Boolean(pendingAction);
  const categoryChangeLabel =
    patient.currentCategory && patient.proposedCategory
      ? `${categoryToSeverity(patient.currentCategory)} -> ${categoryToSeverity(patient.proposedCategory)}`
      : "No category proposal";
  const rankChangeLabel =
    patient.currentRank && patient.proposedRank
      ? `#${patient.currentRank} -> #${patient.proposedRank}`
      : patient.proposedRank
        ? `-> #${patient.proposedRank}`
        : "No rank proposal";
  return (
    <View style={styles.updateCard}>
      <View style={styles.updateMain}>
        <Text style={styles.updateName}>{patient.name}</Text>
        <View style={styles.injuryPill}>
          <Text style={styles.injuryPillText}>{patient.injuryTag}</Text>
        </View>
      </View>
      <Text style={styles.queueDescription} numberOfLines={2}>
        {patient.proposedDescription}
      </Text>
      <Text style={styles.proposalText}>{categoryChangeLabel}</Text>
      <Text style={styles.proposalText}>{rankChangeLabel}</Text>
      <View style={styles.updateFooter}>
        <Text style={styles.timeText}>{patient.updateTime}</Text>
        <View style={styles.updateActions}>
          <Pressable
            accessibilityRole="button"
            disabled={actionInProgress}
            onPress={() => onApprove(patient)}
            style={[styles.updateActionButton, styles.acceptButton, actionInProgress && styles.updateActionButtonDisabled]}
          >
            <Text style={styles.acceptText}>OK</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={actionInProgress}
            onPress={() => onReject(patient)}
            style={[styles.updateActionButton, styles.dismissButton, actionInProgress && styles.updateActionButtonDisabled]}
          >
            <Text style={styles.dismissText}>X</Text>
          </Pressable>
          <SeverityBadge category={patient.category} compact />
        </View>
      </View>
    </View>
  );
}

function FilterDropdown({ title, options, selectedValue, visible, onClose, onSelect }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable style={styles.dropdownBackdrop} onPress={onClose}>
        <Pressable style={styles.dropdownCard}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.dropdownCloseButton}>
              <Text style={styles.dropdownCloseText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.dropdownOptions}>
            {options.map((option) => {
              const isSelected = option === selectedValue;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={option}
                  onPress={() => {
                    onSelect(option);
                    onClose();
                  }}
                  style={[styles.dropdownOption, isSelected && styles.dropdownOptionSelected]}
                >
                  <Text style={[styles.dropdownOptionText, isSelected && styles.dropdownOptionTextSelected]}>
                    {option === "All" ? `All ${title.toLowerCase()}` : option}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function App() {
  const [patients, setPatients] = useState([]);
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [isPatientModalVisible, setIsPatientModalVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [injuryFilter, setInjuryFilter] = useState("All");
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [pendingUpdateActionByPayloadId, setPendingUpdateActionByPayloadId] = useState({});

  const loadPatients = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) {
      setIsRefreshing(true);
    }
    try {
      const [queueRows, pendingRows] = await Promise.all([fetchPatients(), fetchPendingUpdates()]);
      const mappedPatients = queueRows.map(mapQueuePatient);
      const patientsById = new Map(mappedPatients.map((patient) => [patient.id, patient]));
      const mappedPendingUpdates = pendingRows.map((update) => mapPendingUpdate(update, patientsById));
      setPatients(mappedPatients);
      setPendingUpdates(mappedPendingUpdates);
      setQueueError("");
      setSelectedPatientId((currentId) => {
        if (currentId && mappedPatients.some((patient) => patient.id === currentId)) {
          return currentId;
        }
        setIsPatientModalVisible(false);
        return "";
      });
    } catch (error) {
      setQueueError(error.message || "Failed to load queue");
    } finally {
      if (showLoading) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadPatients({ showLoading: true });
    const intervalId = setInterval(() => {
      loadPatients({ showLoading: false });
    }, 5000);
    return () => clearInterval(intervalId);
  }, [loadPatients]);

  const selectedPatient = useMemo(() => {
    return patients.find((patient) => patient.id === selectedPatientId) || null;
  }, [patients, selectedPatientId]);

  const criticalCount = patients.filter((patient) => patient.category === 1).length;
  const averageWaitMinutes = useMemo(() => {
    const waits = patients
      .map((patient) => calculateWaitMinutes(patient.createdAt))
      .filter((minutes) => Number.isFinite(minutes));
    if (waits.length === 0) {
      return null;
    }
    return Math.round(waits.reduce((total, minutes) => total + minutes, 0) / waits.length);
  }, [patients]);
  const injuryFilterOptions = useMemo(() => {
    return ["All", ...Array.from(new Set(patients.map((patient) => patient.injuryTag))).sort()];
  }, [patients]);

  useEffect(() => {
    if (!injuryFilterOptions.includes(injuryFilter)) {
      setInjuryFilter("All");
    }
  }, [injuryFilter, injuryFilterOptions]);

  const filteredPatients = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return patients.filter((patient) => {
      const matchesSearch =
        !normalizedQuery ||
        patient.name.toLowerCase().includes(normalizedQuery) ||
        patient.description.toLowerCase().includes(normalizedQuery) ||
        patient.injuryTag.toLowerCase().includes(normalizedQuery);
      const matchesSeverity =
        severityFilter === "All" || categoryToSeverity(patient.category) === severityFilter;
      const matchesInjury = injuryFilter === "All" || patient.injuryTag === injuryFilter;
      return matchesSearch && matchesSeverity && matchesInjury;
    });
  }, [injuryFilter, patients, searchQuery, severityFilter]);
  const updates = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return pendingUpdates.filter((update) => {
      const matchesSearch =
        !normalizedQuery ||
        update.name.toLowerCase().includes(normalizedQuery) ||
        update.submittedText.toLowerCase().includes(normalizedQuery) ||
        update.injuryTag.toLowerCase().includes(normalizedQuery);
      const matchesSeverity =
        severityFilter === "All" || categoryToSeverity(update.category) === severityFilter;
      const matchesInjury = injuryFilter === "All" || update.injuryTag === injuryFilter;
      return matchesSearch && matchesSeverity && matchesInjury;
    }).slice(0, 6);
  }, [injuryFilter, pendingUpdates, searchQuery, severityFilter]);

  const handleUpdateDecision = useCallback(async (patient, decision) => {
    if (!patient?.patientUuid || !patient?.id) {
      return;
    }

    const payloadKey = String(patient.id);
    setPendingUpdateActionByPayloadId((current) => ({
      ...current,
      [payloadKey]: decision
    }));

    try {
      await submitUpdateWebhook({
        patientUuid: patient.patientUuid,
        pendingUpdateId: patient.id,
        decision
      });
      await loadPatients({ showLoading: false });
    } catch (error) {
      setQueueError(error.message || "Failed to process patient update");
    } finally {
      setPendingUpdateActionByPayloadId((current) => {
        const next = { ...current };
        delete next[payloadKey];
        return next;
      });
    }
  }, [loadPatients]);

  function toggleSearch() {
    setIsSearchVisible((isVisible) => {
      const nextValue = !isVisible;
      if (!nextValue) {
        setSearchQuery("");
      }
      return nextValue;
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <LogoMark />
            <Text style={styles.brandText}>ACUVIA</Text>
            <Text style={styles.roleText}>NURSE</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => loadPatients({ showLoading: true })}
            style={styles.avatarButton}
          >
            {isRefreshing ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.avatarText}>RC</Text>}
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{patients.length}</Text>
            <Text style={styles.statLabel}>PATIENTS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{criticalCount}</Text>
            <Text style={styles.statLabel}>CRITICAL</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{isRefreshing ? "..." : formatAverageWait(averageWaitMinutes)}</Text>
            <Text style={styles.statLabel}>AVG WAIT</Text>
          </View>
        </View>

        {queueError ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{queueError}</Text>
          </View>
        ) : null}

        {isSearchVisible ? (
          <View style={styles.searchPanel}>
            <MagnifierIcon />
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={setSearchQuery}
              placeholder="Search patient name, injury, or note"
              placeholderTextColor="#8a8a8a"
              style={styles.searchInput}
              value={searchQuery}
            />
            {searchQuery ? (
              <Pressable accessibilityRole="button" onPress={() => setSearchQuery("")} style={styles.clearSearchButton}>
                <Text style={styles.clearSearchText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.columns}>
          <View style={styles.column}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>PRIORITY QUEUE</Text>
              <View style={styles.filters}>
                <SearchButton active={isSearchVisible} onPress={toggleSearch} />
                <FilterPill
                  active={severityFilter !== "All"}
                  label={severityFilter === "All" ? "Severity" : severityFilter}
                  onPress={() => setActiveDropdown("severity")}
                />
                <FilterPill
                  active={injuryFilter !== "All"}
                  label={injuryFilter === "All" ? "Injury Type" : injuryFilter}
                  onPress={() => setActiveDropdown("injury")}
                />
              </View>
            </View>
            <View style={styles.cardStack}>
              {filteredPatients.map((patient) => (
                <QueueCard
                  key={patient.id}
                  patient={patient}
                  selected={patient.id === selectedPatientId}
                  onPress={(nextPatient) => {
                    setSelectedPatientId(nextPatient.id);
                    setIsPatientModalVisible(true);
                  }}
                />
              ))}
              {filteredPatients.length === 0 ? (
                <View style={styles.emptyQueueCard}>
                  <Text style={styles.emptyQueueTitle}>No matching patients</Text>
                  <Text style={styles.emptyQueueText}>Adjust search, severity, or injury type.</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.column}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>PATIENT UPDATES</Text>
              <View style={styles.filters}>
                <SearchButton active={isSearchVisible} onPress={toggleSearch} />
                <FilterPill
                  active={severityFilter !== "All"}
                  label={severityFilter === "All" ? "Severity" : severityFilter}
                  onPress={() => setActiveDropdown("severity")}
                />
                <FilterPill
                  active={injuryFilter !== "All"}
                  label={injuryFilter === "All" ? "Injury Type" : injuryFilter}
                  onPress={() => setActiveDropdown("injury")}
                />
              </View>
            </View>
            <View style={styles.cardStack}>
              {updates.map((patient) => (
                <UpdateCard
                  key={patient.id}
                  patient={patient}
                  pendingAction={pendingUpdateActionByPayloadId[String(patient.id)]}
                  onApprove={(nextPatient) => handleUpdateDecision(nextPatient, "approve")}
                  onReject={(nextPatient) => handleUpdateDecision(nextPatient, "reject")}
                />
              ))}
              {updates.length === 0 ? (
                <View style={styles.emptyQueueCard}>
                  <Text style={styles.emptyQueueTitle}>No pending updates</Text>
                  <Text style={styles.emptyQueueText}>Patient updates needing review will appear here.</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsPatientModalVisible(false)}
        transparent
        visible={isPatientModalVisible && Boolean(selectedPatient)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsPatientModalVisible(false)}>
          <Pressable style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Patient Details</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsPatientModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView>
              <PatientDetail patient={selectedPatient} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <FilterDropdown
        onClose={() => setActiveDropdown(null)}
        onSelect={setSeverityFilter}
        options={SEVERITY_FILTER_OPTIONS}
        selectedValue={severityFilter}
        title="Severity"
        visible={activeDropdown === "severity"}
      />
      <FilterDropdown
        onClose={() => setActiveDropdown(null)}
        onSelect={setInjuryFilter}
        options={injuryFilterOptions}
        selectedValue={injuryFilter}
        title="Injury Type"
        visible={activeDropdown === "injury"}
      />
    </SafeAreaView>
  );
}

const severityTones = {
  1: { bg: "#f3b0a6", fg: "#d34725" },
  2: { bg: "#fde1a9", fg: "#e4a424" },
  3: { bg: "#f7df9a", fg: "#e4bc37" },
  4: { bg: "#edf1a3", fg: "#d0c638" },
  5: { bg: "#b7d2a2", fg: "#52771e" }
};

const fontFamily = "System";

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8f8f8"
  },
  page: {
    gap: 16,
    minHeight: "100%",
    padding: 24
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  logoMark: {
    flexDirection: "row",
    height: 36,
    width: 44
  },
  logoPersonLeft: {
    height: 32,
    marginTop: 2,
    position: "relative",
    width: 13
  },
  logoHeadLeft: {
    backgroundColor: "#0045d0",
    borderRadius: 7,
    height: 13,
    left: 1,
    position: "absolute",
    top: 0,
    width: 11
  },
  logoBodyLeft: {
    backgroundColor: "#0045d0",
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    height: 22,
    left: 0,
    position: "absolute",
    top: 10,
    width: 13
  },
  logoHeart: {
    height: 19,
    marginHorizontal: 2,
    marginTop: 14,
    position: "relative",
    width: 15
  },
  logoHeartDotLeft: {
    backgroundColor: "#0045d0",
    borderRadius: 5,
    height: 10,
    left: 1,
    position: "absolute",
    top: 0,
    width: 9
  },
  logoHeartDotRight: {
    backgroundColor: "#0045d0",
    borderRadius: 5,
    height: 10,
    position: "absolute",
    right: 1,
    top: 0,
    width: 9
  },
  logoHeartBase: {
    backgroundColor: "#0045d0",
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    height: 14,
    left: 2,
    position: "absolute",
    top: 5,
    transform: [{ rotate: "45deg" }],
    width: 11
  },
  logoPersonRight: {
    height: 32,
    marginTop: 2,
    position: "relative",
    width: 14
  },
  logoHeadRight: {
    backgroundColor: "#83abfb",
    borderRadius: 7,
    height: 13,
    left: 1,
    position: "absolute",
    top: 0,
    width: 12
  },
  logoBodyRight: {
    backgroundColor: "#83abfb",
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    height: 22,
    left: 0,
    position: "absolute",
    top: 10,
    width: 14
  },
  brandText: {
    color: "#0045d0",
    fontFamily,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 0
  },
  roleText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 18,
    fontWeight: "800",
    marginLeft: 4,
    marginTop: 12
  },
  avatarButton: {
    alignItems: "center",
    backgroundColor: "#0045d0",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  avatarText: {
    color: "#ffffff",
    fontFamily,
    fontSize: 16,
    fontWeight: "600"
  },
  statsRow: {
    flexDirection: "row",
    gap: 24
  },
  statCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  statValue: {
    color: "#000000",
    fontFamily,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 28
  },
  statLabel: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 15
  },
  errorPanel: {
    backgroundColor: "#ffe1df",
    borderColor: "#f3b2ad",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  errorText: {
    color: "#9d241b",
    fontFamily,
    fontSize: 15,
    fontWeight: "700"
  },
  detailPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    paddingHorizontal: 28,
    paddingVertical: 24
  },
  emptyDetailPanel: {
    minHeight: 170
  },
  emptyTitle: {
    color: "#151515",
    fontFamily,
    fontSize: 28,
    fontWeight: "800"
  },
  emptyText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 14,
    marginTop: 4
  },
  detailHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  detailIdentity: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18
  },
  detailName: {
    color: "#151515",
    fontFamily,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 40
  },
  detailMetaLabel: {
    color: "#8a8a8a",
    fontFamily,
    fontSize: 13,
    lineHeight: 15
  },
  detailMetaValue: {
    color: "#8a8a8a",
    fontFamily,
    fontSize: 13,
    lineHeight: 15
  },
  severityBadge: {
    alignItems: "center",
    borderRadius: 6,
    justifyContent: "center",
    minWidth: 52,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  severityBadgeCompact: {
    minWidth: 40,
    paddingHorizontal: 7,
    paddingVertical: 4
  },
  severityText: {
    fontFamily,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 18
  },
  severityTextCompact: {
    fontSize: 13,
    lineHeight: 15
  },
  intakeGrid: {
    columnGap: 28,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12
  },
  intakeItem: {
    width: "22%"
  },
  reasonItem: {
    flexGrow: 1,
    width: "46%"
  },
  intakeLabel: {
    color: "#000000",
    fontFamily,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 20
  },
  intakeValue: {
    color: "#151515",
    fontFamily,
    fontSize: 15,
    lineHeight: 19,
    marginTop: 2
  },
  columns: {
    flexDirection: "row",
    gap: 18
  },
  column: {
    flex: 1
  },
  divider: {
    backgroundColor: "#d9d9d9",
    borderRadius: 4,
    width: 2
  },
  sectionHeader: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 20
  },
  sectionTitle: {
    color: "#000000",
    fontFamily,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0
  },
  filters: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  searchButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 4,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 32
  },
  searchButtonActive: {
    borderColor: "#0045d0"
  },
  magnifierIcon: {
    height: 16,
    position: "relative",
    width: 16
  },
  magnifierCircle: {
    borderColor: "#5a5a5a",
    borderRadius: 6,
    borderWidth: 2,
    height: 11,
    left: 1,
    position: "absolute",
    top: 1,
    width: 11
  },
  magnifierHandle: {
    backgroundColor: "#5a5a5a",
    borderRadius: 2,
    height: 7,
    position: "absolute",
    right: 1,
    top: 10,
    transform: [{ rotate: "-45deg" }],
    width: 2
  },
  searchPanel: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14
  },
  searchInput: {
    color: "#151515",
    flex: 1,
    fontFamily,
    fontSize: 17,
    fontWeight: "500",
    minHeight: 44
  },
  clearSearchButton: {
    alignItems: "center",
    backgroundColor: "rgba(138, 138, 138, 0.14)",
    borderColor: "rgba(138, 138, 138, 0.35)",
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  clearSearchText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 13,
    fontWeight: "800"
  },
  filterPill: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    height: 28,
    justifyContent: "center",
    minWidth: 23,
    paddingHorizontal: 8
  },
  filterPillActive: {
    borderColor: "#0045d0"
  },
  filterText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 12,
    lineHeight: 14
  },
  filterChevronIcon: {
    borderBottomColor: "#5a5a5a",
    borderBottomWidth: 2,
    borderRightColor: "#5a5a5a",
    borderRightWidth: 2,
    height: 7,
    marginLeft: 8,
    marginTop: -3,
    transform: [{ rotate: "45deg" }],
    width: 7
  },
  cardStack: {
    gap: 8,
    marginTop: 8
  },
  emptyQueueCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 18
  },
  emptyQueueTitle: {
    color: "#151515",
    fontFamily,
    fontSize: 18,
    fontWeight: "800"
  },
  emptyQueueText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 14,
    fontWeight: "500"
  },
  queueCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 126,
    paddingHorizontal: 20,
    paddingVertical: 16
  },
  queueCardSelected: {
    borderColor: "#cbd9ff"
  },
  cardTopLine: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  patientNameLine: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 7
  },
  rankText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 13,
    fontWeight: "600"
  },
  queueName: {
    color: "#151515",
    flexShrink: 1,
    fontFamily,
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 27
  },
  alertDot: {
    backgroundColor: "#ed522c",
    borderRadius: 3,
    height: 5,
    width: 5
  },
  injuryPill: {
    backgroundColor: "#eaeaea",
    borderRadius: 5,
    paddingHorizontal: 9,
    paddingVertical: 2
  },
  injuryPillText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 15
  },
  queueDescription: {
    color: "#151515",
    fontFamily,
    fontSize: 16,
    lineHeight: 21,
    marginTop: 8
  },
  proposalText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 13,
    lineHeight: 16,
    marginTop: 4
  },
  queueFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16
  },
  timeText: {
    color: "#8a8a8a",
    fontFamily,
    fontSize: 13,
    lineHeight: 16
  },
  attendButton: {
    alignItems: "center",
    backgroundColor: "rgba(138, 138, 138, 0.2)",
    borderColor: "rgba(138, 138, 138, 0.5)",
    borderRadius: 4,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  attendButtonText: {
    color: "#8a8a8a",
    fontFamily,
    fontSize: 12,
    fontWeight: "600"
  },
  updateCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 126,
    paddingHorizontal: 22,
    paddingVertical: 16
  },
  updateMain: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  updateName: {
    color: "#151515",
    fontFamily,
    fontSize: 23,
    fontWeight: "600",
    lineHeight: 27
  },
  updateFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16
  },
  updateActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  updateActionButton: {
    alignItems: "center",
    borderRadius: 4,
    borderWidth: 1,
    height: 26,
    justifyContent: "center",
    width: 44
  },
  updateActionButtonDisabled: {
    opacity: 0.45
  },
  acceptButton: {
    backgroundColor: "rgba(137, 183, 72, 0.2)",
    borderColor: "rgba(137, 183, 72, 0.5)"
  },
  dismissButton: {
    backgroundColor: "rgba(237, 82, 44, 0.2)",
    borderColor: "rgba(237, 82, 44, 0.5)"
  },
  acceptText: {
    color: "#52771e",
    fontFamily,
    fontSize: 15,
    fontWeight: "700"
  },
  dismissText: {
    color: "#ed522c",
    fontFamily,
    fontSize: 15,
    fontWeight: "700"
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    flex: 1,
    justifyContent: "center",
    padding: 28
  },
  modalCard: {
    backgroundColor: "#f8f8f8",
    borderColor: "#e7e7e7",
    borderRadius: 10,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 980,
    padding: 16,
    width: "92%"
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  modalTitle: {
    color: "#151515",
    fontFamily,
    fontSize: 22,
    fontWeight: "800"
  },
  modalCloseButton: {
    alignItems: "center",
    backgroundColor: "#0045d0",
    borderRadius: 8,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 16
  },
  modalCloseText: {
    color: "#ffffff",
    fontFamily,
    fontSize: 15,
    fontWeight: "800"
  },
  dropdownBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.16)",
    flex: 1,
    justifyContent: "center",
    padding: 28
  },
  dropdownCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: "72%",
    minWidth: 320,
    padding: 14
  },
  dropdownHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10
  },
  dropdownTitle: {
    color: "#151515",
    fontFamily,
    fontSize: 20,
    fontWeight: "900"
  },
  dropdownCloseButton: {
    alignItems: "center",
    backgroundColor: "rgba(138, 138, 138, 0.14)",
    borderColor: "rgba(138, 138, 138, 0.35)",
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  dropdownCloseText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 13,
    fontWeight: "800"
  },
  dropdownOptions: {
    gap: 8
  },
  dropdownOption: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  dropdownOptionSelected: {
    backgroundColor: "#eef4ff",
    borderColor: "#0045d0"
  },
  dropdownOptionText: {
    color: "#151515",
    fontFamily,
    fontSize: 16,
    fontWeight: "700"
  },
  dropdownOptionTextSelected: {
    color: "#0045d0"
  }
});
