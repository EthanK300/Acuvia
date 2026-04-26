import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  if (category === 1) return "esi 1";
  if (category === 2) return "esi 2";
  if (category === 3) return "esi 3";
  if (category === 4) return "esi 4";
  return "esi 5";
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

function calculateAgeFromBirthday(birthday) {
  if (!birthday) {
    return "--";
  }
  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) {
    return "--";
  }
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
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
  return `${minutes} min`;
}

function mapQueuePatient(row) {
  const severity = categoryToSeverity(row.category);
  return {
    id: row.uuid,
    numberRank: row.number_rank,
    name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Unknown",
    age: calculateAgeFromBirthday(row.birthday),
    injury: row.description || "No description",
    severity,
    vitals: row.latest_payload?.text || "No recent text update",
    location: `Rank ${row.number_rank ?? "--"}`,
    waitTime: formatElapsedSince(row.created_at)
  };
}

async function fetchPatientSummary(patientUuid) {
  const response = await fetch(`${backendUrl}/api/nurses/patient/${patientUuid}/summary`);
  if (!response.ok) {
    throw new Error(`Summary request failed: ${response.status}`);
  }

  const body = await response.json();
  return body.summary?.summary || "only media";
}

function requestDownloadableAppBuild() {
  // Future implementation: trigger Expo/EAS build or surface install link.
}

function getSeverityStyle(severity) {
  return severityStyles[severity] || severityStyles.low;
}

