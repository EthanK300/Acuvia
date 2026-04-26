import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
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
    injuryTag: inferInjuryTag(description),
    hasUpdate: Boolean(row.latest_payload_updated_at)
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

function FilterPill({ label, icon }) {
  return (
    <View style={styles.filterPill}>
      {icon ? <Text style={styles.filterIcon}>{icon}</Text> : null}
      <Text style={styles.filterText}>{label}</Text>
      {!icon ? <Text style={styles.filterChevron}>v</Text> : null}
    </View>
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

function UpdateCard({ patient }) {
  return (
    <View style={styles.updateCard}>
      <View style={styles.updateMain}>
        <Text style={styles.updateName}>{patient.name}</Text>
        <View style={styles.injuryPill}>
          <Text style={styles.injuryPillText}>{patient.injuryTag}</Text>
        </View>
      </View>
      <Text style={styles.queueDescription} numberOfLines={2}>
        {patient.submittedText}
      </Text>
      <View style={styles.updateFooter}>
        <Text style={styles.timeText}>{patient.updateTime}</Text>
        <View style={styles.updateActions}>
          <Pressable accessibilityRole="button" style={[styles.updateActionButton, styles.acceptButton]}>
            <Text style={styles.acceptText}>OK</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.updateActionButton, styles.dismissButton]}>
            <Text style={styles.dismissText}>X</Text>
          </Pressable>
          <SeverityBadge category={patient.category} compact />
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [queueError, setQueueError] = useState("");

  const loadPatients = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const queueRows = await fetchPatients();
      const mappedPatients = queueRows.map(mapQueuePatient);
      setPatients(mappedPatients);
      setQueueError("");
      setSelectedPatientId((currentId) => {
        if (currentId && mappedPatients.some((patient) => patient.id === currentId)) {
          return currentId;
        }
        return mappedPatients[0]?.id || "";
      });
    } catch (error) {
      setQueueError(error.message || "Failed to load queue");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPatients();
    const intervalId = setInterval(loadPatients, 5000);
    return () => clearInterval(intervalId);
  }, [loadPatients]);

  const selectedPatient = useMemo(() => {
    return patients.find((patient) => patient.id === selectedPatientId) || patients[0] || null;
  }, [patients, selectedPatientId]);

  const criticalCount = patients.filter((patient) => patient.category === 1).length;
  const updates = patients.filter((patient) => patient.hasUpdate).slice(0, 6);

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
          <Pressable accessibilityRole="button" onPress={loadPatients} style={styles.avatarButton}>
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
            <Text style={styles.statValue}>{isRefreshing ? "..." : "LIVE"}</Text>
            <Text style={styles.statLabel}>QUEUE</Text>
          </View>
        </View>

        {queueError ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{queueError}</Text>
          </View>
        ) : null}

        <PatientDetail patient={selectedPatient} />

        <View style={styles.columns}>
          <View style={styles.column}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>PRIORITY QUEUE</Text>
              <View style={styles.filters}>
                <FilterPill icon="S" label="" />
                <FilterPill label="Severity" />
                <FilterPill label="Injury Type" />
              </View>
            </View>
            <View style={styles.cardStack}>
              {patients.map((patient) => (
                <QueueCard
                  key={patient.id}
                  patient={patient}
                  selected={patient.id === selectedPatient?.id}
                  onPress={(nextPatient) => setSelectedPatientId(nextPatient.id)}
                />
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.column}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>PATIENT UPDATES</Text>
              <View style={styles.filters}>
                <FilterPill icon="S" label="" />
                <FilterPill label="Severity" />
                <FilterPill label="Injury Type" />
              </View>
            </View>
            <View style={styles.cardStack}>
              {(updates.length ? updates : patients.slice(0, 3)).map((patient) => (
                <UpdateCard key={patient.id} patient={patient} />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
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
    gap: 14,
    minHeight: "100%",
    padding: 28
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
    fontSize: 14,
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
    fontSize: 14,
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
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  statValue: {
    color: "#000000",
    fontFamily,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 22
  },
  statLabel: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12
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
    fontSize: 12,
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
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 36
  },
  detailMetaLabel: {
    color: "#8a8a8a",
    fontFamily,
    fontSize: 10,
    lineHeight: 12
  },
  detailMetaValue: {
    color: "#8a8a8a",
    fontFamily,
    fontSize: 10,
    lineHeight: 12
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
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 15
  },
  severityTextCompact: {
    fontSize: 10,
    lineHeight: 12
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
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 17
  },
  intakeValue: {
    color: "#151515",
    fontFamily,
    fontSize: 12,
    lineHeight: 15,
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
    minHeight: 38,
    paddingHorizontal: 20
  },
  sectionTitle: {
    color: "#000000",
    fontFamily,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0
  },
  filters: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  filterPill: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    height: 22,
    justifyContent: "center",
    minWidth: 23,
    paddingHorizontal: 8
  },
  filterIcon: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 11
  },
  filterText: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 10,
    lineHeight: 12
  },
  filterChevron: {
    color: "#5a5a5a",
    fontFamily,
    fontSize: 10,
    marginLeft: 6
  },
  cardStack: {
    gap: 5,
    marginTop: 5
  },
  queueCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 104,
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
    fontSize: 10,
    fontWeight: "600"
  },
  queueName: {
    color: "#151515",
    flexShrink: 1,
    fontFamily,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22
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
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 13
  },
  queueDescription: {
    color: "#151515",
    fontFamily,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 8
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
    fontSize: 10,
    lineHeight: 14
  },
  attendButton: {
    alignItems: "center",
    backgroundColor: "rgba(138, 138, 138, 0.2)",
    borderColor: "rgba(138, 138, 138, 0.5)",
    borderRadius: 4,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  attendButtonText: {
    color: "#8a8a8a",
    fontFamily,
    fontSize: 10,
    fontWeight: "600"
  },
  updateCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e7e7e7",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 104,
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
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 22
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
    height: 18,
    justifyContent: "center",
    width: 36
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
    fontSize: 13,
    fontWeight: "700"
  },
  dismissText: {
    color: "#ed522c",
    fontFamily,
    fontSize: 13,
    fontWeight: "700"
  }
});
