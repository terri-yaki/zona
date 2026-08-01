import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';
import { useBottomSafePadding } from '@/components/TabScreen';
import { useI18n } from '@/providers/LocalizationProvider';

export default function PrivacyScreen() {
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  const bottomPadding = useBottomSafePadding(18);
  return (
    <>
      <Stack.Screen options={{ title: t('nav.privacy') }} />
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: bottomPadding }]}>
        <Text style={styles.title}>{t('privacy.title')}</Text>
        <Text style={styles.intro}>{t('privacy.intro')}</Text>
        <PrivacySection title={t('privacy.accountTitle')} body={t('privacy.accountBody')} />
        <PrivacySection title={t('privacy.sourcesTitle')} body={t('privacy.sourcesBody')} />
        <PrivacySection title={t('privacy.pushTitle')} body={t('privacy.pushBody')} />
        <PrivacySection title={t('privacy.controlTitle')} body={t('privacy.controlBody')} />
        <View style={styles.note}><Text style={styles.noteText}>{t('privacy.note')}</Text></View>
      </ScrollView>
    </>
  );
}

function PrivacySection({ title, body }: { title: string; body: string }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.card}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.body}>{body}</Text></View>;
}

const createStyles = () => StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 18 },
  title: { color: colors.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.5 },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 20, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, marginBottom: 10, padding: 16 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  body: { color: colors.textSoft, fontSize: 13, lineHeight: 20, marginTop: 6 },
  note: { backgroundColor: colors.accentSoft, borderRadius: radius.medium, marginTop: 8, padding: 14 },
  noteText: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
});
