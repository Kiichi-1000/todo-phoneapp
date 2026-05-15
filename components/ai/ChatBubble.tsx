import { View, Text, StyleSheet, Platform } from 'react-native';

interface Props {
  role: 'user' | 'assistant';
  text: string;
  isStreaming?: boolean;
}

export default function ChatBubble({ role, text, isStreaming }: Props) {
  const isUser = role === 'user';

  if (!isUser) {
    // Assistant: borderless flowing text (like Claude / ChatGPT) for a cleaner read.
    return (
      <View style={styles.assistantWrap}>
        <Text style={styles.assistantText}>
          {text}
          {isStreaming && <Text style={styles.cursor}>▍</Text>}
        </Text>
      </View>
    );
  }

  // User: styled bubble.
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{text}</Text>
      </View>
    </View>
  );
}

const userBubbleShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  android: { elevation: 2 },
  default: {},
});

const styles = StyleSheet.create({
  // Assistant
  assistantWrap: {
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  assistantText: {
    fontSize: 15.5,
    lineHeight: 23,
    color: '#0F172A',
    fontWeight: '400',
  },
  cursor: { color: '#94A3B8' },

  // User
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  userBubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    backgroundColor: '#0F172A',
    ...userBubbleShadow,
  },
  userText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#fff',
    fontWeight: '500',
  },
});
