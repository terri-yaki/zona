import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { useBottomSafePadding } from '@/components/TabScreen';
import { useSources } from '@/hooks/useSources';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export default function FirstAlertScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useI18n();
  const { sources } = useSources(true);
  const bottomPadding = useBottomSafePadding(24);
  if (!session) return <Redirect href="/sign-in" />;

  return <ScrollView contentContainerStyle={[styles.page, { paddingBottom: bottomPadding }]}>
    <View style={styles.heroIcon}><AppIcon color={colors.accent} fallback="1" name="paperplane.fill" size={28} /></View>
    <Text style={styles.title}>{t('firstAlert.title')}</Text>
    <Text style={styles.intro}>{t('firstAlert.intro')}</Text>
    <Step icon="desktopcomputer" number="1" title={t('firstAlert.stepSourceTitle')} body={sources.length ? t('firstAlert.stepSourceExisting', { count: sources.length }) : t('firstAlert.stepSourceBody')} />
    <Step icon="key.fill" number="2" title={t('firstAlert.stepTokenTitle')} body={t('firstAlert.stepTokenBody')} />
    <Step icon="bell.badge.fill" number="3" title={t('firstAlert.stepSendTitle')} body={t('firstAlert.stepSendBody')} />
    <View style={styles.templates}>
      <Text style={styles.templatesTitle}>{t('firstAlert.templatesTitle')}</Text>
      <Text style={styles.templatesBody}>{t('firstAlert.templatesBody')}</Text>
      <View style={styles.templateRow}>{['AI agent', 'cURL', 'PowerShell', 'GitHub Actions'].map((label) => <Text key={label} style={styles.template}>{label}</Text>)}</View>
    </View>
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/source/new', params: { wizard: 'true' } } as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><AppIcon color={colors.white} fallback="+" name="plus" size={17} /><Text style={styles.primaryText}>{t('firstAlert.createSource')}</Text></Pressable>
    {sources.length ? <Text style={styles.note}>{t('firstAlert.existingNote')}</Text> : null}
  </ScrollView>;
}

function Step({ body, icon, number, title }: { body: string; icon: 'desktopcomputer' | 'key.fill' | 'bell.badge.fill'; number: string; title: string }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.step}><View style={styles.stepIcon}><AppIcon color={colors.primary} fallback={number} name={icon} size={19} /></View><View style={styles.stepCopy}><Text style={styles.stepNumber}>{number}</Text><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepBody}>{body}</Text></View></View>;
}

const createStyles = () => StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 22 },
  heroIcon: { alignItems: 'center', backgroundColor: colors.accentSoft, borderRadius: 20, height: 62, justifyContent: 'center', width: 62 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 17 },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 22, marginTop: 7 },
  step: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 13, marginBottom: 10, padding: 15 },
  stepIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 13, height: 42, justifyContent: 'center', width: 42 },
  stepCopy: { flex: 1 },
  stepNumber: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  stepTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
  stepBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  templates: { backgroundColor: colors.primarySoft, borderRadius: radius.medium, marginTop: 8, padding: 15 },
  templatesTitle: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  templatesBody: { color: colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 4 },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  template: { backgroundColor: colors.surface, borderRadius: radius.full, color: colors.primary, fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6 },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 18, minHeight: 54 },
  primaryText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  note: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
