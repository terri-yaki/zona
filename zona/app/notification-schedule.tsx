import { getCalendars } from 'expo-localization';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useBottomSafePadding } from '@/components/TabScreen';
import { getNotificationSchedule, setNotificationSchedule, type NotificationSchedule } from '@/data/notification-schedules';
import { userMessage } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

const dayKeys = ['schedule.day.sun', 'schedule.day.mon', 'schedule.day.tue', 'schedule.day.wed', 'schedule.day.thu', 'schedule.day.fri', 'schedule.day.sat'] as const;

function formatMinute(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseMinute(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

export default function NotificationScheduleScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ sourceId?: string | string[]; sourceName?: string | string[] }>();
  const sourceId = Array.isArray(params.sourceId) ? params.sourceId[0] : params.sourceId ?? null;
  const sourceName = Array.isArray(params.sourceName) ? params.sourceName[0] : params.sourceName;
  const { session, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const paddingBottom = useBottomSafePadding(24);
  const [schedule, setSchedule] = useState<NotificationSchedule | null>(null);
  const [startText, setStartText] = useState('22:00');
  const [endText, setEndText] = useState('08:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    void getNotificationSchedule(sourceId).then((value) => {
      if (!active) return;
      const deviceTimezone = getCalendars()[0]?.timeZone;
      const next = value.updatedAt || !deviceTimezone ? value : { ...value, timezone: deviceTimezone };
      setSchedule(next);
      setStartText(formatMinute(next.startMinute));
      setEndText(formatMinute(next.endMinute));
    }).catch((caught) => {
      if (active) Alert.alert(t('schedule.loadError'), userMessage(caught));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.user.id, sourceId, t]);

  if (authLoading || loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!schedule) return <Redirect href={sourceId ? '/(tabs)/sources' : '/(tabs)/settings'} />;

  function toggleDay(day: number) {
    setSchedule((current) => {
      if (!current) return current;
      const exists = current.weekdays.includes(day);
      if (exists && current.weekdays.length === 1) return current;
      return { ...current, weekdays: exists ? current.weekdays.filter((item) => item !== day) : [...current.weekdays, day].sort() };
    });
  }

  async function save() {
    if (!schedule || saving) return;
    const startMinute = parseMinute(startText);
    const endMinute = parseMinute(endText);
    if (startMinute === null || endMinute === null || !schedule.timezone.trim()) {
      Alert.alert(t('schedule.invalidTitle'), t('schedule.invalidBody'));
      return;
    }
    setSaving(true);
    try {
      const saved = await setNotificationSchedule({ ...schedule, startMinute, endMinute, timezone: schedule.timezone.trim() });
      setSchedule(saved);
      Alert.alert(t('schedule.savedTitle'), t('schedule.savedBody'));
      router.back();
    } catch (caught) {
      Alert.alert(t('schedule.saveError'), userMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Stack.Screen options={{ title: sourceId ? t('schedule.sourceTitle') : t('schedule.globalTitle') }} />
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom }]} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.heroIcon}><AppIcon color={colors.primary} fallback="Q" name="moon.stars.fill" size={24} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{sourceId ? t('schedule.sourceHeading', { name: sourceName || t('sources.title') }) : t('schedule.globalHeading')}</Text>
          <Text style={styles.body}>{sourceId ? t('schedule.sourceBody') : t('schedule.globalBody')}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}><Text style={styles.label}>{t('schedule.enabled')}</Text><Text style={styles.caption}>{t('schedule.enabledBody')}</Text></View>
          <Switch onValueChange={(enabled) => setSchedule({ ...schedule, enabled })} thumbColor={schedule.enabled ? colors.primary : colors.mutedLight} trackColor={{ false: colors.border, true: colors.primarySoft }} value={schedule.enabled} />
        </View>
      </View>

      <Text style={styles.section}>{t('schedule.days')}</Text>
      <View style={[styles.dayRow, !schedule.enabled && styles.disabled]} pointerEvents={schedule.enabled ? 'auto' : 'none'}>
        {dayKeys.map((key, day) => {
          const selected = schedule.weekdays.includes(day);
          return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={key} onPress={() => toggleDay(day)} style={({ pressed }) => [styles.day, selected && styles.daySelected, pressed && styles.pressed]}><Text style={[styles.dayText, selected && styles.dayTextSelected]}>{t(key)}</Text></Pressable>;
        })}
      </View>

      <Text style={styles.section}>{t('schedule.window')}</Text>
      <View style={[styles.timeCard, !schedule.enabled && styles.disabled]} pointerEvents={schedule.enabled ? 'auto' : 'none'}>
        <View style={styles.timeField}><Text style={styles.fieldLabel}>{t('schedule.starts')}</Text><TextInput accessibilityLabel={t('schedule.starts')} autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={setStartText} placeholder="22:00" placeholderTextColor={colors.muted} style={styles.timeInput} value={startText} /></View>
        <AppIcon color={colors.mutedLight} fallback="→" name="arrow.right" size={17} />
        <View style={styles.timeField}><Text style={styles.fieldLabel}>{t('schedule.ends')}</Text><TextInput accessibilityLabel={t('schedule.ends')} autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={setEndText} placeholder="08:00" placeholderTextColor={colors.muted} style={styles.timeInput} value={endText} /></View>
      </View>
      <Text style={styles.hint}>{t('schedule.windowHint')}</Text>

      <Text style={styles.section}>{t('schedule.timezone')}</Text>
      <TextInput accessibilityLabel={t('schedule.timezone')} autoCapitalize="none" editable={schedule.enabled} onChangeText={(timezone) => setSchedule({ ...schedule, timezone })} placeholder="Asia/Hong_Kong" placeholderTextColor={colors.muted} style={[styles.input, !schedule.enabled && styles.disabled]} value={schedule.timezone} />
      <Text style={styles.hint}>{t('schedule.timezoneHint')}</Text>

      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, saving && styles.disabled, pressed && styles.pressed]}>{saving ? <ActivityIndicator color={colors.white} /> : <><AppIcon color={colors.white} fallback="S" name="checkmark" size={16} /><Text style={styles.saveText}>{t('schedule.save')}</Text></>}</Pressable>
    </ScrollView>
  </>;
}

const createStyles = () => StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 20 },
  hero: { alignItems: 'flex-start', flexDirection: 'row', gap: 13, marginBottom: 20 },
  heroIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 16, height: 50, justifyContent: 'center', width: 50 },
  heroCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, padding: 15 },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  switchCopy: { flex: 1 },
  label: { color: colors.text, fontSize: 15, fontWeight: '700' },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  section: { color: colors.mutedLight, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginBottom: 8, marginLeft: 3, marginTop: 20 },
  dayRow: { flexDirection: 'row', gap: 6 },
  day: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.full, borderWidth: 1, flex: 1, minHeight: 40, justifyContent: 'center' },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  dayTextSelected: { color: colors.white },
  timeCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  timeField: { flex: 1 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 6 },
  timeInput: { backgroundColor: colors.background, borderRadius: radius.small, color: colors.text, fontSize: 18, fontWeight: '700', minHeight: 48, paddingHorizontal: 12, textAlign: 'center' },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.medium, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 50, paddingHorizontal: 14 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginHorizontal: 3, marginTop: 7 },
  save: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.medium, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 28, minHeight: 52 },
  saveText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.48 },
});
