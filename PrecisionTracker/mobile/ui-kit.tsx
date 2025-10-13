// ui-kit.tsx
import React from 'react';
import { Platform, Pressable, Text, TextInput, View, ViewStyle } from 'react-native';

export const theme = {
  color: {
    bg: '#0B0C10',
    surface: '#111217',
    card: '#151724',
    cardBorder: '#23263a',
    text: '#F2F3F5',
    textMuted: '#AEB3BE',
    primary: '#6C8CFF',
    primaryFg: '#0B0C10',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    outline: '#3b3f55',
    pill: '#1e2233',
  },
  radius: { xs: 6, sm: 10, md: 14, lg: 20 },
  space: (n: number) => 4 * n,
  font: { h1: 22, h2: 18, body: 15, small: 13 },
  shadow: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 2 },
  }) as ViewStyle,
};

// ---------- Layout ----------
export const Screen: React.FC<{padding?: number; children: React.ReactNode}> = ({ padding = 4, children }) => (
  <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
    <View style={{ padding: theme.space(padding) }}>{children}</View>
  </View>
);

export const SectionTitle: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <Text style={{ color: theme.color.text, fontSize: theme.font.h2, fontWeight: '700', marginBottom: theme.space(2) }}>
    {children}
  </Text>
);

export const Row: React.FC<{gap?: number; wrap?: boolean; between?: boolean; center?: boolean; children: React.ReactNode}> = ({ gap = 2, wrap, between, center, children }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: center ? 'center' : 'flex-start',
      justifyContent: between ? 'space-between' : 'flex-start',
      flexWrap: wrap ? 'wrap' : 'nowrap',
      columnGap: theme.space(gap),
      rowGap: theme.space(gap),
    }}
  >
    {children}
  </View>
);

// ---------- Surfaces ----------
export const Card: React.FC<{children: React.ReactNode; padded?: boolean; onPress?: () => void; a11yLabel?: string}> = ({ children, padded = true, onPress, a11yLabel }) => {
  const content = (
    <View
      style={[
        { backgroundColor: theme.color.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.cardBorder },
        theme.shadow,
        padded ? { padding: theme.space(3) } : null,
        { marginBottom: theme.space(3) },
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      android_ripple={{ color: '#2b2f44' }}
      style={{ borderRadius: theme.radius.md }}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
};

// ---------- Text ----------
export const Muted: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <Text style={{ color: theme.color.textMuted, fontSize: theme.font.body }}>{children}</Text>
);

// ---------- Inputs ----------
export const Input: React.FC<React.ComponentProps<typeof TextInput>> = (props) => (
  <TextInput
    placeholderTextColor={theme.color.textMuted}
    {...props}
    style={[
      {
        borderWidth: 1,
        borderColor: theme.color.outline,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.space(3),
        paddingHorizontal: theme.space(3),
        color: theme.color.text,
        backgroundColor: '#0E1020',
        fontSize: theme.font.body,
      },
      props.style,
    ]}
  />
);

// ---------- Buttons ----------
type BtnVariant = 'primary' | 'ghost' | 'outline' | 'danger' | 'pill' | 'success' | 'warning';
export const Button: React.FC<{
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: BtnVariant;
  small?: boolean;
  a11yLabel?: string;
}> = ({ title, onPress, disabled, variant = 'primary', small, a11yLabel }) => {
  const bg =
    variant === 'primary' ? theme.color.primary :
    variant === 'danger' ? theme.color.danger :
    variant === 'success' ? theme.color.success :
    variant === 'warning' ? theme.color.warning :
    variant === 'pill' ? theme.color.pill : 'transparent';

  const fg =
    variant === 'primary' ? theme.color.primaryFg :
    variant === 'ghost' || variant === 'outline' ? theme.color.text :
    variant === 'pill' ? theme.color.text : '#0B0C10';

  const border =
    variant === 'outline' ? theme.color.outline :
    variant === 'ghost' ? 'transparent' :
    variant === 'pill' ? 'transparent' : bg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel || title}
      android_ripple={{ color: '#2b2f44' }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          paddingHorizontal: small ? theme.space(3) : theme.space(4),
          paddingVertical: small ? theme.space(2) : theme.space(3),
          borderRadius: variant === 'pill' ? 999 : theme.radius.sm,
          opacity: disabled ? 0.5 : 1,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? theme.font.small : theme.font.body }}>{title}</Text>
    </Pressable>
  );
};

// ---------- Chips / Segments ----------
export const Segments: React.FC<{
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}> = ({ value, options, onChange }) => (
  <Row gap={2} wrap>
    {options.map(o => {
      const selected = o.value === value;
      return (
        <Button
          key={o.value}
          title={o.label}
          variant="pill"
          small
          onPress={() => onChange(o.value)}
        />
      );
    })}
  </Row>
);