export default function App() {
  const [patients, setPatients] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [selectedPatientSummary, setSelectedPatientSummary] = useState("");
  const [selectedPatientLabel, setSelectedPatientLabel] = useState("");

  const loadPatients = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const queueRows = await fetchPatients();
      setPatients(queueRows.map(mapQueuePatient));
      setQueueError("");
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

  function handleRefreshPatients() {
    loadPatients();
  }

  const handlePatientSelect = useCallback(async (patient) => {
    try {
      const summary = await fetchPatientSummary(patient.id);
      setSelectedPatientLabel(patient.name);
      setSelectedPatientSummary(summary);
    } catch (error) {
      setSelectedPatientLabel(patient.name);
      setSelectedPatientSummary(error.message || "Failed to load patient summary");
    }
  }, []);

  const prioritizedPatients = useMemo(() => patients, [patients]);

  const criticalCount = prioritizedPatients.filter((patient) => {
    return patient.severity === "esi 1";
  }).length;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Acuvia Nurse</Text>
          <Text style={styles.title}>Priority Queue</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={handleRefreshPatients}
          style={styles.iconButton}
        >
          <Text style={styles.iconButtonText}>R</Text>
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryPanel}>
          <Text style={styles.summaryValue}>{prioritizedPatients.length}</Text>
          <Text style={styles.summaryLabel}>Patients</Text>
        </View>
        <View style={styles.summaryPanel}>
          <Text style={styles.summaryValue}>{criticalCount}</Text>
          <Text style={styles.summaryLabel}>Critical</Text>
        </View>
        <View style={styles.summaryPanel}>
          <Text style={styles.summaryValue}>{isRefreshing ? "..." : "Live"}</Text>
          <Text style={styles.summaryLabel}>Queue</Text>
        </View>
      </View>

      {queueError ? (
        <View style={styles.errorPanel}>
          <Text style={styles.errorText}>{queueError}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.listContent}>
        {prioritizedPatients.map((patient, index) => {
          const severityStyle = getSeverityStyle(patient.severity);

          return (
            <Pressable
              accessibilityRole="button"
              key={patient.id}
              onPress={() => handlePatientSelect(patient)}
              style={styles.patientCard}
            >
              <View style={styles.patientTopRow}>
                <Text style={styles.priorityNumber}>#{index + 1}</Text>
                <View style={[styles.severityBadge, severityStyle.badge]}>
                  <Text style={[styles.severityText, severityStyle.text]}>
                    {patient.severity.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.patientName}>
                {patient.name}, {patient.age}
              </Text>
              <Text style={styles.injuryText}>{patient.injury}</Text>

              <View style={styles.detailGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Vitals</Text>
                  <Text style={styles.detailValue}>{patient.vitals}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Location</Text>
                  <Text style={styles.detailValue}>{patient.location}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Wait</Text>
                  <Text style={styles.detailValue}>{patient.waitTime}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        {selectedPatientSummary ? (
          <View style={styles.summaryPanelSelected}>
            <Text style={styles.backendLabel}>Selected Patient</Text>
            <Text style={styles.backendValue}>{selectedPatientLabel}</Text>
            <Text style={styles.selectedSummaryText}>{selectedPatientSummary}</Text>
          </View>
        ) : null}
        <View style={styles.backendPanel}>
          <Text style={styles.backendLabel}>Backend</Text>
          <Text style={styles.backendValue}>{backendUrl}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={requestDownloadableAppBuild}
          style={styles.downloadButton}
        >
          <Text style={styles.downloadButtonText}>Download App</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const severityStyles = StyleSheet.create({
  "esi 1": {
    badge: {
      backgroundColor: "#ffe1df"
    },
    text: {
      color: "#9d241b"
    }
  },
  "esi 2": {
    badge: {
      backgroundColor: "#fff0cf"
    },
    text: {
      color: "#7a4b00"
    }
  },
  "esi 3": {
    badge: {
      backgroundColor: "#dfefff"
    },
    text: {
      color: "#15548a"
    }
  },
  "esi 4": {
    badge: {
      backgroundColor: "#e8f4df"
    },
    text: {
      color: "#2a6a1d"
    }
  },
  "esi 5": {
    badge: {
      backgroundColor: "#dff4e8"
    },
    text: {
      color: "#19633d"
    }
  },
  low: {
    badge: {
      backgroundColor: "#dff4e8"
    },
    text: {
      color: "#19633d"
    }
  }
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f7fa"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12
  },
  eyebrow: {
    color: "#5d6878",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    color: "#17202e",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 2
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dce2ea",
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  iconButtonText: {
    color: "#263241",
    fontSize: 22,
    fontWeight: "700"
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10
  },
  errorPanel: {
    backgroundColor: "#ffe1df",
    borderColor: "#f3b2ad",
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 20,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  errorText: {
    color: "#9d241b",
    fontSize: 13,
    fontWeight: "700"
  },
  summaryPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#dce2ea",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  summaryValue: {
    color: "#17202e",
    fontSize: 20,
    fontWeight: "800"
  },
  summaryLabel: {
    color: "#6a7585",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase"
  },
  listContent: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20
  },
  patientCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dce2ea",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16
  },
  patientTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10
  },
  priorityNumber: {
    color: "#5d6878",
    fontSize: 14,
    fontWeight: "800"
  },
  severityBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  severityText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0
  },
  patientName: {
    color: "#17202e",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4
  },
  injuryText: {
    color: "#334155",
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 14
  },
  detailGrid: {
    borderTopColor: "#e6ebf2",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingTop: 12
  },
  detailItem: {
    flex: 1
  },
  detailLabel: {
    color: "#6a7585",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 3,
    textTransform: "uppercase"
  },
  detailValue: {
    color: "#263241",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18
  },
  footer: {
    backgroundColor: "#ffffff",
    borderTopColor: "#dce2ea",
    borderTopWidth: 1,
    gap: 12,
    padding: 16
  },
  backendPanel: {
    gap: 2
  },
  summaryPanelSelected: {
    backgroundColor: "#f3f7ff",
    borderColor: "#cddcf5",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  selectedSummaryText: {
    color: "#263241",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17
  },
  backendLabel: {
    color: "#6a7585",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  backendValue: {
    color: "#263241",
    fontSize: 13,
    fontWeight: "600"
  },
  downloadButton: {
    alignItems: "center",
    backgroundColor: "#1f6f8b",
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16
  },
  downloadButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  }
});
