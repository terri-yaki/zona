import { HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type ZonaInboxWidgetProps = {
  latestSource: string;
  latestTitle: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'default';
  unreadCount: number;
};

const ZonaInboxWidgetView = (props: ZonaInboxWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const severityColor = props.severity === 'critical'
    ? '#EF4E4E'
    : props.severity === 'high'
      ? '#FF9F43'
      : props.severity === 'medium'
        ? '#F4C542'
        : props.severity === 'low'
          ? '#68D391'
          : '#FFFFFF';
  const count = props.unreadCount > 999 ? '999+' : String(props.unreadCount);
  const empty = props.unreadCount === 0;

  if (environment.widgetFamily === 'accessoryInline') {
    return <Text>{empty ? 'Zona · All clear' : `Zona · ${count} unread`}</Text>;
  }

  if (environment.widgetFamily === 'accessoryCircular') {
    return <VStack alignment="center" modifiers={[widgetURL('zona://'), containerBackground('#2F6B5F', 'widget')]} spacing={2}>
      <Image color="#FFFFFF" size={15} systemName={empty ? 'checkmark' : 'bell.fill'} />
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>{empty ? '0' : count}</Text>
    </VStack>;
  }

  if (environment.widgetFamily === 'accessoryRectangular') {
    return <HStack alignment="center" modifiers={[widgetURL('zona://'), containerBackground('#2F6B5F', 'widget')]} spacing={8}>
      <Image color="#FFFFFF" size={20} systemName={empty ? 'checkmark.circle.fill' : 'bell.badge.fill'} />
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>{empty ? 'All clear' : `${count} unread`}</Text>
        <Text modifiers={[font({ size: 10 }), foregroundStyle('#E5F2EF'), lineLimit(1)]}>{empty ? 'Zona is watching' : props.latestSource}</Text>
      </VStack>
    </HStack>;
  }

  return <VStack alignment="leading" modifiers={[
    widgetURL('zona://'),
    containerBackground('#2F6B5F', 'widget'),
    frame({ maxHeight: 500, maxWidth: 500, alignment: 'topLeading' }),
    padding({ all: 4 }),
  ]} spacing={9}>
    <HStack alignment="center" spacing={7}>
      <Image color={severityColor} size={20} systemName={empty ? 'checkmark.circle.fill' : 'bell.badge.fill'} />
      <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>{empty ? 'All clear' : `${count} unread`}</Text>
    </HStack>
    <VStack alignment="leading" spacing={3}>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#E5F2EF'), lineLimit(1)]}>{empty ? 'Zona' : props.latestSource}</Text>
      <Text modifiers={[font({ size: environment.widgetFamily === 'systemMedium' ? 16 : 14, weight: 'bold' }), foregroundStyle('#FFFFFF'), lineLimit(environment.widgetFamily === 'systemMedium' ? 2 : 3)]}>{empty ? 'Nothing needs you right now.' : props.latestTitle}</Text>
    </VStack>
  </VStack>;
};

export default createWidget<ZonaInboxWidgetProps>('ZonaInboxWidget', ZonaInboxWidgetView);
