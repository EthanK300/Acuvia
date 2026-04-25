import { StatusBar } from "expo-status-bar";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:4000";

const severityRank = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1
};

const mockPatients = [
  {
    id: "acu-1042",
    name: "Jordan Lee",
    age: 42,
    injury: "Chest trauma with shortness of breath",
    severity: "critical",
    vitals: "BP 88/54, HR 132",
    location: "Bay 2",
    waitTime: "4 min"
  },
  {
    id: "acu-1039",
    name: "Mina Patel",
    age: 67,
    injury: "Head injury after fall",
    severity: "high",
    vitals: "BP 146/92, HR 104",
    location: "Triage",
    waitTime: "11 min"
  },
  {
    id: "acu-1044",
    name: "Sam Rivera",
    age: 29,
    injury: "Deep arm laceration",
    severity: "moderate",
    vitals: "BP 121/78, HR 86",
    location: "Waiting",
    waitTime: "18 min"
  },
  {
    id: "acu-1040",
    name: "Evelyn Brooks",
    age: 35,
    injury: "Ankle sprain with swelling",
    severity: "low",
    vitals: "BP 118/74, HR 72",
    location: "Waiting",
    waitTime: "22 min"
  }
];

function fetchPatients() {
  return mockPatients;
}

function calculateInjuryPriority(patient) {
  return severityRank[patient.severity] || 0;
}

function sortPatientsByPriority(patients) {
  return [...patients].sort((current, next) => {
    return calculateInjuryPriority(next) - calculateInjuryPriority(current);
  });
}

function handleRefreshPatients() {
  // Future implementation: fetch current triage queue from backendUrl.
}

function handlePatientSelect(patientId) {
  // Future implementation: navigate to patient detail and care tasks.
  return patientId;
}

function requestDownloadableAppBuild() {
  // Future implementation: trigger Expo/EAS build or surface install link.
}

function getSeverityStyle(severity) {
  return severityStyles[severity] || severityStyles.low;
}

export default function App() {
  const prioritizedPatients = sortPatientsByPriority(fetchPatients());
  const criticalCount = prioritizedPatients.filter((patient) => {
    return patient.severity === "critical";
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
          <Text style={styles.summaryValue}>Live</Text>
          <Text style={styles.summaryLabel}>Queue</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {prioritizedPatients.map((patient, index) => {
          const severityStyle = getSeverityStyle(patient.severity);

          return (
            <Pressable
              accessibilityRole="button"
              key={patient.id}
              onPress={() => handlePatientSelect(patient.id)}
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
  critical: {
    badge: {
      backgroundColor: "#ffe1df"
    },
    text: {
      color: "#9d241b"
    }
  },
  high: {
    badge: {
      backgroundColor: "#fff0cf"
    },
    text: {
      color: "#7a4b00"
    }
  },
  moderate: {
    badge: {
      backgroundColor: "#dfefff"
    },
    text: {
      color: "#15548a"
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
