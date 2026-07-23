import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';

export default function PrivacyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy' }} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.title}>Privacy at a glance</Text>
        <Text style={styles.intro}>Zona stores only what it needs to deliver and synchronize your alerts.</Text>
        <PrivacySection title="Account" body="A private account tied to this iPhone identifies your data through Supabase Authentication. No email or password is collected." />
        <PrivacySection title="Sources and alerts" body="Source names, optional hostnames, alert content, timestamps, and validated metadata are retained for seven days. Source tokens are stored only as hashes." />
        <PrivacySection title="Push delivery" body="Your Expo push token is sent to the Zona relay. Alert text passes through Supabase, Expo Push Service, and Apple Push Notification service, and may appear on your lock screen." />
        <PrivacySection title="Your control" body="Revoke one source without affecting others, delete individual alerts, sign out, or permanently delete your account and associated data from Settings." />
        <View style={styles.note}><Text style={styles.noteText}>Before App Store release, the operator must publish the full privacy policy and support URL listed in the release checklist.</Text></View>
      </ScrollView>
    </>
  );
}

function PrivacySection({ title, body }: { title: string; body: string }) {
  return <View style={styles.card}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.body}>{body}</Text></View>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 18 },
  title: { color: colors.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.5 },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 20, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, marginBottom: 10, padding: 16 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  body: { color: colors.textSoft, fontSize: 13, lineHeight: 20, marginTop: 6 },
  note: { backgroundColor: colors.accentSoft, borderRadius: radius.medium, marginTop: 8, padding: 14 },
  noteText: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
});
