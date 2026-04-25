import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Nurse UI Scaffold</Text>
      <Text>Runtime setup is ready. No application code yet.</Text>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6f7fb",
    padding: 16
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8
  }
});
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Acuvia Mobile App</Text>
        <Text style={styles.text}>Expo Go compatible React Native client.</Text>
        <Text style={styles.text}>Backend URL: {backendUrl}</Text>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6f7fb",
    padding: 16
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    gap: 8
  },
  title: {
    fontSize: 24,
    fontWeight: "700"
  },
  text: {
    fontSize: 16
  }
});
