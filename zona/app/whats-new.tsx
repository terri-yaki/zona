import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { whatsNewReleases } from '@/content/whats-new';
import { useI18n } from '@/providers/LocalizationProvider';
import { colors, radius, shadows } from '@/theme';

export default function WhatsNewScreen() {
  const { t } = useI18n();
  const installedVersion = Constants.expoConfig?.version ?? whatsNewReleases[0].version;

  return (
    <>
      <Stack.Screen options={{ title: t('nav.whatsNew') }} />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <AppIcon color={colors.white} fallback="+" name="sparkles" size={27} />
          </View>
          <Text style={styles.eyebrow}>{t('whatsNew.eyebrow')}</Text>
          <Text style={styles.title}>{t('whatsNew.title')}</Text>
          <Text style={styles.intro}>{t('whatsNew.intro')}</Text>
          <View style={styles.versionPill}>
            <View style={styles.versionDot} />
            <Text style={styles.versionText}>{t('whatsNew.installedVersion', { version: installedVersion })}</Text>
          </View>
        </View>

        {whatsNewReleases.map((release) => (
          <View key={release.id} style={styles.release}>
            <View style={styles.releaseHeading}>
              <View style={styles.releaseHeadingCopy}>
                <View style={styles.releaseMeta}>
                  <Text style={styles.version}>v{release.version}</Text>
                  <Text style={styles.date}>{t(release.dateKey)}</Text>
                </View>
                <Text style={styles.releaseTitle}>{t(release.titleKey)}</Text>
              </View>
              {release.latest ? <Text style={styles.latest}>{t('whatsNew.latest')}</Text> : null}
            </View>
            <Text style={styles.summary}>{t(release.summaryKey)}</Text>

            <View style={styles.items}>
              {release.items.map((item, index) => (
                <View key={item.titleKey} style={[styles.item, index > 0 && styles.itemBorder]}>
                  <View style={styles.itemIcon}>
                    <AppIcon color={index % 2 === 0 ? colors.primary : colors.accent} fallback="•" name={item.icon} size={18} />
                  </View>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemTitle}>{t(item.titleKey)}</Text>
                    <Text style={styles.itemBody}>{t(item.bodyKey)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <AppIcon color={colors.primary} fallback="✓" name="checkmark.circle.fill" size={25} />
          <Text style={styles.footerTitle}>{t('whatsNew.footerTitle')}</Text>
          <Text style={styles.footerBody}>{t('whatsNew.footerBody')}</Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 16, paddingBottom: 38 },
  hero: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.large, paddingHorizontal: 23, paddingVertical: 28 },
  heroIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 20, height: 54, justifyContent: 'center', marginBottom: 15, width: 54 },
  eyebrow: { color: '#D8EAE4', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: colors.white, fontSize: 28, fontWeight: '800', letterSpacing: -0.7, lineHeight: 33, marginTop: 8, textAlign: 'center' },
  intro: { color: '#D8EAE4', fontSize: 13, lineHeight: 20, marginTop: 9, maxWidth: 320, textAlign: 'center' },
  versionPill: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: radius.full, flexDirection: 'row', gap: 7, marginTop: 18, paddingHorizontal: 11, paddingVertical: 7 },
  versionDot: { backgroundColor: '#8FE0BE', borderRadius: 4, height: 8, width: 8 },
  versionText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  release: { marginTop: 26 },
  releaseHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingHorizontal: 3 },
  releaseHeadingCopy: { flex: 1 },
  releaseMeta: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  version: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  date: { color: colors.mutedLight, fontSize: 11, fontWeight: '600' },
  releaseTitle: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.4, marginTop: 5 },
  latest: { backgroundColor: colors.accentSoft, borderRadius: radius.full, color: colors.accent, fontSize: 9, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  summary: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7, paddingHorizontal: 3 },
  items: { ...shadows.card, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.large, borderWidth: 1, marginTop: 14, overflow: 'hidden', paddingHorizontal: 15 },
  item: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingVertical: 15 },
  itemBorder: { borderTopColor: colors.border, borderTopWidth: 1 },
  itemIcon: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  itemCopy: { flex: 1, paddingTop: 1 },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  itemBody: { color: colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 4 },
  footer: { alignItems: 'center', marginTop: 31, paddingHorizontal: 25 },
  footerTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 9 },
  footerBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: 'center' },
});

