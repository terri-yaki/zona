import { useCallback, useRef, useState } from 'react';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  State,
  type HandlerStateChangeEvent,
  type PanGestureHandlerEventPayload,
  type PinchGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';
import { useI18n } from '@/providers/LocalizationProvider';

type Props = {
  uri: string;
  accessibilityLabel?: string;
  previewStyle?: object;
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * Attachment preview → full-screen viewer with pinch-to-zoom.
 * iOS uses native ScrollView zoom. Android uses gesture-handler pinch/pan
 * with RN Animated (no reanimated native module required).
 */
export function ImageLightbox({ uri, accessibilityLabel, previewStyle }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      <Pressable
        accessibilityHint={t('image.openHint')}
        accessibilityLabel={accessibilityLabel ?? t('image.attachment')}
        accessibilityRole="imagebutton"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.previewHit, pressed && styles.pressed]}
      >
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={{ uri }}
          style={[styles.preview, previewStyle]}
        />
        <View style={styles.previewHint}>
          <Text style={styles.previewHintText}>{t('image.previewHint')}</Text>
        </View>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        transparent
        visible={open}
      >
        <NavigationBar style="light" />
        <StatusBar style="light" />
        {Platform.OS === 'ios'
          ? <IosZoomViewer onClose={() => setOpen(false)} uri={uri} />
          : <AndroidZoomViewer onClose={() => setOpen(false)} uri={uri} />}
      </Modal>
    </>
  );
}

function IosZoomViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [zoom, setZoom] = useState(1);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setZoom(event.nativeEvent.zoomScale ?? 1);
  }, []);

  return (
    <View style={styles.modalRoot}>
      <ScrollView
        bouncesZoom
        centerContent
        contentContainerStyle={styles.iosZoomContent}
        maximumZoomScale={5}
        minimumZoomScale={1}
        onScroll={onScroll}
        pinchGestureEnabled
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
      >
        <Image
          accessibilityLabel={t('image.fullSize')}
          resizeMode="contain"
          source={{ uri }}
          style={styles.fullImage}
        />
      </ScrollView>
      <ViewerChrome onClose={onClose} paddingBottom={insets.bottom + 8} paddingTop={insets.top + 8} zoomLabel={`${Math.round(zoom * 100)}%`} />
    </View>
  );
}

function AndroidZoomViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [baseScale] = useState(() => new Animated.Value(1));
  const [pinchScale] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => Animated.multiply(baseScale, pinchScale));
  const lastScale = useRef(1);
  const [translateX] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(0));
  const lastOffset = useRef({ x: 0, y: 0 });
  const [panEnabled, setPanEnabled] = useState(false);
  const [zoomLabel, setZoomLabel] = useState('100%');

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true },
  );

  const onPinchStateChange = (event: HandlerStateChangeEvent<PinchGestureHandlerEventPayload>) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      let next = lastScale.current * event.nativeEvent.scale;
      next = Math.min(5, Math.max(1, next));
      lastScale.current = next;
      baseScale.setValue(next);
      pinchScale.setValue(1);
      setZoomLabel(`${Math.round(next * 100)}%`);
      if (next <= 1.02) {
        lastScale.current = 1;
        baseScale.setValue(1);
        lastOffset.current = { x: 0, y: 0 };
        translateX.setOffset(0);
        translateY.setOffset(0);
        translateX.setValue(0);
        translateY.setValue(0);
        setZoomLabel('100%');
      }
      setPanEnabled(lastScale.current > 1);
    }
  };

  const onPanEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    { useNativeDriver: true },
  );

  const onPanStateChange = (event: HandlerStateChangeEvent<PanGestureHandlerEventPayload>) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastOffset.current = {
        x: lastOffset.current.x + event.nativeEvent.translationX,
        y: lastOffset.current.y + event.nativeEvent.translationY,
      };
      translateX.setOffset(lastOffset.current.x);
      translateX.setValue(0);
      translateY.setOffset(lastOffset.current.y);
      translateY.setValue(0);
    }
  };

  return (
    <GestureHandlerRootView style={styles.modalRoot}>
      <PanGestureHandler
        enabled={panEnabled}
        maxPointers={1}
        minPointers={1}
        onGestureEvent={onPanEvent}
        onHandlerStateChange={onPanStateChange}
      >
        <Animated.View style={styles.flex}>
          <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
            <Animated.View style={[styles.androidCenter, { transform: [{ translateX }, { translateY }, { scale }] }]}>
              <Image
                accessibilityLabel={t('image.fullSize')}
                resizeMode="contain"
                source={{ uri }}
                style={styles.fullImage}
              />
            </Animated.View>
          </PinchGestureHandler>
        </Animated.View>
      </PanGestureHandler>
      <ViewerChrome onClose={onClose} paddingBottom={insets.bottom + 8} paddingTop={insets.top + 8} zoomLabel={zoomLabel} />
    </GestureHandlerRootView>
  );
}

function ViewerChrome({
  onClose,
  paddingTop,
  paddingBottom,
  zoomLabel,
}: {
  onClose: () => void;
  paddingTop: number;
  paddingBottom: number;
  zoomLabel: string;
}) {
  const { t } = useI18n();
  return (
    <View pointerEvents="box-none" style={[styles.chrome, { paddingBottom, paddingTop }]}>
      <Text style={styles.zoomLabel}>{zoomLabel}</Text>
      <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
        <Text style={styles.closeText}>{t('common.close')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  previewHit: { width: '100%' },
  preview: { alignSelf: 'center', height: 320, width: '100%' },
  previewHint: {
    alignSelf: 'center',
    backgroundColor: 'rgba(23,34,30,0.55)',
    borderRadius: 999,
    bottom: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: 'absolute',
  },
  previewHintText: { color: colors.white, fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  modalRoot: { backgroundColor: 'rgba(0,0,0,0.94)', flex: 1 },
  flex: { flex: 1 },
  iosZoomContent: { alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  fullImage: { height: screenHeight * 0.78, width: screenWidth },
  androidCenter: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  chrome: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 16,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  zoomLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 16,
  },
  closeText: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
