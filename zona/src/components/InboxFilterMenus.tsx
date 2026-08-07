import { useEffect, useMemo } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { colors, radius } from '@/theme';
import { useThemedStyles } from '@/theme-preference';

export type FilterMenuId = 'source' | 'status' | 'severity';

export type FilterMenuOption = {
  active: boolean;
  disabled?: boolean;
  /** When true, picking this row leaves the menu open (multi-select sectors). */
  keepOpen?: boolean;
  key: string;
  label: string;
  muted?: boolean;
  onPress: () => void;
};

type SectorProps = {
  disabled?: boolean;
  label: string;
  open: boolean;
  onToggle: () => void;
  summary: string;
  active: boolean;
};

type MenusProps = {
  disabled?: boolean;
  openMenu: FilterMenuId | null;
  onOpenChange: (menu: FilterMenuId | null) => void;
  source: SectorProps & { options: FilterMenuOption[]; loading?: boolean; loadingLabel?: string };
  status: SectorProps & { options: FilterMenuOption[] };
  severity: SectorProps & { options: FilterMenuOption[] };
  accessibilityLabel: string;
};

function FilterSectorButton({
  active,
  disabled,
  label,
  onToggle,
  open,
  summary,
}: SectorProps) {
  const styles = useThemedStyles(createStyles);
  const chevron = useMemo(() => new Animated.Value(0), []);
  const pressScale = useMemo(() => new Animated.Value(1), []);
  const rotate = useMemo(() => chevron.interpolate({
    inputRange: [0, 1],
    // chevron.right → closed points down, open points up
    outputRange: ['90deg', '270deg'],
  }), [chevron]);

  useEffect(() => {
    Animated.spring(chevron, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 80,
    }).start();
  }, [chevron, open]);

  return (
    <Pressable
      accessibilityHint={label}
      accessibilityLabel={`${label}: ${summary}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
      disabled={disabled}
      onPress={onToggle}
      onPressIn={() => {
        Animated.spring(pressScale, {
          toValue: 0.97,
          useNativeDriver: true,
          friction: 6,
          tension: 140,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(pressScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
          tension: 140,
        }).start();
      }}
      style={({ pressed }) => [
        styles.sector,
        (active || open) && styles.sectorActive,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Animated.View style={[styles.sectorInner, { transform: [{ scale: pressScale }] }]}>
        <View style={styles.sectorCopy}>
          <Text numberOfLines={1} style={[styles.sectorLabel, (active || open) && styles.sectorLabelActive]}>
            {label}
          </Text>
          <Text numberOfLines={1} style={[styles.sectorSummary, (active || open) && styles.sectorSummaryActive]}>
            {summary}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <AppIcon
            color={(active || open) ? colors.primaryText : colors.mutedLight}
            fallback="v"
            name="chevron.right"
            size={12}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function MenuPanel({
  loading,
  loadingLabel,
  onClose,
  open,
  options,
  title,
}: {
  loading?: boolean;
  loadingLabel?: string;
  onClose: () => void;
  open: boolean;
  options: FilterMenuOption[];
  title: string;
}) {
  const styles = useThemedStyles(createStyles);
  const opacity = useMemo(() => new Animated.Value(0), []);
  const translateY = useMemo(() => new Animated.Value(-6), []);

  useEffect(() => {
    if (!open) {
      opacity.setValue(0);
      translateY.setValue(-6);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 90,
      }),
    ]).start();
  }, [opacity, open, translateY]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={onClose} style={styles.backdrop} />
        <Animated.View style={[styles.menuCard, { opacity, transform: [{ translateY }] }]}>
          <Text style={styles.menuTitle}>{title}</Text>
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            style={styles.menuScroll}
          >
            {loading ? (
              <Text style={styles.menuLoading}>{loadingLabel}</Text>
            ) : null}
            {options.map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: option.disabled, selected: option.active }}
                disabled={option.disabled}
                key={option.key}
                onPress={() => {
                  option.onPress();
                  if (!option.keepOpen) onClose();
                }}
                style={({ pressed }) => [
                  styles.menuRow,
                  option.active && styles.menuRowActive,
                  option.muted && styles.menuRowMuted,
                  option.disabled && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  numberOfLines={2}
                  style={[
                    styles.menuRowText,
                    option.active && styles.menuRowTextActive,
                    option.muted && styles.menuRowTextMuted,
                  ]}
                >
                  {option.label}
                </Text>
                {option.active ? (
                  <AppIcon color={colors.primary} fallback="✓" name="checkmark" size={14} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function InboxFilterMenus({
  accessibilityLabel,
  disabled = false,
  onOpenChange,
  openMenu,
  severity,
  source,
  status,
}: MenusProps) {
  const styles = useThemedStyles(createStyles);

  function toggle(id: FilterMenuId) {
    if (disabled) return;
    onOpenChange(openMenu === id ? null : id);
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.row}>
      <FilterSectorButton
        active={source.active}
        disabled={disabled || source.disabled}
        label={source.label}
        onToggle={() => toggle('source')}
        open={openMenu === 'source'}
        summary={source.summary}
      />
      <FilterSectorButton
        active={status.active}
        disabled={disabled || status.disabled}
        label={status.label}
        onToggle={() => toggle('status')}
        open={openMenu === 'status'}
        summary={status.summary}
      />
      <FilterSectorButton
        active={severity.active}
        disabled={disabled || severity.disabled}
        label={severity.label}
        onToggle={() => toggle('severity')}
        open={openMenu === 'severity'}
        summary={severity.summary}
      />

      <MenuPanel
        loading={source.loading}
        loadingLabel={source.loadingLabel}
        onClose={() => onOpenChange(null)}
        open={openMenu === 'source'}
        options={source.options}
        title={source.label}
      />
      <MenuPanel
        onClose={() => onOpenChange(null)}
        open={openMenu === 'status'}
        options={status.options}
        title={status.label}
      />
      <MenuPanel
        onClose={() => onOpenChange(null)}
        open={openMenu === 'severity'}
        options={severity.options}
        title={severity.label}
      />
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  sector: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.medium,
    borderWidth: 1,
    flex: 1,
    minHeight: 52,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sectorActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  sectorInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  sectorCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectorLabel: {
    color: colors.mutedLight,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectorLabelActive: {
    color: colors.primaryText,
  },
  sectorSummary: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  sectorSummaryActive: {
    color: colors.primaryText,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 28,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  menuCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.large,
    borderWidth: 1,
    maxHeight: '62%',
    paddingBottom: 8,
    paddingTop: 14,
  },
  menuTitle: {
    color: colors.mutedLight,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingBottom: 8,
    paddingHorizontal: 16,
    textTransform: 'uppercase',
  },
  menuScroll: {
    flexGrow: 0,
  },
  menuLoading: {
    color: colors.muted,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  menuRowActive: {
    backgroundColor: colors.primarySoft,
  },
  menuRowMuted: {
    opacity: 0.62,
  },
  menuRowText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  menuRowTextActive: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  menuRowTextMuted: {
    color: colors.muted,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
});
