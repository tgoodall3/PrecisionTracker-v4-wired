
import React, { useEffect, useState, createContext, useContext, useRef, useCallback, useMemo } from 'react';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {Text, TextInput, FlatList, TouchableOpacity, SafeAreaView, Alert, Image, ScrollView, RefreshControl, ActivityIndicator, Modal, useWindowDimensions, Linking, Share } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as SQLite from 'expo-sqlite';
import Svg, { Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { Platform, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Buffer } from 'buffer';
// import * as SQLite from 'expo-sqlite';


const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
// const db = SQLite.openDatabase('offline.db');

// function initDB(){
//   db.transaction(tx => {
//     tx.executeSql('CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, payload TEXT);');
//     tx.executeSql('CREATE TABLE IF NOT EXISTS uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, dataUrl TEXT);');
//     tx.executeSql('CREATE TABLE IF NOT EXISTS leads_cache (id INTEGER PRIMARY KEY, description TEXT, status TEXT);');
//   });
// }

function initOfflineTables(database){
  try {
    if (!database || typeof database.transaction !== 'function') return;
    database.transaction(tx => {
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, payload TEXT);');
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, dataUrl TEXT);');
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS leads_cache (id INTEGER PRIMARY KEY, description TEXT, status TEXT);');
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS jobs_cache (id INTEGER PRIMARY KEY, name TEXT, status TEXT, startDate TEXT, endDate TEXT, notes TEXT);');
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS tasks_cache (id INTEGER PRIMARY KEY, jobId INTEGER, title TEXT, status TEXT, dueDate TEXT);');
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS calendar_cache (id INTEGER PRIMARY KEY, jobId INTEGER, title TEXT, startAt TEXT, endAt TEXT);');
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS estimates_cache (id INTEGER PRIMARY KEY, leadId INTEGER, subtotal REAL, taxRate REAL, total REAL, status TEXT);');
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS estimate_items_cache (id INTEGER PRIMARY KEY, estimateId INTEGER, description TEXT, qty REAL, unitPrice REAL);');
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS change_orders_cache (id INTEGER PRIMARY KEY, jobId INTEGER, title TEXT, amountDelta REAL, status TEXT);');
      tx.executeSql && tx.executeSql('CREATE TABLE IF NOT EXISTS users_cache (id INTEGER PRIMARY KEY, email TEXT, fullName TEXT, role TEXT);');
    });
  } catch (e) {
    // best-effort; avoid noisy alerts in offline mode
  }
}

let db;
export function getDb() {
  if (db) return db;

  // Web: safe no-op DB
  if (Platform.OS === 'web') {
    db = {
      transaction: (fn) => fn({ executeSql: () => {} }),
      execAsync: async () => {},
      runAsync: async () => {},
    };
    return db;
  }

  // SDK 51+: prefer sync, then async; DO NOT reference openDatabase (removed)
  if ('openDatabaseSync' in SQLite) {
    db = SQLite.openDatabaseSync('offline.db');
    return db;
  }

  if ('openDatabaseAsync' in SQLite) {
    // Minimal adapter so existing code won't crash; refactor later if needed
    db = {
      transaction: (fn) => fn({ executeSql: () => {} }),
      execAsync: async () => {},
      runAsync: async () => {},
    };
    return db;
  }

  // Safety fallback
  db = {
    transaction: (fn) => fn({ executeSql: () => {} }),
    execAsync: async () => {},
    runAsync: async () => {},
  };
  return db;
}

// DB handle
const dbHandle = getDb();
initOfflineTables(dbHandle);

// ---------- Helpers ----------
const normalizeRole = (role) => {
  if (!role) return 'TECH';
  const r = String(role).toUpperCase();
  if (['ADMIN','ESTIMATOR','SUPERVISOR','TECH'].includes(r)) return r;
  if (r === 'STANDARD' || r === 'USER') return 'TECH';
  return r;
};

const AuthContext = createContext(null);
function useAuth(){ return useContext(AuthContext); }
async function api(path, method='GET', body, token){
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  };
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    throw new Error(networkError?.message || 'Network request failed');
  }

  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();
  let data = null;

  if (rawBody) {
    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = rawBody;
      }
    } else {
      data = rawBody;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      (typeof data === 'string' ? data : 'Request failed');
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    error.body = rawBody;
    error.path = path;
    throw error;
  }

  return data;
}

// ---------- Design tokens ----------
const palette = {
  background: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceMuted: '#E2E8F0',
  border: '#CBD5E1',
  text: '#0F172A',
  muted: '#475569',
  primary: '#10B981',
  primaryStrong: '#047857',
  success: '#10B981',
  warning: '#FACC15',
  danger: '#EF4444',
  info: '#0EA5E9',
  ink: '#0F172A',
};

const defaultTagSeeds = ['Urgent', 'Follow-up', 'Inspection', 'Warranty', 'Priority', 'Safety', 'Internal'];

const spacing = (step = 1) => step * 8;

const typography = {
  h1: 24,
  h2: 18,
  body: 15,
  small: 12,
};

const lineHeightFor = (fontSize) => Math.round(fontSize * 1.5);
const defaultLineHeight = lineHeightFor(typography.body);
if (!Text.defaultProps) Text.defaultProps = {};
Text.defaultProps.style = {
  ...(Text.defaultProps.style || {}),
  lineHeight: defaultLineHeight,
  fontFamily: Platform.select({ ios: 'Inter', android: 'Inter', default: 'Inter' }),
  color: palette.text,
};

const floatingShadow = Platform.select({
  ios: { shadowColor: palette.ink, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2 },
  default: {},
});

const pillTone = {
  NEW: { fg: palette.info, bg: '#E0F2FE', label: 'New' },
  CONTACTED: { fg: palette.primaryStrong, bg: '#DCFCE7', label: 'Contacted' },
  ESTIMATING: { fg: '#92400E', bg: '#FEF3C7', label: 'Estimating' },
  CONVERTED: { fg: palette.success, bg: '#DCFCE7', label: 'Converted' },
  CLOSED_LOST: { fg: palette.muted, bg: '#E2E8F0', label: 'Lost' },
  SCHEDULED: { fg: palette.primaryStrong, bg: '#D1FAE5', label: 'Scheduled' },
  IN_PROGRESS: { fg: palette.info, bg: '#E0F2FE', label: 'In progress' },
  COMPLETED: { fg: palette.success, bg: '#DCFCE7', label: 'Completed' },
  COMPLETE: { fg: palette.success, bg: '#DCFCE7', label: 'Complete' },
  DONE: { fg: palette.success, bg: '#DCFCE7', label: 'Complete' },
  ON_HOLD: { fg: '#92400E', bg: '#FEF3C7', label: 'On hold' },
  CANCELLED: { fg: palette.muted, bg: '#E2E8F0', label: 'Cancelled' },
  DRAFT: { fg: palette.muted, bg: '#E2E8F0', label: 'Draft' },
  SENT: { fg: palette.info, bg: '#E0F2FE', label: 'Sent' },
  PART_PAID: { fg: '#92400E', bg: '#FEF3C7', label: 'Part paid' },
  PAID: { fg: palette.success, bg: '#DCFCE7', label: 'Paid' },
  VOID: { fg: palette.muted, bg: '#F8FAFC', label: 'Void' },
};

const toneMap = {
  primary: { fg: palette.primaryStrong, bg: '#ECFDF5' },
  success: { fg: palette.success, bg: '#DCFCE7' },
  warning: { fg: '#92400E', bg: '#FEF3C7' },
  danger: { fg: palette.danger, bg: '#FEE2E2' },
  info: { fg: palette.info, bg: '#E0F2FE' },
};

const formInputBaseStyle = {
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: 12,
  paddingVertical: spacing(1.5),
  paddingHorizontal: spacing(2),
  color: palette.text,
  backgroundColor: palette.surfaceMuted,
  fontSize: typography.body,
  marginBottom: spacing(1.5),
};

const FormInput = React.forwardRef((props, ref) => (
  <TextInput
    ref={ref}
    placeholderTextColor={palette.muted}
    {...props}
    style={[formInputBaseStyle, props.style]}
  />
));
FormInput.displayName = 'FormInput';

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  if (Number.isNaN(amount)) return '$0';
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const isTaskCompleted = (status) => {
  if (!status) return false;
  const key = String(status).toUpperCase();
  return key === 'DONE' || key === 'COMPLETE';
};

function SurfaceCard({ children, style, onPress }) {
  const content = (
    <View
      style={[
        { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: spacing(2) },
        floatingShadow,
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

function StatusPill({ status }) {
  if (!status) return null;
  const key = String(status).toUpperCase();
  const cfg = pillTone[key] || { fg: palette.muted, bg: '#e2e8f0', label: status };
  return (
    <View style={{ backgroundColor: cfg.bg, borderRadius: 999, paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.5) }}>
      <Text style={{ color: cfg.fg, fontSize: typography.small, fontWeight: '600' }}>{cfg.label}</Text>
    </View>
  );
}

function SummaryCard({ title, value, subtitle, tone = 'primary', onPress }) {
  const colors = toneMap[tone] || toneMap.primary;
  return (
    <SurfaceCard
      onPress={onPress}
      style={{ backgroundColor: colors.bg, borderColor: 'transparent', padding: spacing(2.5) }}
    >
      <Text style={{ color: palette.muted, fontSize: typography.small, textTransform: 'uppercase', fontWeight: '700', lineHeight: lineHeightFor(typography.small) }}>{title}</Text>
      <Text style={{ color: colors.fg, fontSize: 28, fontWeight: '800', marginTop: spacing(0.5), lineHeight: lineHeightFor(28) }}>{value}</Text>
      {subtitle ? <Text style={{ color: palette.muted, fontSize: typography.small, marginTop: spacing(0.5), lineHeight: lineHeightFor(typography.small) }}>{subtitle}</Text> : null}
    </SurfaceCard>
  );
}

function StatusCard({ label, value, description, tone = 'primary' }) {
  const colors = toneMap[tone] || toneMap.primary;
  return (
    <SurfaceCard
      style={{
        backgroundColor: colors.bg,
        borderColor: 'transparent',
        borderWidth: 1,
        paddingVertical: spacing(2),
        paddingHorizontal: spacing(2.5),
        flexGrow: 1,
        flexBasis: '48%',
      }}
    >
      <Text style={{ color: colors.fg, fontSize: typography.small, fontWeight: '700', textTransform: 'uppercase', lineHeight: lineHeightFor(typography.small) }}>{label}</Text>
      <Text style={{ color: palette.text, fontSize: 24, fontWeight: '700', marginTop: spacing(0.5), lineHeight: lineHeightFor(24) }}>{value}</Text>
      {description ? <Text style={{ color: palette.muted, fontSize: typography.small, marginTop: spacing(0.5), lineHeight: lineHeightFor(typography.small) }}>{description}</Text> : null}
    </SurfaceCard>
  );
}

function TagInput({ value = [], onChange, placeholder = 'Add tag', suggestions = [] }) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const tags = useMemo(() => {
    if (!Array.isArray(value)) return [];
    return value.filter(Boolean).map(tag => String(tag));
  }, [value]);
  const cleanTag = useCallback((input) => {
    if (!input) return null;
    const cleaned = String(input).replace(/[#]/g, '').trim();
    if (!cleaned) return null;
    return cleaned.replace(/\s+/g, ' ');
  }, []);
  const handleChangeText = useCallback((text) => {
    setDraft(text);
    setFocused(true);
  }, []);
  const normalizedSuggestions = useMemo(() => {
const library = new Set();
    (Array.isArray(suggestions) ? suggestions : []).forEach(seed => {
      const cleaned = cleanTag(seed);
      if (cleaned) library.add(cleaned);
    });
    tags.forEach(tag => library.add(String(tag)));
    return Array.from(library);
  }, [suggestions, tags, cleanTag]);
  const availableSuggestions = useMemo(
    () =>
      normalizedSuggestions.filter(
        suggestion => !tags.some(tag => tag.toLowerCase() === suggestion.toLowerCase())
      ),
    [normalizedSuggestions, tags]
  );
  const filteredSuggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    const results = query
      ? availableSuggestions.filter(suggestion =>
          suggestion.toLowerCase().includes(query)
        )
      : availableSuggestions;
    return results.slice(0, 6);
  }, [availableSuggestions, draft]);
  const shouldShowSuggestions = focused && filteredSuggestions.length > 0;
  const handleAdd = useCallback(() => {
    const cleaned = cleanTag(draft);
    if (!cleaned) return;
    const exists = tags.some(existing => existing.toLowerCase() === cleaned.toLowerCase());
    if (exists) {
      setDraft('');
      return;
    }
    onChange && onChange([...tags, cleaned]);
    setDraft('');
    setFocused(false);
  }, [draft, tags, cleanTag, onChange]);
  const handleSubmit = useCallback(() => {
    handleAdd();
  }, [handleAdd]);
  const handleRemove = useCallback((tag) => {
    const next = tags.filter(entry => entry !== tag);
    onChange && onChange(next);
  }, [tags, onChange]);
  const handleSelectSuggestion = useCallback((tag) => {
    const cleaned = cleanTag(tag);
    if (!cleaned) return;
    const exists = tags.some(existing => existing.toLowerCase() === cleaned.toLowerCase());
    if (!exists) {
      onChange && onChange([...tags, cleaned]);
    }
    setDraft('');
    setFocused(false);
  }, [tags, onChange, cleanTag]);
  const handleBlur = useCallback(() => {
    setTimeout(() => setFocused(false), 120);
  }, []);
  return (
    <View>
      {tags.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing(1), rowGap: spacing(1), marginBottom: spacing(1) }}>
          {tags.map(tag => (
            <TouchableOpacity
              key={tag}
              onPress={() => handleRemove(tag)}
              activeOpacity={0.8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#d9f2ed',
                borderRadius: 999,
                paddingHorizontal: spacing(1.5),
                paddingVertical: spacing(0.5),
              }}
            >
              <Text style={{ color: palette.primaryStrong, fontWeight: '600', fontSize: typography.small }}>{`#${tag}`}</Text>
              <Text style={{ color: palette.primaryStrong, marginLeft: spacing(0.5), fontSize: typography.small }}>×</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: spacing(1) }}>
        <TextInput
          value={draft}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmit}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          style={[formInputBaseStyle, { flex: 1, marginBottom: 0 }]}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
        />
        <QuickAction label="Add" onPress={handleAdd} tone="primary" />
      </View>
      {shouldShowSuggestions ? (
        <View style={{ marginTop: spacing(1), borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: palette.surface }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight: '600', paddingHorizontal: spacing(1.5), paddingTop: spacing(1.25) }}>Suggestions</Text>
          {filteredSuggestions.map(suggestion => (
            <TouchableOpacity
              key={suggestion}
              onPress={() => handleSelectSuggestion(suggestion)}
              activeOpacity={0.85}
              style={{ paddingVertical: spacing(1.1), paddingHorizontal: spacing(1.5) }}
            >
              <Text style={{ color: palette.primaryStrong, fontWeight: '600' }}>{`#${suggestion}`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1.5) }}>
      <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight: '700', lineHeight: lineHeightFor(typography.h2) }}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={{ paddingHorizontal: spacing(1), paddingVertical: spacing(0.5) }}>
          <Text style={{ color: palette.primary, fontWeight: '600', fontSize: typography.small, lineHeight: lineHeightFor(typography.small) }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function QuickAction({ label, onPress, tone = 'primary' }) {
  const toneStyles = (() => {
    switch (tone) {
      case 'danger':
        return { borderColor: '#FECACA', backgroundColor: '#FEE2E2', textColor: palette.danger };
      case 'success':
        return { borderColor: '#A7F3D0', backgroundColor: '#DCFCE7', textColor: palette.success };
      case 'warning':
        return { borderColor: '#FDE68A', backgroundColor: '#FEF9C3', textColor: '#92400E' };
      case 'muted':
        return { borderColor: palette.border, backgroundColor: palette.surface, textColor: palette.muted };
      default:
        return { borderColor: palette.primary, backgroundColor: '#ECFDF5', textColor: palette.primaryStrong };
    }
  })();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        borderRadius: 10,
        paddingHorizontal: spacing(1.5),
        paddingVertical: spacing(0.75),
        borderWidth: 1,
        borderColor: toneStyles.borderColor,
        backgroundColor: toneStyles.backgroundColor,
      }}
    >
      <Text style={{ color: toneStyles.textColor, fontWeight: '600', fontSize: typography.small, lineHeight: lineHeightFor(typography.small) }}>{label}</Text>
    </TouchableOpacity>
  );
}

const toInputDate = (dateValue) => {
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseInputDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const deriveLeadTitle = (lead) => {
  if (!lead) return 'Untitled lead';
  const customerName = lead.Customer?.name;
  if (customerName && customerName.trim()) return customerName.trim();
  if (lead.description && lead.description.trim()) {
    const firstLine = lead.description.trim().split('\n')[0];
    return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
  }
  return `Lead ${lead.id}`;
};

function DateInputField({ value, onChange, placeholder = 'Select date', minimumDate, maximumDate, style }) {
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const isWeb = Platform.OS === 'web';

  const toDateOnly = (input) => {
    if (!input) return '';
    if (input instanceof Date) return toInputDate(input);
    if (typeof input === 'string') {
      const [datePart] = input.split('T');
      return datePart;
    }
    return '';
  };

  const normalizedValue = toDateOnly(value);
  const minDateString = minimumDate ? toDateOnly(minimumDate) : undefined;
  const maxDateString = maximumDate ? toDateOnly(maximumDate) : undefined;
  const parsed = parseInputDate(normalizedValue) || new Date();
  const displayLabel = value ? (formatDate(value) || normalizedValue) : '';

  const applyDate = (selectedDate) => {
    if (!selectedDate) return;
    onChange(toInputDate(selectedDate));
  };

  const handleManualChange = (text) => {
    if (!text) {
      onChange('');
      return;
    }
    onChange(text);
  };

  const openPicker = () => {
    if (isWeb) return;
    const baseDate = parseInputDate(normalizedValue) || new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: baseDate,
        mode: 'date',
        minimumDate: minimumDate ? parseInputDate(minimumDate) || undefined : undefined,
        maximumDate: maximumDate ? parseInputDate(maximumDate) || undefined : undefined,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) applyDate(selected);
        },
      });
    } else {
      setIosPickerVisible(true);
    }
  };

  const containerStyle = [
    { marginBottom: spacing(1.5) },
    style,
  ];

  if (isWeb) {
    return (
      <View style={containerStyle}>
        <TextInput
          value={normalizedValue}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          onChangeText={handleManualChange}
          onChange={event => handleManualChange(event?.nativeEvent?.text ?? event?.target?.value ?? '')}
          style={[formInputBaseStyle, { marginBottom: 0 }]}
          type="date"
          min={minDateString}
          max={maxDateString}
        />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <TouchableOpacity
        onPress={openPicker}
        activeOpacity={0.85}
        style={{
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: 12,
          backgroundColor: palette.surfaceMuted,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing(2),
          paddingVertical: spacing(1.5),
        }}
      >
        <Text style={{ flex: 1, color: displayLabel ? palette.text : palette.muted, fontSize: typography.body }}>
          {displayLabel || placeholder}
        </Text>
        <Text style={{ fontSize: typography.h2 - 6, color: palette.muted }}>CAL</Text>
      </TouchableOpacity>
      {Platform.OS === 'ios' && iosPickerVisible ? (
        <DateTimePicker
          value={parsed}
          mode="date"
          display="inline"
          onChange={(event, selected) => {
            if (event.type === 'set' && selected) {
              applyDate(selected);
            }
            if (event.type === 'dismissed') {
              setIosPickerVisible(false);
              return;
            }
            setIosPickerVisible(false);
          }}
          style={{ marginTop: spacing(1) }}
          minimumDate={minimumDate ? parseInputDate(minimumDate) || undefined : undefined}
          maximumDate={maximumDate ? parseInputDate(maximumDate) || undefined : undefined}
        />
      ) : null}
    </View>
  );
}

const TECH_ASSIGN_ROLES = ['TECH','SUPERVISOR','ESTIMATOR'];

function TechSelector({ team = [], value, onSelect, label, allowAllRoles, allowClear }) {
  const options = useMemo(() => {
    const normalized = team.map(member => ({
      ...member,
      role: normalizeRole(member.role),
    }));
    if (allowAllRoles) return normalized;
    return normalized.filter(member => TECH_ASSIGN_ROLES.includes(member.role));
  }, [team, allowAllRoles]);

  if (!options.length) return null;

  const renderLabel = label ? (
    <Text style={{ color: palette.muted, fontSize: typography.small, marginBottom: spacing(1) }}>{label}</Text>
  ) : null;

  return (
    <View style={{ marginTop: spacing(1.5) }}>
      {renderLabel}
      <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1) }}>
        {options.map(member => {
          const selected = member.id === value;
          const displayName = member.fullName || member.email;
          const shortLabel = displayName.length > 22 ? `${displayName.slice(0, 21)}...` : displayName;
          return (
            <QuickAction
              key={member.id}
              label={shortLabel}
              tone={selected ? 'primary' : 'muted'}
              onPress={() => onSelect(member.id)}
            />
          );
        })}
        {allowClear ? <QuickAction label="Clear" tone="muted" onPress={() => onSelect(null)} /> : null}
      </View>
    </View>
  );
}

function DashboardScreen({ navigation }) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leads, setLeads] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const isAdmin = (user?.role || '').toUpperCase() === 'ADMIN';

  const jobLookup = useMemo(() => {
    const map = {};
    for (const job of jobs) {
      if (job?.id != null) {
        map[job.id] = job;
      }
    }
    return map;
  }, [jobs]);

  const loadData = useCallback(async (isPullRefresh = false) => {
    if (!token) return;
    isPullRefresh ? setRefreshing(true) : setLoading(true);

    const fetchLeads = async () => {
      try {
        const data = await api('/leads', 'GET', null, token);
        const filtered = data.filter(item => (item.status || '').toUpperCase() !== 'CONVERTED');
        setLeads(filtered);
        db.transaction(tx => {
          tx.executeSql && tx.executeSql('DELETE FROM leads_cache;');
          filtered.forEach(l =>
            tx.executeSql && tx.executeSql(
              'INSERT OR REPLACE INTO leads_cache (id, description, status) VALUES (?,?,?)',
              [l.id, l.description || '', l.status || 'NEW']
            )
          );
        });
        return data;
      } catch (e) {
        return await new Promise(resolve => {
          db.transaction(tx =>
            tx.executeSql && tx.executeSql(
              'SELECT id, description, status FROM leads_cache',
              [],
              (_, { rows }) => {
                const fallback = (rows?._array || []).filter(item => (item.status || '').toUpperCase() !== 'CONVERTED');
                setLeads(fallback);
                resolve(fallback);
              }
            )
          );
        });
      }
    };

    const fetchJobs = async () => {
      try {
        const data = await api('/jobs', 'GET', null, token);
        setJobs(data);
        db.transaction(tx => {
          tx.executeSql && tx.executeSql('DELETE FROM jobs_cache;');
          data.forEach(j =>
            tx.executeSql && tx.executeSql(
              'INSERT OR REPLACE INTO jobs_cache (id, name, status, startDate, endDate, notes) VALUES (?,?,?,?,?,?)',
              [j.id, j.name || '', j.status || 'SCHEDULED', j.startDate || '', j.endDate || '', j.notes || '']
            )
          );
        });
        return data;
      } catch (e) {
        return await new Promise(resolve => {
          db.transaction(tx =>
            tx.executeSql && tx.executeSql(
              'SELECT id, name, status, startDate, endDate, notes FROM jobs_cache',
              [],
              (_, { rows }) => {
                const fallback = rows?._array || [];
                setJobs(fallback);
                resolve(fallback);
              }
            )
          );
        });
      }
    };

    const fetchTasks = async () => {
      try {
        const data = await api('/tasks', 'GET', null, token);
        setTasks(data);
        db.transaction(tx => {
          data.forEach(t =>
            tx.executeSql && tx.executeSql(
              'INSERT OR REPLACE INTO tasks_cache (id, jobId, title, status, dueDate) VALUES (?,?,?,?,?)',
              [t.id, t.jobId || null, t.title || '', t.status || 'TODO', t.dueDate || '']
            )
          );
        });
        return data;
      } catch (e) {
        return await new Promise(resolve => {
          db.transaction(tx =>
            tx.executeSql && tx.executeSql(
              'SELECT id, jobId, title, status, dueDate FROM tasks_cache ORDER BY id DESC',
              [],
              (_, { rows }) => {
                const fallback = rows?._array || [];
                setTasks(fallback);
                resolve(fallback);
              }
            )
          );
        });
      }
    };

    const fetchInvoiceSummary = async () => {
      try {
        const data = await api('/invoices/summary', 'GET', null, token);
        setInvoiceSummary(data);
        return data;
      } catch (e) {
        return null;
      }
    };

    try {
      await Promise.all([fetchLeads(), fetchJobs(), fetchTasks(), fetchInvoiceSummary()]);
      setLastUpdated(new Date());
    } finally {
      isPullRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [loadData])
  );

  const onRefresh = useCallback(() => loadData(true), [loadData]);

  const newLeads = leads.filter(l => (l.status || '').toUpperCase() === 'NEW').length;
  const activeJobs = jobs.filter(j => ['SCHEDULED', 'IN_PROGRESS'].includes((j.status || '').toUpperCase())).length;
  const openTasks = tasks.filter(t => !isTaskCompleted(t.status)).length;
  const outstandingValue = invoiceSummary?.outstanding || 0;
  const collectedValue = invoiceSummary?.collected || 0;
  const overdueCount = invoiceSummary?.overdueCount || 0;
  const overdueTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter(task => {
      if (!task?.dueDate || isTaskCompleted(task.status)) return false;
      const due = new Date(task.dueDate);
      if (Number.isNaN(due.getTime())) return false;
      return due < today;
    }).length;
  }, [tasks]);
  const statusCards = useMemo(() => [
    {
      label: 'Active',
      value: String(activeJobs),
      description: 'Jobs in progress or scheduled',
      tone: 'primary',
    },
    {
      label: 'Pending',
      value: formatCurrency(outstandingValue),
      description: 'Unpaid invoices',
      tone: 'warning',
    },
    {
      label: 'Paid',
      value: formatCurrency(collectedValue),
      description: 'Collected to date',
      tone: 'success',
    },
    {
      label: 'Overdue',
      value: String(overdueTasks),
      description: `Tasks overdue; ${overdueCount} invoices late`,
      tone: 'danger',
    },
  ], [activeJobs, outstandingValue, collectedValue, overdueTasks, overdueCount]);
  const downloadReport = useCallback(async (format = 'csv') => {
    const endpoint = format === 'quickbooks' ? '/invoices/export/quickbooks' : '/invoices/export/csv';
    const filename = `precision-report-${Date.now()}.${format === 'quickbooks' ? 'iif' : 'csv'}`;
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || 'Unable to download report.');
      const extension = format === 'quickbooks' ? 'iif' : 'csv';
      const mimeType = format === 'quickbooks' ? 'text/plain' : 'text/csv';

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const blob = new Blob([text], { type: mimeType });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = filename;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          Alert.alert('Download started', `Look for ${filename} in your browser downloads.`);
        } catch (shareError) {
          Alert.alert('Download ready', `Save this file manually: ${filename}`);
        }
        return;
      }

      if (!FileSystem?.cacheDirectory) throw new Error('Storage unavailable');
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
      const sharingSupported = Sharing?.isAvailableAsync ? await Sharing.isAvailableAsync() : false;
      if (sharingSupported) {
        await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: filename });
      } else {
        try {
          await Share.share({
            message: `Precision Tracker report ready: ${filename}`,
            url: fileUri,
            title: filename,
          });
        } catch {
          Alert.alert('Report saved', `File stored at ${fileUri}.`);
          return;
        }
        Alert.alert('Report saved', `If you skipped sharing, find it at ${fileUri}.`);
      }
    } catch (error) {
      Alert.alert('Download failed', error?.message || 'Unable to download report.');
    }
  }, [token]);

  const topLeads = leads.slice(0, 3);
  const topJobs = jobs.slice(0, 3);
  const nextTasks = tasks.filter(t => !isTaskCompleted(t.status)).slice(0, 3);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
      >
        <View style={{ marginBottom: spacing(3) }}>
          <View style={{ width: spacing(5), height: spacing(5), borderRadius: 14, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(1.5) }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: typography.h2 }}>PT</Text>
          </View>
          <Text style={{ color: palette.ink, fontSize: 30, fontWeight: '800', lineHeight: lineHeightFor(30) }}>Precision Tracker</Text>
          <Text style={{ color: palette.muted, fontSize: typography.body, marginTop: spacing(0.5), lineHeight: lineHeightFor(typography.body) }}>
            Built for crews who don’t miss details.
          </Text>
          <Text style={{ color: palette.muted, fontSize: typography.body, marginTop: spacing(0.5), lineHeight: lineHeightFor(typography.body) }}>
            Stay on track, every job.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing(1.5), rowGap: spacing(1.5), marginBottom: spacing(3) }}>
          <QuickAction label="New job" onPress={() => navigation.navigate('Jobs', { focus: 'create-job' })} />
          <QuickAction label="New lead" onPress={() => navigation.navigate('NewLead')} />
          {isAdmin ? (
            <>
              <QuickAction label="Create invoice" tone="success" onPress={() => navigation.navigate('Invoices')} />
              <QuickAction tone="muted" label="Export CSV" onPress={() => downloadReport('csv')} />
              <QuickAction tone="muted" label="QuickBooks export" onPress={() => downloadReport('quickbooks')} />
            </>
          ) : null}
        </View>

        <View style={{ marginBottom: spacing(3) }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight: '600', marginBottom: spacing(0.5), lineHeight: lineHeightFor(typography.small) }}>
            Executive pulse
          </Text>
          <Text style={{ color: palette.muted, fontSize: typography.body, marginBottom: spacing(1.5), lineHeight: lineHeightFor(typography.body) }}>
            Know what’s running smoothly and what needs attention before wheels come off.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing(1.5), rowGap: spacing(1.5) }}>
            {statusCards.map(card => (
              <StatusCard
                key={card.label}
                label={card.label}
                value={card.value}
                description={card.description}
                tone={card.tone}
              />
            ))}
          </View>
        </View>

        <View style={{ marginBottom: spacing(3) }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight: '600', marginBottom: spacing(0.5), lineHeight: lineHeightFor(typography.small) }}>
            Pipeline snapshot
          </Text>
          <Text style={{ color: palette.muted, fontSize: typography.body, marginBottom: spacing(1.5), lineHeight: lineHeightFor(typography.body) }}>
            Stay ahead of demand by keeping leads, jobs, tasks, and invoices moving.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing(1.5), rowGap: spacing(1.5) }}>
            <View style={{ flexBasis: '48%', minWidth: 160 }}>
              <SummaryCard
                title="Leads"
                value={leads.length}
                subtitle={`${newLeads} new to triage`}
                tone="info"
                onPress={() => navigation.navigate('Leads')}
              />
            </View>
            <View style={{ flexBasis: '48%', minWidth: 160 }}>
              <SummaryCard
                title="Jobs"
                value={jobs.length}
                subtitle={`${activeJobs} active`}
                tone="primary"
                onPress={() => navigation.navigate('Jobs')}
              />
            </View>
            <View style={{ flexBasis: '48%', minWidth: 160 }}>
              <SummaryCard
                title="Tasks"
                value={openTasks}
                subtitle={`${overdueTasks} overdue • ${tasks.length} total`}
                tone="warning"
                onPress={() => navigation.navigate('Jobs')}
              />
            </View>
            <View style={{ flexBasis: '48%', minWidth: 160 }}>
              <SummaryCard
                title="Invoices"
                value={formatCurrency(outstandingValue)}
                subtitle={`${overdueCount} overdue | ${formatCurrency(collectedValue)} collected`}
                tone="success"
                onPress={() => navigation.navigate('Invoices')}
              />
            </View>
          </View>
        </View>

        {loading && !refreshing ? (
          <SurfaceCard style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing(6) }}>
            <ActivityIndicator color={palette.primary} />
            <Text style={{ color: palette.muted, marginTop: spacing(1.5) }}>Loading summary...</Text>
          </SurfaceCard>
        ) : null}

        <SectionHeader title="Next Jobs" actionLabel="View all" onAction={() => navigation.navigate('Jobs')} />
        <SurfaceCard style={{ marginBottom: spacing(3) }}>
          {topJobs.length === 0 ? (
            <Text style={{ color: palette.muted }}>No jobs yet. Create one from the Jobs tab.</Text>
          ) : (
            topJobs.map((job, idx) => {
              const startLabel = job.startDate ? `Start ${formatDate(job.startDate)}` : null;
              const endLabel = job.endDate ? `Due ${formatDate(job.endDate)}` : null;
              return (
                <View key={job.id || idx} style={{ marginBottom: idx === topJobs.length - 1 ? 0 : spacing(2.5) }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight: '600' }}>{job.name || `Job #${job.id}`}</Text>
                    <StatusPill status={job.status || 'SCHEDULED'} />
                  </View>
                  {startLabel || endLabel ? (
                    <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>
                      {[startLabel, endLabel].filter(Boolean).join(' - ')}
                    </Text>
                  ) : null}
                  {job.notes ? (
                    <Text style={{ color: palette.muted, marginTop: spacing(1) }} numberOfLines={2}>{job.notes}</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', columnGap: spacing(1.5), marginTop: spacing(1.5) }}>
                    <QuickAction label="Open job" onPress={() => navigation.navigate('JobDetail', { jobId: job.id })} />
                    <QuickAction label="Tasks" onPress={() => navigation.navigate('JobDetail', { jobId: job.id, tab: 'tasks' })} />
                  </View>
                </View>
              );
            })
          )}
        </SurfaceCard>

        <SectionHeader title="Hot Leads" actionLabel="Leads" onAction={() => navigation.navigate('Leads')} />
        <SurfaceCard style={{ marginBottom: spacing(3) }}>
          {topLeads.length === 0 ? (
            <Text style={{ color: palette.muted }}>No leads yet. Capture leads to keep the funnel full.</Text>
        ) : (
          topLeads.map((lead, idx) => (
            <View key={lead.id || idx} style={{ marginBottom: idx === topLeads.length - 1 ? 0 : spacing(2) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: palette.text, fontWeight: '600', fontSize: typography.h2 }}>{deriveLeadTitle(lead)}</Text>
                <StatusPill status={lead.status || 'NEW'} />
              </View>
              <Text style={{ color: palette.muted, marginTop: spacing(0.5) }} numberOfLines={3}>
                {lead.description || 'No scope captured yet.'}
              </Text>
                <View style={{ flexDirection: 'row', columnGap: spacing(1.5), marginTop: spacing(1.5) }}>
                  <QuickAction label="Follow up" onPress={() => navigation.navigate('EstimateEditor', { leadId: lead.id })} />
                  <QuickAction label="Open lead" tone="muted" onPress={() => navigation.navigate('Leads')} />
                </View>
              </View>
            ))
          )}
        </SurfaceCard>

        <SectionHeader title="Open Tasks" actionLabel="Jobs" onAction={() => navigation.navigate('Jobs')} />
        <SurfaceCard>
          {nextTasks.length === 0 ? (
            <Text style={{ color: palette.muted }}>All clear. Add tasks from a job to keep crews aligned.</Text>
          ) : (
            nextTasks.map((task, idx) => (
              <View key={task.id || idx} style={{ marginBottom: idx === nextTasks.length - 1 ? 0 : spacing(2) }}>
                <Text style={{ color: palette.text, fontWeight: '600' }}>{task.title || 'Task'}</Text>
                {task.jobId ? (
                  <Text style={{ color: palette.muted, marginTop: spacing(0.25) }}>
                    {jobLookup[task.jobId]?.name || `Job #${task.jobId}`}
                  </Text>
                ) : (
                  <Text style={{ color: palette.muted, marginTop: spacing(0.25) }}>Unassigned job</Text>
                )}
                <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>
                  {task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}
                </Text>
                <View style={{ flexDirection: 'row', columnGap: spacing(1.5), marginTop: spacing(1.5) }}>
                  <QuickAction
                    label="Mark done"
                    onPress={() => navigation.navigate('JobDetail', { jobId: task.jobId })}
                  />
                  <QuickAction
                    label="View job"
                    onPress={() => navigation.navigate('JobDetail', { jobId: task.jobId })}
                  />
                </View>
              </View>
            ))
          )}
        </SurfaceCard>

        {lastUpdated ? (
          <Text style={{ color: palette.muted, fontSize: typography.small, marginTop: spacing(2), textAlign: 'center' }}>
            Updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Signature Pad to PNG ----------
function SignaturePad({ onCapturePng }){
  const [points, setPoints] = useState([]);
  const [path, setPath] = useState('');
  const shotRef = useRef(null);
  return (
    <ViewShot ref={shotRef} options={{ format: 'png', quality: 0.9, result: 'base64' }} style={{ height:220, borderWidth:1, backgroundColor:'#fff' }}>
      <View
        onStartShouldSetResponder={()=>true}
        onResponderMove={(e)=>{
          const x = e.nativeEvent.locationX, y = e.nativeEvent.locationY;
          setPath(p => p + (p ? ` L ${x} ${y}` : ` M ${x} ${y}`));
        }}
        onResponderRelease={async ()=>{
          const base64 = await shotRef.current.capture();
          onCapturePng && onCapturePng('data:image/png;base64,' + base64);
        }}
        style={{ flex:1 }}
      >
        <Svg height="100%" width="100%"><Path d={path} stroke="black" strokeWidth="2" fill="none" /></Svg>
      </View>
    </ViewShot>
  );
}

function SignatureScreen({ route, navigation }){
  const { token } = useAuth();
  const { estimateId } = route.params;
  const [sigPng, setSigPng] = useState(null);
  const save = async () => {
    if(!sigPng){ Alert.alert('Please sign first'); return; }
    const resp = await api(`/estimates/${estimateId}/approve`, 'POST', { signaturePngUrl: sigPng }, token);
    Alert.alert('Approved', `Payment link:
${(resp && resp.paymentLink) ? resp.paymentLink : 'Unavailable'}`); navigation.goBack();
  };
  return (
    <SafeAreaView style={{ padding:16 }}>
      <Text style={{ fontSize:18, marginBottom:8 }}>Sign Estimate #{estimateId}</Text>
      <SignaturePad onCapturePng={setSigPng} />
      <View style={{ height:12 }} />
      <TouchableOpacity
        onPress={save}
        activeOpacity={0.85}
        style={{ backgroundColor: palette.primary, paddingVertical: spacing(1.5), borderRadius: 12, alignItems: 'center' }}
      >
        <Text style={{ color:'#FFFFFF', fontWeight:'700' }}>Save signature</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ---------- Admin: Users ----------
const userRoleOptions = [
  { label: 'Admin', value: 'ADMIN' },
  { label: 'Estimator', value: 'ESTIMATOR' },
  { label: 'Supervisor', value: 'SUPERVISOR' },
  { label: 'Tech', value: 'TECH' },
];

const invoiceStatusOptions = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PART_PAID', label: 'Part paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'VOID', label: 'Void' },
];

function UsersAdminScreen(){
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('TECH');
  const [inviting, setInviting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api('/users','GET',null,token);
      setUsers(Array.isArray(response) ? response : []);
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to load users.');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEmail('');
    setFullName('');
    setRole('TECH');
  };

  const invite = async ()=>{
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    if (!trimmedEmail) {
      Alert.alert('Missing email', 'Enter an email address to invite a user.');
      return;
    }
    try {
      setInviting(true);
      const result = await api('/users','POST', { email: trimmedEmail, fullName: trimmedName || undefined, role: normalizeRole(role) }, token);
      resetForm();
      await load();
      const inviteInfo = result?.invitation;
      const tempPassword = result?.temporaryPassword;
      if (inviteInfo?.sent) {
        Alert.alert('Invite sent', `${trimmedEmail} will receive login instructions shortly.`);
      } else if (inviteInfo?.mock) {
        Alert.alert(
          'Invite ready',
          `Email delivery is disabled in this environment. Share this temporary password: ${tempPassword || 'Set via admin'}.`
        );
      } else if (tempPassword) {
        Alert.alert('Invite created', `Share this temporary password with ${trimmedEmail}: ${tempPassword}`);
      } else {
        Alert.alert('Invite created', `${trimmedEmail} is ready to sign in.`);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to send invite.');
    } finally {
      setInviting(false);
    }
  };

  const promote = async (id, newRole)=>{
    try {
      await api(`/users/${id}`,'PATCH',{ role: normalizeRole(newRole) }, token);
      await load();
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to update role.');
    }
  };

  const remove = (id) => {
    Alert.alert('Remove user', 'Are you sure you want to remove this person?', [
      { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/users/${id}`,'DELETE',null,token);
              await load();
              Alert.alert('Removed', 'User access revoked.');
            } catch (e) {
              Alert.alert('Error', e.message || 'Unable to delete user.');
            }
          }
        }
    ]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const renderRolePill = (value) => {
    const roleCfg = userRoleOptions.find(option => option.value === normalizeRole(value));
    const label = roleCfg ? roleCfg.label : normalizeRole(value);
    return (
      <View style={{ backgroundColor: '#e0f3f0', paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.5), borderRadius: 999 }}>
        <Text style={{ color: palette.primaryStrong, fontWeight:'600', fontSize: typography.small }}>{label}</Text>
      </View>
    );
  };

  const renderRoleSelector = (selectedRole, onSelect) => (
    <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1) }}>
      {userRoleOptions.map(option => {
        const selected = selectedRole === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onSelect(option.value)}
            activeOpacity={0.85}
            style={{
              paddingHorizontal: spacing(2),
              paddingVertical: spacing(1),
              borderRadius: 999,
              borderWidth: 1,
              borderColor: selected ? palette.primary : palette.border,
              backgroundColor: selected ? '#d9f2ed' : palette.surface,
            }}
          >
            <Text style={{ color: selected ? palette.primaryStrong : palette.muted, fontWeight:'600', fontSize: typography.small }}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.background }}>
      <FlatList
        data={users}
        keyExtractor={u=>String(u.id)}
        contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(6) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
        ListHeaderComponent={(
          <View>
            <Text style={{ color: palette.text, fontSize: typography.h1, fontWeight:'700', marginBottom: spacing(2) }}>Team management</Text>
            <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
              <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700' }}>Invite teammate</Text>
              <Text style={{ color: palette.muted, marginTop: spacing(0.5), marginBottom: spacing(2) }}>
                Send an invite email and choose what they can access.
              </Text>
              <FormInput
                placeholder="Full name (optional)"
                value={fullName}
                onChangeText={setFullName}
              />
              <FormInput
                placeholder="Work email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Text style={{ color: palette.muted, fontWeight:'600', fontSize: typography.small, textTransform:'uppercase', marginBottom: spacing(1) }}>Role</Text>
              {renderRoleSelector(role, setRole)}
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: spacing(2) }}>
                <QuickAction label="Clear" tone="muted" onPress={resetForm} />
                <TouchableOpacity
                  onPress={invite}
                  activeOpacity={0.85}
                  disabled={inviting}
                  style={{
                    backgroundColor: palette.primary,
                    paddingHorizontal: spacing(2.5),
                    paddingVertical: spacing(1.5),
                    borderRadius: 12,
                    opacity: inviting ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color:'#fff', fontWeight:'700' }}>{inviting ? 'Sending...' : 'Send invite'}</Text>
                </TouchableOpacity>
              </View>
            </SurfaceCard>
          </View>
        )}
        ListEmptyComponent={(
          <SurfaceCard>
            <Text style={{ color: palette.muted }}>Invite your first teammate to collaborate on jobs.</Text>
          </SurfaceCard>
        )}
        renderItem={({item}) => {
          const normalizedRole = normalizeRole(item.role);
          return (
            <SurfaceCard style={{ marginBottom: spacing(2), padding: spacing(2.5) }}>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: spacing(1.5) }}>
                <View>
                  <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600' }}>{item.fullName || item.email}</Text>
                  <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>{item.email}</Text>
                </View>
                {renderRolePill(normalizedRole)}
              </View>
              <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1) }}>
                {userRoleOptions.map(option => {
                  const selected = normalizedRole === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => promote(item.id, option.value)}
                      disabled={selected}
                      activeOpacity={0.85}
                      style={{
                        paddingHorizontal: spacing(1.75),
                        paddingVertical: spacing(0.75),
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected ? palette.primary : palette.border,
                        backgroundColor: selected ? '#d9f2ed' : palette.surface,
                        opacity: selected ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ color: selected ? palette.primaryStrong : palette.muted, fontWeight:'600', fontSize: typography.small }}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => remove(item.id)}
                  activeOpacity={0.85}
                  style={{
                    paddingHorizontal: spacing(1.75),
                    paddingVertical: spacing(0.75),
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: '#fecdd3',
                    backgroundColor: '#fee2e2',
                  }}
                >
                  <Text style={{ color: palette.danger, fontWeight:'600', fontSize: typography.small }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </SurfaceCard>
          );
        }}
      />
    </SafeAreaView>
  );
}

// ---------- Jobs Kanban + Change Orders ----------
function InvoicesScreen({ navigation }){
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [newInvoiceJobId, setNewInvoiceJobId] = useState('');
  const [newInvoiceAmount, setNewInvoiceAmount] = useState('');
  const [newInvoiceIssuedAt, setNewInvoiceIssuedAt] = useState('');
  const [newInvoiceDueAt, setNewInvoiceDueAt] = useState('');
  const [newInvoiceStatus, setNewInvoiceStatus] = useState('DRAFT');
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const [summaryData, list] = await Promise.all([
        api('/invoices/summary', 'GET', null, token),
        api('/invoices', 'GET', null, token),
      ]);
      setSummary(summaryData);
      setInvoices(list);
    } catch (e) {
      // keep prior data on failure
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    if (user?.role === 'ADMIN') {
      load(false);
    }
  }, [load, user?.role]));

  const onRefresh = useCallback(() => load(true), [load]);
  const nextInvoiceNumber = useMemo(() => {
    if (!Array.isArray(invoices) || invoices.length === 0) {
      return 'INV-0001';
    }
    const maxNumber = invoices.reduce((acc, inv) => {
      const match = String(inv.number || '').match(/(\d+)$/);
      if (match) {
        return Math.max(acc, parseInt(match[1], 10));
      }
      if (inv.id) {
        return Math.max(acc, Number(inv.id));
      }
      return acc;
    }, 0);
    const next = maxNumber + 1;
    return `INV-${String(next).padStart(4, '0')}`;
  }, [invoices]);
  const downloadReport = useCallback(async (format = 'csv') => {
    const endpoint = format === 'quickbooks' ? '/invoices/export/quickbooks' : '/invoices/export/csv';
    const filename = `precision-report-${Date.now()}.${format === 'quickbooks' ? 'iif' : 'csv'}`;
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || 'Unable to download report.');
      const extension = format === 'quickbooks' ? 'iif' : 'csv';
      const mimeType = format === 'quickbooks' ? 'text/plain' : 'text/csv';

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const blob = new Blob([text], { type: mimeType });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = filename;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          Alert.alert('Download started', `Look for ${filename} in your browser downloads.`);
        } catch (shareError) {
          Alert.alert('Download ready', `Save this file manually: ${filename}`);
        }
        return;
      }

      if (!FileSystem?.cacheDirectory) throw new Error('Storage unavailable');
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
      const sharingSupported = Sharing?.isAvailableAsync ? await Sharing.isAvailableAsync() : false;
      if (sharingSupported) {
        await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: filename });
      } else {
        try {
          await Share.share({
            message: `Precision Tracker report ready: ${filename}`,
            url: fileUri,
            title: filename,
          });
        } catch {
          Alert.alert('Report saved', `File stored at ${fileUri}.`);
          return;
        }
        Alert.alert('Report saved', `If you skipped sharing, find it at ${fileUri}.`);
      }
    } catch (error) {
      Alert.alert('Download failed', error?.message || 'Unable to download report.');
    }
  }, [token]);
  const prepareInvoicePdf = useCallback(async (invoiceId) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const endpoint = `${API_URL}/pdf/invoice/${invoiceId}`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const response = await fetch(endpoint, { method: 'GET', headers });
      const ok = response.ok;
      const blob = await response.blob();
      if (!ok) throw new Error('Unable to download invoice PDF.');
      const url = URL.createObjectURL(blob);
      return {
        uri: url,
        cleanup: () => setTimeout(() => URL.revokeObjectURL(url), 4000),
      };
    }

    if (!FileSystem?.cacheDirectory) throw new Error('Storage unavailable');
    const targetPath = `${FileSystem.cacheDirectory}invoice-${invoiceId}-${Date.now()}.pdf`;

    if (typeof FileSystem.downloadAsync === 'function') {
      const result = await FileSystem.downloadAsync(endpoint, targetPath, { headers });
      if (result?.status && result.status >= 400) {
        throw new Error('Unable to download invoice PDF.');
      }
      return {
        uri: result.uri,
        cleanup: () => {},
      };
    }

    const response = await fetch(endpoint, { method: 'GET', headers });
    const buffer = await response.arrayBuffer();
    if (!response.ok) throw new Error('Unable to download invoice PDF.');
    const base64 = Buffer.from(buffer).toString('base64');
    await FileSystem.writeAsStringAsync(targetPath, base64, { encoding: FileSystem.EncodingType.Base64 });
    return {
      uri: targetPath,
      cleanup: () => {},
    };
  }, [token]);

  const shareInvoicePdf = useCallback(async (invoice) => {
    try {
      const payload = await prepareInvoicePdf(invoice.id);
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.open(payload.uri, '_blank', 'noopener,noreferrer');
          Alert.alert('PDF opened', 'A new browser tab should display the invoice.');
        } else {
          const sharingSupported = Sharing?.isAvailableAsync ? await Sharing.isAvailableAsync() : false;
          if (sharingSupported) {
            await Sharing.shareAsync(payload.uri, {
              mimeType: 'application/pdf',
              dialogTitle: `Invoice ${invoice.number || invoice.id}`,
            });
          } else {
            try {
              await Share.share({
                title: `Invoice ${invoice.number || invoice.id}`,
                message: `Invoice ${invoice.number || invoice.id} ready.`,
                url: payload.uri,
              });
            } catch {
              Alert.alert('PDF saved', `Invoice stored at ${payload.uri}.`);
            }
          }
        }
      } finally {
        payload.cleanup?.();
      }
    } catch (error) {
      Alert.alert('PDF unavailable', error?.message || 'Unable to prepare invoice PDF.');
    }
  }, [prepareInvoicePdf]);

  const printInvoicePdf = useCallback(async (invoice) => {
    try {
      const payload = await prepareInvoicePdf(invoice.id);
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const printWindow = window.open(payload.uri, '_blank', 'noopener,noreferrer');
          if (printWindow) {
            printWindow.onload = () => {
              printWindow.focus();
              printWindow.print();
            };
          } else {
            Alert.alert('Print blocked', 'Allow pop-ups to print this invoice.');
          }
        } else if (Print?.printAsync) {
          await Print.printAsync({ uri: payload.uri });
        } else {
          Alert.alert('Print unavailable', 'Printing is not supported in this environment.');
        }
      } finally {
        payload.cleanup?.();
      }
    } catch (error) {
      Alert.alert('Print failed', error?.message || 'Unable to send invoice to printer.');
    }
  }, [prepareInvoicePdf]);

  const resetInvoiceForm = useCallback(() => {
    setNewInvoiceJobId('');
    setNewInvoiceAmount('');
    setNewInvoiceIssuedAt('');
    setNewInvoiceDueAt('');
    setNewInvoiceStatus('DRAFT');
  }, []);

  const createInvoice = useCallback(async () => {
    const amountValue = parseFloat(newInvoiceAmount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      Alert.alert('Missing amount', 'Enter a valid invoice amount.');
      return;
    }
    const jobIdTrimmed = newInvoiceJobId.trim();
    const jobIdValue = jobIdTrimmed ? parseInt(jobIdTrimmed, 10) : null;
    if (jobIdTrimmed && Number.isNaN(jobIdValue)) {
      Alert.alert('Invalid job', 'Job ID must be a number.');
      return;
    }
    const payload = {
      amount: amountValue,
      status: newInvoiceStatus,
      number: nextInvoiceNumber || undefined,
      jobId: jobIdValue || undefined,
      issuedAt: newInvoiceIssuedAt || null,
      dueAt: newInvoiceDueAt || null,
    };
    try {
      setCreatingInvoice(true);
      const created = await api('/invoices', 'POST', payload, token);
      resetInvoiceForm();
      await load(false);
      Alert.alert('Invoice created', `${created?.number || payload.number || 'Invoice'} saved.`);
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to create invoice.');
    } finally {
      setCreatingInvoice(false);
    }
  }, [
    newInvoiceAmount,
    newInvoiceStatus,
    newInvoiceJobId,
    newInvoiceIssuedAt,
    newInvoiceDueAt,
    token,
    load,
    resetInvoiceForm,
    nextInvoiceNumber,
  ]);

  const deleteInvoice = useCallback((invoice) => {
    Alert.alert('Delete invoice', `Delete invoice #${invoice.number || invoice.id}?`, [
      { text:'Cancel', style:'cancel' },
        {
          text:'Delete',
          style:'destructive',
          onPress: async () => {
            try {
              await api(`/invoices/${invoice.id}`, 'DELETE', null, token);
              await load(false);
              Alert.alert('Deleted', 'Invoice removed.');
            } catch (e) {
              if (e?.status === 404) {
                setInvoices(prev => prev.filter(item => Number(item.id) !== Number(invoice.id)));
                await load(false);
                Alert.alert('Already removed', 'Invoice was already deleted.');
              } else {
                Alert.alert('Error', e.message || 'Unable to delete invoice.');
              }
            }
          }
        }
    ]);
  }, [token, load, setInvoices]);

  if (user?.role !== 'ADMIN') {
    return (
      <SafeAreaView style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor: palette.background }}>
        <Text style={{ color: palette.muted }}>Invoices are only available to admin users.</Text>
      </SafeAreaView>
    );
  }

  const filters = [
    { key:'ALL', label:'All' },
    { key:'OUTSTANDING', label:'Outstanding' },
    { key:'PAID', label:'Paid' },
  ];

  const filteredInvoices = invoices.filter(inv => {
    if (filter === 'ALL') return true;
    const status = (inv.status || 'DRAFT').toUpperCase();
    if (filter === 'PAID') return status === 'PAID';
    return !['PAID','VOID'].includes(status);
  });

  const outstanding = formatCurrency(summary?.outstanding || 0);
  const collected = formatCurrency(summary?.collected || 0);
  const drafts = formatCurrency(summary?.draftAmount || 0);

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(6) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
      >
        <Text style={{ color: palette.text, fontSize: typography.h1, fontWeight:'700', marginBottom: spacing(2) }}>Invoices</Text>
        <Text style={{ color: palette.muted, marginBottom: spacing(2) }}>Track billing health and spot overdue balances.</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginBottom: spacing(2) }}>
          <QuickAction tone="muted" label="Export CSV" onPress={() => downloadReport('csv')} />
          <QuickAction tone="muted" label="QuickBooks export" onPress={() => downloadReport('quickbooks')} />
        </View>
        <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
          <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700' }}>Create invoice</Text>
          <Text style={{ color: palette.muted, marginTop: spacing(0.5), marginBottom: spacing(2) }}>
            Capture billing details and keep your accounts current.
          </Text>
          <View style={{ marginBottom: spacing(1.5) }}>
            <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase' }}>Invoice number</Text>
            <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginTop: spacing(0.5) }}>{nextInvoiceNumber}</Text>
          </View>
          <FormInput
            placeholder="Job ID (optional)"
            value={newInvoiceJobId}
            onChangeText={setNewInvoiceJobId}
            keyboardType="number-pad"
          />
          <FormInput
            placeholder="Amount $"
            value={newInvoiceAmount}
            onChangeText={setNewInvoiceAmount}
            keyboardType="decimal-pad"
          />
          <View style={{ flexDirection:'row', columnGap: spacing(1.5) }}>
            <View style={{ flex:1 }}>
              <DateInputField value={newInvoiceIssuedAt} onChange={setNewInvoiceIssuedAt} placeholder="Issued date" style={{ marginBottom: 0 }} />
            </View>
            <View style={{ flex:1 }}>
              <DateInputField value={newInvoiceDueAt} onChange={setNewInvoiceDueAt} placeholder="Due date (optional)" style={{ marginBottom: 0 }} />
            </View>
          </View>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase', marginTop: spacing(2), marginBottom: spacing(1) }}>Status</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1) }}>
            {invoiceStatusOptions.map(option => {
              const selected = option.value === newInvoiceStatus;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setNewInvoiceStatus(option.value)}
                  activeOpacity={0.85}
                  style={{
                    paddingHorizontal: spacing(2),
                    paddingVertical: spacing(1),
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? palette.primary : palette.border,
                    backgroundColor: selected ? '#d9f2ed' : palette.surface,
                  }}
                >
                  <Text style={{ color: selected ? palette.primaryStrong : palette.muted, fontWeight:'600', fontSize: typography.small }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: spacing(2) }}>
            <QuickAction label="Reset" tone="muted" onPress={resetInvoiceForm} />
            <TouchableOpacity
              onPress={createInvoice}
              activeOpacity={0.85}
              disabled={creatingInvoice}
              style={{
                backgroundColor: palette.primary,
                paddingHorizontal: spacing(2.5),
                paddingVertical: spacing(1.5),
                borderRadius: 12,
                opacity: creatingInvoice ? 0.6 : 1,
              }}
            >
              <Text style={{ color:'#fff', fontWeight:'700' }}>{creatingInvoice ? 'Saving...' : 'Create invoice'}</Text>
            </TouchableOpacity>
          </View>
        </SurfaceCard>

        <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(2), rowGap: spacing(2), marginBottom: spacing(3) }}>
          <View style={{ flexBasis:'48%', minWidth: 160 }}>
            <SummaryCard title="Outstanding" value={outstanding} subtitle={`${summary?.overdueCount || 0} overdue`} tone="warning" />
          </View>
          <View style={{ flexBasis:'48%', minWidth: 160 }}>
            <SummaryCard title="Collected" value={collected} subtitle="All payments to date" tone="success" />
          </View>
          <View style={{ flexBasis:'48%', minWidth: 160 }}>
            <SummaryCard title="Drafts" value={drafts} subtitle={`${summary?.totalCount || 0} total invoices`} tone="info" />
          </View>
        </View>

        <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginBottom: spacing(2) }}>
          {filters.map(f => {
            const selected = f.key === filter;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.85}
                style={{
                  paddingHorizontal: spacing(2),
                  paddingVertical: spacing(1),
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? palette.primary : palette.border,
                  backgroundColor: selected ? '#d9f2ed' : palette.surface,
                }}
              >
                <Text style={{ color: selected ? palette.primaryStrong : palette.muted, fontWeight:'600', fontSize: typography.small }}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <SurfaceCard style={{ alignItems:'center', paddingVertical: spacing(6) }}>
            <ActivityIndicator color={palette.primary} />
            <Text style={{ color: palette.muted, marginTop: spacing(1.5) }}>Loading invoices...</Text>
          </SurfaceCard>
        ) : filteredInvoices.length === 0 ? (
          <SurfaceCard>
            <Text style={{ color: palette.muted }}>No invoices match this filter.</Text>
          </SurfaceCard>
        ) : (
          filteredInvoices.map(inv => {
            const payments = (inv.Payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const amount = Number(inv.amount || 0);
            const balance = Math.max(amount - payments, 0);
            const statusKey = (inv.status || 'DRAFT').toUpperCase();
            return (
              <SurfaceCard key={inv.id}>
                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                  <View>
                    <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600' }}>Invoice #{inv.number || inv.id}</Text>
                    <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>Issued {inv.issuedAt ? formatDate(inv.issuedAt) : 'TBD'}</Text>
                  </View>
                  <StatusPill status={statusKey} />
                </View>
                <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop: spacing(1.5) }}>
                  <View>
                    <Text style={{ color: palette.muted, fontSize: typography.small }}>Amount</Text>
                    <Text style={{ color: palette.text, fontWeight:'600' }}>{formatCurrency(amount)}</Text>
                  </View>
                  <View>
                    <Text style={{ color: palette.muted, fontSize: typography.small }}>Collected</Text>
                    <Text style={{ color: palette.text }}>{formatCurrency(payments)}</Text>
                  </View>
                  <View>
                    <Text style={{ color: palette.muted, fontSize: typography.small }}>Balance</Text>
                    <Text style={{ color: balance > 0 ? palette.primaryStrong : palette.muted, fontWeight:'600' }}>{formatCurrency(balance)}</Text>
                  </View>
                </View>
                {inv.dueAt ? (
                  <Text style={{ color: palette.muted, marginTop: spacing(1) }}>Due {formatDate(inv.dueAt)}</Text>
                ) : null}
                <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(2) }}>
                  <QuickAction tone="muted" label="Share PDF" onPress={() => shareInvoicePdf(inv)} />
                  <QuickAction tone="muted" label="Print" onPress={() => printInvoicePdf(inv)} />
                  {inv.jobId ? <QuickAction label="View job" onPress={() => navigation.navigate('JobDetail', { jobId: inv.jobId })} tone="muted" /> : null}
                  <QuickAction label="Record payment" tone="success" onPress={() => Alert.alert('Coming soon', 'Payment logging will land shortly.')} />
                  <QuickAction label="Delete" tone="danger" onPress={() => deleteInvoice(inv)} />
                </View>
              </SurfaceCard>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
function JobsKanbanScreen({ navigation, route }){
  const { token } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newJobName, setNewJobName] = useState('');
  const [newJobStartDate, setNewJobStartDate] = useState('');
  const [newJobDueDate, setNewJobDueDate] = useState('');
  const [newJobNotes, setNewJobNotes] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newAddressLine1, setNewAddressLine1] = useState('');
  const [newAddressLine2, setNewAddressLine2] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newStateCode, setNewStateCode] = useState('');
  const [newZip, setNewZip] = useState('');
  const [jobFormTab, setJobFormTab] = useState('BASICS');
  const [newJobTags, setNewJobTags] = useState([]);
  const statusOrder = ['NEW','SCHEDULED','IN_PROGRESS','ON_HOLD','COMPLETED','DONE','PAID','CANCELLED','CLOSED'];
  const scrollRef = useRef(null);
  const [selectedTag, setSelectedTag] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedUrgency, setSelectedUrgency] = useState('ALL');
  const jobTagSuggestions = useMemo(() => {
    const library = new Set(defaultTagSeeds);
    jobs.forEach(job => {
      (Array.isArray(job.tags) ? job.tags : []).forEach(tag => library.add(String(tag)));
    });
    return Array.from(library);
  }, [jobs]);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await api('/jobs','GET',null,token);
      setJobs(data);
      db.transaction(tx => {
        tx.executeSql && tx.executeSql('DELETE FROM jobs_cache;');
        data.forEach(j => tx.executeSql && tx.executeSql(
          'INSERT OR REPLACE INTO jobs_cache (id, name, status, startDate, endDate, notes) VALUES (?,?,?,?,?,?)',
          [j.id, j.name||'', j.status||'SCHEDULED', j.startDate||'', j.endDate||'', j.notes||'']
        ));
      });
    } catch(e) {
      db.transaction(tx =>
        tx.executeSql && tx.executeSql(
          'SELECT id, name, status, startDate, endDate, notes FROM jobs_cache',
          [],
          (_, { rows }) => setJobs(rows._array || [])
        )
      );
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );
  useEffect(() => {
    if (route?.params?.focus === 'create-job') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setJobFormTab('BASICS');
      if (navigation && typeof navigation.setParams === 'function') {
        navigation.setParams({ focus: undefined });
      }
    }
  }, [route?.params?.focus, navigation]);
  const availableTags = useMemo(() => {
    const set = new Set();
    jobs.forEach(job => {
      const tags = Array.isArray(job.tags) ? job.tags : [];
      tags.forEach(tag => {
        if (tag) set.add(String(tag));
      });
    });
    return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [jobs]);
  const availableCities = useMemo(() => {
    const set = new Set();
    jobs.forEach(job => {
      const city = job?.Jobsite?.city;
      if (city) set.add(String(city).trim());
    });
    return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [jobs]);
  const urgencyFilters = useMemo(() => ([
    { key: 'ALL', label: 'All' },
    { key: 'UPCOMING', label: 'Starting soon' },
    { key: 'OVERDUE', label: 'Past due' },
  ]), []);
  const filteredJobsRaw = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return jobs.filter(job => {
      if (selectedTag) {
        const tags = Array.isArray(job.tags) ? job.tags : [];
        const hasTag = tags.some(tag => String(tag).toLowerCase() === selectedTag.toLowerCase());
        if (!hasTag) return false;
      }
      if (selectedCity) {
        const city = job?.Jobsite?.city ? String(job.Jobsite.city) : '';
        if (city.toLowerCase() !== selectedCity.toLowerCase()) return false;
      }
      if (selectedUrgency === 'UPCOMING') {
        if (!job.startDate) return false;
        const start = new Date(job.startDate);
        if (Number.isNaN(start.getTime())) return false;
        const diff = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
        if (diff < 0 || diff > 3) return false;
      } else if (selectedUrgency === 'OVERDUE') {
        if (!job.endDate) return false;
        const due = new Date(job.endDate);
        if (Number.isNaN(due.getTime())) return false;
        if (due >= today) return false;
      }
      return true;
    });
  }, [jobs, selectedTag, selectedCity, selectedUrgency]);
  const hasFilters = useMemo(() => Boolean(selectedTag || selectedCity || selectedUrgency !== 'ALL'), [selectedTag, selectedCity, selectedUrgency]);
  const clearFilters = useCallback(() => {
    setSelectedTag(null);
    setSelectedCity(null);
    setSelectedUrgency('ALL');
  }, []);

  const onRefresh = useCallback(() => load(true), [load]);

  const resetForm = () => {
    setNewJobName('');
    setNewJobStartDate('');
    setNewJobDueDate('');
    setNewJobNotes('');
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerEmail('');
    setNewAddressLine1('');
    setNewAddressLine2('');
    setNewCity('');
    setNewStateCode('');
    setNewZip('');
    setNewJobTags([]);
    setJobFormTab('BASICS');
  };

  const createJob = async () => {
    if(!newJobName.trim()){
      Alert.alert('Missing info', 'Please add a job name.');
      setJobFormTab('BASICS');
      return;
    }
    const hasCustomer = [newCustomerName, newCustomerPhone, newCustomerEmail].some(v => v && v.trim());
    const hasAddress = [newAddressLine1, newCity, newStateCode, newZip].some(v => v && v.trim());
    const payload = {
      name: newJobName.trim(),
      status: 'NEW',
      startDate: newJobStartDate || null,
      endDate: newJobDueDate || null,
      notes: newJobNotes.trim() || null,
      tags: newJobTags.filter(Boolean),
    };
    if (hasCustomer) {
      payload.customer = {
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        email: newCustomerEmail.trim(),
        billingAddress: newAddressLine1
          ? `${newAddressLine1}${newAddressLine2 ? `
${newAddressLine2}` : ''}${newCity ? `
${newCity}, ${newStateCode} ${newZip}` : ''}`
          : null,
      };
    }
    if (hasAddress) {
      payload.jobsite = {
        addressLine1: newAddressLine1.trim(),
        addressLine2: newAddressLine2.trim(),
        city: newCity.trim(),
        state: newStateCode.trim(),
        zip: newZip.trim(),
      };
    }
    try {
      const created = await api('/jobs','POST', payload, token);
      setJobs(prev => [created, ...prev]);
      db.transaction(tx =>
        tx.executeSql && tx.executeSql(
          'INSERT OR REPLACE INTO jobs_cache (id, name, status, startDate, endDate, notes) VALUES (?,?,?,?,?,?)',
          [created.id, created.name||'', created.status||'SCHEDULED', created.startDate||'', created.endDate||'', created.notes||'']
        )
      );
      resetForm();
      Alert.alert('Job created', `Job #${created.id} ready to schedule.`);
    } catch(e) {
      Alert.alert('Error', e.message || 'Unable to create job');
    }
  };

  const updateJobStatus = async (id, status) => {
    try {
      const updated = await api(`/jobs/${id}`,'PATCH',{ status }, token);
      setJobs(prev => prev.map(job => job.id === id ? updated : job));
    } catch(e) {
      Alert.alert('Error', e.message || 'Unable to update job status');
    }
  };

  const removeJob = useCallback((id) => {
    Alert.alert('Delete Job', `Delete job #${id}?`, [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async () => {
        try {
          await api(`/jobs/${id}`,'DELETE',null,token);
          setJobs(prev => prev.filter(job => Number(job.id) !== Number(id)));
          db.transaction(tx => tx.executeSql && tx.executeSql('DELETE FROM jobs_cache WHERE id=?', [id]));
          Alert.alert('Deleted', 'Job removed.');
          await load(false);
        } catch(e) {
          if (e?.status === 404) {
            setJobs(prev => prev.filter(job => Number(job.id) !== Number(id)));
            db.transaction(tx => tx.executeSql && tx.executeSql('DELETE FROM jobs_cache WHERE id=?', [id]));
            await load(false);
            Alert.alert('Already removed', 'Job was already deleted.');
          } else {
            Alert.alert('Error', e.message || 'Unable to delete job');
          }
        }
      } }
    ]);
  }, [token, load]);

  const sortedJobs = useMemo(() => {
    const normalize = (status) => (status || 'SCHEDULED').toUpperCase();
    const rank = (status) => {
      const key = normalize(status);
      const idx = statusOrder.indexOf(key);
      return idx === -1 ? statusOrder.length : idx;
    };
    const parseDateSafe = (value) => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    return [...filteredJobsRaw].sort((a, b) => {
      const statusDiff = rank(a.status) - rank(b.status);
      if (statusDiff !== 0) return statusDiff;
      const startA = parseDateSafe(a.startDate);
      const startB = parseDateSafe(b.startDate);
      if (startA && startB) return startA - startB;
      if (startA) return -1;
      if (startB) return 1;
      return (b.id || 0) - (a.id || 0);
    });
  }, [filteredJobsRaw, statusOrder]);

  const groupedJobs = useMemo(() => {
    const groups = [];
    let currentStatus = null;
    sortedJobs.forEach(job => {
      const statusKey = (job.status || 'SCHEDULED').toUpperCase();
      if (statusKey !== currentStatus) {
        groups.push({ status: statusKey, jobs: [job] });
        currentStatus = statusKey;
      } else {
        groups[groups.length - 1].jobs.push(job);
      }
    });
    return groups;
  }, [sortedJobs]);

  const statusLabel = (status) => {
    const key = (status || 'SCHEDULED').toUpperCase();
    return pillTone[key]?.label || key.charAt(0) + key.slice(1).toLowerCase();
  };

  const quickStatusActions = [
    { label:'Start job', value:'IN_PROGRESS', tone:'primary' },
    { label:'Mark completed', value:'COMPLETED', tone:'success' },
    { label:'Mark paid', value:'PAID', tone:'success' },
    { label:'Pause', value:'ON_HOLD', tone:'warning' },
  ];

  const inputStyle = {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(1.25),
    backgroundColor: palette.surfaceMuted,
    color: palette.text,
    fontSize: typography.body,
    marginBottom: spacing(1.5),
  };

  const jobTabs = [
    { key:'BASICS', label:'Basics' },
    { key:'CUSTOMER', label:'Customer' },
    { key:'JOBSITE', label:'Jobsite' },
    { key:'NOTES', label:'Notes' },
  ];

  const renderJobFormFields = () => {
    if (jobFormTab === 'BASICS') {
      return (
        <View>
          <TextInput
            placeholder="Job name"
            placeholderTextColor={palette.muted}
            value={newJobName}
            onChangeText={setNewJobName}
            style={inputStyle}
          />
          <DateInputField
            value={newJobStartDate}
            onChange={setNewJobStartDate}
            placeholder="Start date"
          />
          <DateInputField
            value={newJobDueDate}
            onChange={setNewJobDueDate}
            placeholder="Due date"
          />
          <View style={{ marginTop: spacing(1.5) }}>
            <TagInput value={newJobTags} onChange={setNewJobTags} placeholder="Add tags (e.g. HVAC, Urgent)" suggestions={jobTagSuggestions} />
          </View>
        </View>
      );
    }
    if (jobFormTab === 'CUSTOMER') {
      return (
        <View>
          <TextInput
            placeholder="Customer name"
            placeholderTextColor={palette.muted}
            value={newCustomerName}
            onChangeText={setNewCustomerName}
            style={inputStyle}
          />
          <TextInput
            placeholder="Phone"
            placeholderTextColor={palette.muted}
            keyboardType="phone-pad"
            value={newCustomerPhone}
            onChangeText={setNewCustomerPhone}
            style={inputStyle}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor={palette.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            value={newCustomerEmail}
            onChangeText={setNewCustomerEmail}
            style={inputStyle}
          />
        </View>
      );
    }
    if (jobFormTab === 'JOBSITE') {
      return (
        <View>
          <TextInput
            placeholder="Address line 1"
            placeholderTextColor={palette.muted}
            value={newAddressLine1}
            onChangeText={setNewAddressLine1}
            style={inputStyle}
          />
          <TextInput
            placeholder="Address line 2"
            placeholderTextColor={palette.muted}
            value={newAddressLine2}
            onChangeText={setNewAddressLine2}
            style={inputStyle}
          />
          <View style={{ flexDirection:'row', columnGap: spacing(1.5) }}>
            <View style={{ flex:1 }}>
              <TextInput
                placeholder="City"
                placeholderTextColor={palette.muted}
                value={newCity}
                onChangeText={setNewCity}
                style={[inputStyle, { marginBottom: 0 }]}
              />
            </View>
            <View style={{ width: 80 }}>
              <TextInput
                placeholder="State"
                placeholderTextColor={palette.muted}
                value={newStateCode}
                onChangeText={setNewStateCode}
                style={[inputStyle, { marginBottom: 0 }]}
              />
            </View>
            <View style={{ width: 100 }}>
              <TextInput
                placeholder="ZIP"
                placeholderTextColor={palette.muted}
                value={newZip}
                onChangeText={setNewZip}
                style={[inputStyle, { marginBottom: 0 }]}
              />
            </View>
          </View>
        </View>
      );
    }
    return (
      <TextInput
        placeholder="Internal notes"
        placeholderTextColor={palette.muted}
        value={newJobNotes}
        onChangeText={setNewJobNotes}
        multiline
        style={[inputStyle, { minHeight: 96, textAlignVertical: 'top' }]}
      />
    );
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.background }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
      >
        <SurfaceCard style={{ marginBottom: spacing(3), padding: spacing(2.5) }}>
          <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginBottom: spacing(2) }}>Create job</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1.5), marginBottom: spacing(2) }}>
            {jobTabs.map(tab => {
              const selected = tab.key === jobFormTab;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setJobFormTab(tab.key)}
                  activeOpacity={0.85}
                  style={{
                    paddingHorizontal: spacing(2),
                    paddingVertical: spacing(1),
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? palette.primary : palette.border,
                    backgroundColor: selected ? '#d9f2ed' : palette.surface,
                  }}
                >
                  <Text style={{ color: selected ? palette.primaryStrong : palette.muted, fontWeight:'600', fontSize: typography.small }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {renderJobFormFields()}
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: spacing(2) }}>
            <QuickAction label="Reset" tone="muted" onPress={resetForm} />
            <TouchableOpacity
              onPress={createJob}
              activeOpacity={0.85}
              style={{ backgroundColor: palette.primary, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5), borderRadius: 12 }}
            >
              <Text style={{ color:'#fff', fontWeight:'700' }}>Create job</Text>
            </TouchableOpacity>
          </View>
        </SurfaceCard>

        <SurfaceCard style={{ marginBottom: spacing(3), padding: spacing(2.5) }}>
          <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginBottom: spacing(1.5) }}>Filters</Text>
          <Text style={{ color: palette.muted, marginBottom: spacing(1) }}>Urgency</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginBottom: spacing(1.5) }}>
            {urgencyFilters.map(option => (
              <QuickAction
                key={option.key}
                label={option.label}
                tone={selectedUrgency === option.key ? 'primary' : 'muted'}
                onPress={() => setSelectedUrgency(option.key)}
              />
            ))}
          </View>
          {availableTags.length ? (
            <View style={{ marginBottom: spacing(1.5) }}>
              <Text style={{ color: palette.muted, marginBottom: spacing(1) }}>Tags</Text>
              <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1) }}>
                {availableTags.map(tag => (
                  <QuickAction
                    key={tag}
                    label={`#${tag}`}
                    tone={selectedTag === tag ? 'primary' : 'muted'}
                    onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {availableCities.length ? (
            <View>
              <Text style={{ color: palette.muted, marginBottom: spacing(1) }}>Location</Text>
              <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1) }}>
                {availableCities.map(city => (
                  <QuickAction
                    key={city}
                    label={city}
                    tone={selectedCity === city ? 'primary' : 'muted'}
                    onPress={() => setSelectedCity(selectedCity === city ? null : city)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {(selectedTag || selectedCity || selectedUrgency !== 'ALL') ? (
            <View style={{ marginTop: spacing(2) }}>
              <QuickAction label="Clear filters" tone="muted" onPress={clearFilters} />
            </View>
          ) : null}
        </SurfaceCard>

        {loading && !refreshing && jobs.length === 0 ? (
          <SurfaceCard style={{ alignItems:'center', paddingVertical: spacing(6), marginBottom: spacing(3) }}>
            <ActivityIndicator color={palette.primary} />
            <Text style={{ color: palette.muted, marginTop: spacing(1.5) }}>Loading jobs...</Text>
          </SurfaceCard>
        ) : null}

        {groupedJobs.length === 0 ? (
          <SurfaceCard>
            <Text style={{ color: palette.muted }}>
              {hasFilters ? 'No jobs match the current filters.' : 'No jobs yet. Convert a lead or add a job to get started.'}
            </Text>
          </SurfaceCard>
        ) : (
          groupedJobs.map(group => (
            <View key={group.status} style={{ marginBottom: spacing(3) }}>
              <Text style={{ color: palette.muted, fontWeight:'700', fontSize: typography.small, textTransform:'uppercase', marginBottom: spacing(1) }}>
                {statusLabel(group.status)}
              </Text>
              {group.jobs.map(job => {
                const customer = job.Customer || {};
                const jobsite = job.Jobsite || {};
                const addressParts = [
                  jobsite.addressLine1,
                  jobsite.addressLine2,
                  [jobsite.city, jobsite.state].filter(Boolean).join(', '),
                  jobsite.zip
                ].filter(Boolean);
                const address = addressParts.join(', ');
                const statusKey = (job.status || 'SCHEDULED').toUpperCase();
                const assignedTech = job.assignedTech;
                return (
                  <SurfaceCard key={job.id} style={{ marginBottom: spacing(1.5) }}>
                    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                      <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600' }}>{job.name || `Job #${job.id}`}</Text>
                      <StatusPill status={statusKey} />
                    </View>
                    {(job.startDate || job.endDate) ? (
                      <Text style={{ color: palette.muted, marginTop: spacing(0.75) }}>
                        {[job.startDate ? `Start ${formatDate(job.startDate)}` : null, job.endDate ? `Due ${formatDate(job.endDate)}` : null].filter(Boolean).join(' | ')}
                      </Text>
                    ) : null}
                    {customer.name ? <Text style={{ color: palette.text, fontWeight:'600', marginTop: spacing(1) }}>{customer.name}</Text> : null}
                    {customer.phone ? <Text style={{ color: palette.muted }}>{customer.phone}</Text> : null}
                    {customer.email ? <Text style={{ color: palette.muted }}>{customer.email}</Text> : null}
                    {address ? <Text style={{ color: palette.muted, marginTop: spacing(1) }}>{address}</Text> : null}
                    {assignedTech ? (
                      <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>
                        Assigned to {assignedTech.fullName || assignedTech.email || 'Tech'}
                      </Text>
                    ) : null}
                    {job.notes ? <Text style={{ color: palette.muted, marginTop: spacing(1) }} numberOfLines={3}>{job.notes}</Text> : null}
                    {Array.isArray(job.tags) && job.tags.length ? (
                      <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(1) }}>
                        {job.tags.map(tag => (
                          <View
                            key={`${job.id}-${tag}`}
                            style={{ backgroundColor: '#e0f3f0', borderRadius: 999, paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.5) }}
                          >
                            <Text style={{ color: palette.primaryStrong, fontWeight:'600', fontSize: typography.small }}>{`#${tag}`}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(2) }}>
                      {address ? <QuickAction label="Map" tone="muted" onPress={() => openJobInMaps(job)} /> : null}
                      <QuickAction label="View job" onPress={() => navigation.navigate('JobDetail', { jobId: job.id })} tone="muted" />
                      {quickStatusActions.map(action => (
                        action.value === statusKey ? null : (
                          <QuickAction
                            key={action.value}
                            label={action.label}
                            tone={action.tone}
                            onPress={() => updateJobStatus(job.id, action.value)}
                          />
                        )
                      ))}
                      <QuickAction label="Delete" tone="danger" onPress={() => removeJob(job.id)} />
                    </View>
                  </SurfaceCard>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
function JobDetailScreen({ route, navigation }){
  const { jobId } = route.params;
  const { token, user } = useAuth();
  const [jobName, setJobName] = useState('');
  const [jobStartDate, setJobStartDate] = useState('');
  const [jobEndDate, setJobEndDate] = useState('');
  const [jobNotes, setJobNotes] = useState('');
  const [jobCustomerName, setJobCustomerName] = useState('');
  const [jobCustomerPhone, setJobCustomerPhone] = useState('');
  const [jobCustomerEmail, setJobCustomerEmail] = useState('');
  const [jobAddressLine1, setJobAddressLine1] = useState('');
  const [jobAddressLine2, setJobAddressLine2] = useState('');
  const [jobCity, setJobCity] = useState('');
  const [jobStateCode, setJobStateCode] = useState('');
  const [jobZip, setJobZip] = useState('');
  const [jobTags, setJobTags] = useState([]);
  const [assignedTechId, setAssignedTechId] = useState(null);
  const [team, setTeam] = useState([]);
  const [assignedTechName, setAssignedTechName] = useState('');
  const [assigningTech, setAssigningTech] = useState(false);
  const [jobAttachments, setJobAttachments] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [jobActivity, setJobActivity] = useState([]);
  const [newActivityNote, setNewActivityNote] = useState('');
  const [addingActivity, setAddingActivity] = useState(false);
  const [changeOrders, setCO] = useState([]);
  const [title, setTitle] = useState('');
  const [amountDelta, setAmountDelta] = useState('0');
  const [tagSuggestions, setTagSuggestions] = useState(defaultTagSeeds);
  const roleKey = normalizeRole(user?.role);
  const canManageChangeOrders = ['ADMIN','SUPERVISOR','ESTIMATOR'].includes(roleKey);
  const canAssignTech = roleKey === 'ADMIN';
  const loadCO = useCallback(async () => {
    setCO(await api(`/change-orders/job/${jobId}`,'GET',null,token));
  }, [jobId, token]);
  const loadJob = useCallback(async () => {
    try {
      const j = await api(`/jobs/${jobId}`,'GET',null,token);
      setJobName(j.name||'');
      setJobStartDate(j.startDate||'');
      setJobEndDate(j.endDate||'');
      setJobNotes(j.notes||'');
      const customer = j.Customer || {};
      const jobsite = j.Jobsite || {};
      setJobCustomerName(customer.name || '');
      setJobCustomerPhone(customer.phone || '');
      setJobCustomerEmail(customer.email || '');
      setJobAddressLine1(jobsite.addressLine1 || '');
      setJobAddressLine2(jobsite.addressLine2 || '');
      setJobCity(jobsite.city || '');
      setJobStateCode(jobsite.state || '');
      setJobZip(jobsite.zip || '');
      setJobTags(Array.isArray(j.tags) ? j.tags : []);
      setJobActivity(Array.isArray(j.activityLog) ? j.activityLog : []);
      setAssignedTechId(j.assignedTo ?? j.assignedTech?.id ?? null);
      const techLabel = j.assignedTech ? (j.assignedTech.fullName || j.assignedTech.email || `Tech #${j.assignedTech.id}`) : '';
      setAssignedTechName(techLabel);
    } catch(e) {
      if (e?.status === 404) {
        setJobName('');
        setJobStartDate('');
        setJobEndDate('');
        setJobNotes('');
        setJobCustomerName('');
        setJobCustomerPhone('');
        setJobCustomerEmail('');
        setJobAddressLine1('');
        setJobAddressLine2('');
        setJobCity('');
        setJobStateCode('');
        setJobZip('');
        setJobTags([]);
        setJobActivity([]);
        setAssignedTechId(null);
        setAssignedTechName('');
        Alert.alert('Job removed', 'This job no longer exists. Returning to jobs.', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Tabs', { screen: 'Jobs' }),
          },
        ]);
      } else if (e?.message) {
        Alert.alert('Error', e.message);
      } else {
        Alert.alert('Error', 'Unable to load job details.');
      }
    }
  }, [jobId, token, navigation]);
  const loadTeam = useCallback(async () => {
    if (!canAssignTech) return;
    try {
      const data = await api('/users','GET',null,token);
      setTeam(Array.isArray(data) ? data.filter(member => member.active !== false) : []);
    } catch (e) {
      // ignore; admin-only feature
    }
  }, [canAssignTech, token]);
const loadAttachments = useCallback(async () => {
  try {
    setLoadingAttachments(true);
    const response = await api(`/attachments?entityType=JOB&entityId=${jobId}`,'GET',null,token);
    setJobAttachments(Array.isArray(response) ? response : []);
  } catch (e) {
    // ignore best effort offline
  } finally {
    setLoadingAttachments(false);
  }
}, [jobId, token]);
const loadTagLibrary = useCallback(async () => {
  try {
    const [jobsData, leadsData] = await Promise.all([
      api('/jobs','GET',null,token),
      api('/leads','GET',null,token),
    ]);
    const library = new Set(defaultTagSeeds);
    if (Array.isArray(jobsData)) {
      jobsData.forEach(job => {
        (Array.isArray(job.tags) ? job.tags : []).forEach(tag => library.add(String(tag)));
      });
    }
    if (Array.isArray(leadsData)) {
      leadsData.forEach(lead => {
        (Array.isArray(lead.tags) ? lead.tags : []).forEach(tag => library.add(String(tag)));
      });
    }
    setTagSuggestions(Array.from(library));
  } catch {}
}, [token]);
useEffect(()=>{ loadJob(); loadCO(); loadAttachments(); loadTagLibrary(); if (canAssignTech) loadTeam(); },[loadJob, loadCO, loadAttachments, loadTagLibrary, loadTeam, canAssignTech]);
  const addCO = async ()=>{
    if(!title.trim()){
      Alert.alert('Missing info', 'Add a title for the change order.');
      return;
    }
    await api(`/change-orders/job/${jobId}`,'POST',{ title: title.trim(), amountDelta: parseFloat(amountDelta) || 0 }, token);
    setTitle(''); setAmountDelta('0'); loadCO();
  };
  const saveJobDetails = async () => {
    try {
      await api(`/jobs/${jobId}`,'PATCH',{
        name: jobName,
        startDate: jobStartDate || null,
        endDate: jobEndDate || null,
        notes: jobNotes,
        tags: Array.isArray(jobTags) ? jobTags.filter(Boolean) : [],
        assignedTo: assignedTechId || null,
        customer: {
          name: jobCustomerName,
          phone: jobCustomerPhone,
          email: jobCustomerEmail,
          billingAddress: jobAddressLine1 ? `${jobAddressLine1}${jobAddressLine2 ? `
${jobAddressLine2}` : ''}${jobCity ? `
${jobCity}, ${jobStateCode} ${jobZip}` : ''}` : null,
        },
        jobsite: {
          addressLine1: jobAddressLine1,
          addressLine2: jobAddressLine2,
          city: jobCity,
          state: jobStateCode,
        zip: jobZip,
      },
    }, token);
      Alert.alert('Saved', 'Job details updated.');
      navigation.navigate('Tabs', { screen: 'Jobs' });
    } catch(e) {
      Alert.alert('Error', e.message || 'Unable to save job');
    }
  };
  const deleteJob = () => {
    Alert.alert('Delete job', `Delete job #${jobId}?`, [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async ()=>{
        try{
          await api(`/jobs/${jobId}`,'DELETE',null,token);
          db.transaction(tx => tx.executeSql('DELETE FROM jobs_cache WHERE id=?', [jobId]));
          Alert.alert('Deleted', 'Job removed.');
          navigation.navigate('Tabs', { screen:'Jobs' });
        }catch(e){
          if (e?.status === 404) {
            db.transaction(tx => tx.executeSql('DELETE FROM jobs_cache WHERE id=?', [jobId]));
            Alert.alert('Already removed', 'Job was already deleted.');
            navigation.navigate('Tabs', { screen:'Jobs' });
          } else {
            Alert.alert('Error', e.message || 'Unable to delete job');
          }
        }
      }}
    ]);
  };
  const handleAssignTech = useCallback(async (techId) => {
    if (!canAssignTech) return;
    setAssigningTech(true);
    try {
      await api(`/jobs/${jobId}`,'PATCH',{ assignedTo: techId || null }, token);
      setAssignedTechId(techId || null);
      await loadJob();
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to update assignment.');
    } finally {
      setAssigningTech(false);
    }
  }, [canAssignTech, jobId, token, loadJob]);
  const scheduleFollowUp = useCallback(async (channel) => {
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const payload = {};
    if (channel === 'EMAIL') {
      if (!jobCustomerEmail) return false;
      payload.email = jobCustomerEmail;
    }
    if (channel === 'SMS') {
      if (!jobCustomerPhone) return false;
      payload.phone = jobCustomerPhone;
    }
    try {
      await api('/reminders', 'POST', {
        jobId,
        channel,
        template: 'FOLLOW_UP',
        scheduledFor,
        payload,
      }, token);
      return true;
    } catch (error) {
      console.warn('Failed to schedule follow up', error?.message || error);
      return false;
    }
  }, [jobCustomerEmail, jobCustomerPhone, jobId, token]);
  const handleCallCustomer = useCallback(async () => {
    if (!jobCustomerPhone) {
      Alert.alert('Missing phone', 'Add a phone number to call this customer.');
      return;
    }
    await Linking.openURL(`tel:${jobCustomerPhone}`);
    const channel = jobCustomerEmail ? 'EMAIL' : 'SMS';
    const scheduled = await scheduleFollowUp(channel);
    if (scheduled) {
      Alert.alert('Reminder scheduled', 'We will send a branded follow-up in 24 hours.');
    }
  }, [jobCustomerPhone, jobCustomerEmail, scheduleFollowUp]);
  const handleTextCustomer = useCallback(async () => {
    if (!jobCustomerPhone) {
      Alert.alert('Missing phone', 'Add a phone number to text this customer.');
      return;
    }
    const message = `Reminder: Job #${jobId} is scheduled soon.`;
    await Linking.openURL(`sms:${jobCustomerPhone}?body=${encodeURIComponent(message)}`);
    const scheduled = await scheduleFollowUp('SMS');
    if (scheduled) {
      Alert.alert('Reminder scheduled', 'We will automatically follow up with a branded text.');
    }
  }, [jobCustomerPhone, jobId, scheduleFollowUp]);
  const handleEmailCustomer = useCallback(async () => {
    if (!jobCustomerEmail) {
      Alert.alert('Missing email', 'Add an email to message this customer.');
      return;
    }
    const subject = `Job #${jobId} update`;
    const body = `Hi ${jobCustomerName || ''},%0D%0A%0D%0AJust a quick update on your project. Let us know if you have any questions.%0D%0A%0D%0AThanks!`;
    await Linking.openURL(`mailto:${jobCustomerEmail}?subject=${encodeURIComponent(subject)}&body=${body}`);
    const scheduled = await scheduleFollowUp('EMAIL');
    if (scheduled) {
      Alert.alert('Reminder scheduled', 'We will nudge the client with a branded email follow-up.');
    }
  }, [jobCustomerEmail, jobCustomerName, jobId, scheduleFollowUp]);
  const handleOpenJobsiteMap = useCallback(() => {
    const parts = [
      jobAddressLine1?.trim(),
      jobAddressLine2?.trim(),
      [jobCity?.trim(), jobStateCode?.trim()].filter(Boolean).join(' '),
      jobZip?.trim(),
    ].filter(Boolean);
    if (!parts.length) {
      Alert.alert('Missing address', 'Add the jobsite address to open maps.');
      return;
    }
    const address = parts.join(', ');
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
  }, [jobAddressLine1, jobAddressLine2, jobCity, jobStateCode, jobZip]);
  const handleUploadAttachment = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission && permission.granted === false) {
        Alert.alert('Permission needed', 'Allow photo library access to attach files.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsMultipleSelection: false,
        base64: false,
      });
      if (result.canceled) return;
      const asset = result.assets && result.assets[0];
      if (!asset?.uri) return;
      setUploadingAttachment(true);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const dataUrl = `data:${asset.mimeType || 'image/jpeg'};base64,${base64}`;
      const uploaded = await api('/upload/image','POST',{ dataUrl }, token);
      await api('/attachments','POST',{
        entityType: 'JOB',
        entityId: jobId,
        fileUrl: uploaded.url,
      }, token);
      await loadAttachments();
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to upload attachment.');
    } finally {
      setUploadingAttachment(false);
    }
  }, [jobId, token, loadAttachments]);
  const handleDeleteAttachment = useCallback((id) => {
    Alert.alert('Delete attachment', 'Remove this file from the job?', [
      { text:'Cancel', style:'cancel' },
      {
        text:'Delete',
        style:'destructive',
        onPress: async () => {
          setJobAttachments(prev => prev.filter(att => Number(att.id) !== Number(id)));
          try {
            await api(`/attachments/${id}`,'DELETE',null,token);
            await loadAttachments();
          } catch (e) {
            await loadAttachments();
            if (e?.status === 404) {
              Alert.alert('Already removed', 'Attachment was already deleted.');
            } else {
              Alert.alert('Error', e.message || 'Unable to delete attachment.');
            }
          }
        }
      }
    ]);
  }, [token, loadAttachments]);
  const addActivityEntry = useCallback(async () => {
    const trimmed = newActivityNote.trim();
    if (!trimmed) {
      Alert.alert('Missing note', 'Add details before posting to the log.');
      return;
    }
    const entry = {
      note: trimmed,
      author: user?.fullName || user?.name || user?.email || 'Team',
      createdAt: new Date().toISOString(),
    };
    try {
      setAddingActivity(true);
      const nextLog = [entry, ...(Array.isArray(jobActivity) ? jobActivity : [])];
      await api(`/jobs/${jobId}`,'PATCH',{ activityLog: nextLog }, token);
      setJobActivity(nextLog);
      setNewActivityNote('');
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to save activity.');
    } finally {
      setAddingActivity(false);
    }
  }, [newActivityNote, jobActivity, jobId, token, user]);
  const activityItems = useMemo(() => {
    const list = Array.isArray(jobActivity) ? jobActivity.slice() : [];
    return list.sort((a, b) => {
      const aTime = new Date(a?.createdAt || 0).getTime();
      const bTime = new Date(b?.createdAt || 0).getTime();
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });
  }, [jobActivity]);
  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(6) }}
      >
        <Text style={{ color: palette.text, fontSize: typography.h1, fontWeight:'700' }}>Job #{jobId}</Text>
        <Text style={{ color: palette.muted, marginTop: spacing(0.5), marginBottom: spacing(3) }}>
          Keep job information up to date so the field team always has the latest context.
        </Text>

        <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase', marginBottom: spacing(1) }}>
            Basics
          </Text>
          <FormInput placeholder="Job name" value={jobName} onChangeText={setJobName} />
          <View style={{ flexDirection:'row', columnGap: spacing(1.5) }}>
            <View style={{ flex:1 }}>
              <DateInputField value={jobStartDate} onChange={setJobStartDate} placeholder="Start date" style={{ marginBottom: 0 }} />
            </View>
            <View style={{ flex:1 }}>
              <DateInputField value={jobEndDate} onChange={setJobEndDate} placeholder="End date" style={{ marginBottom: 0 }} />
            </View>
          </View>
          <FormInput
            placeholder="Notes / scope"
            value={jobNotes}
            onChangeText={setJobNotes}
            multiline
            style={[{ minHeight: 112, textAlignVertical: 'top', lineHeight: lineHeightFor(typography.body), marginTop: "10px" }]}
          />
          <Text style={{ color: palette.muted, fontWeight:'600', marginTop: spacing(1.5), marginBottom: spacing(0.5) }}>Tags</Text>
          <TagInput value={jobTags} onChange={setJobTags} placeholder="Add job tags (e.g. Roofing, Urgent)" suggestions={tagSuggestions} />
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: spacing(2) }}>
            <QuickAction label="Delete job" tone="danger" onPress={deleteJob} />
            <TouchableOpacity
              onPress={saveJobDetails}
              activeOpacity={0.85}
              style={{ backgroundColor: palette.primary, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5), borderRadius: 12 }}
            >
              <Text style={{ color:'#fff', fontWeight:'700' }}>Save changes</Text>
            </TouchableOpacity>
          </View>
        </SurfaceCard>

        <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase', marginBottom: spacing(1) }}>
            Customer
          </Text>
          <FormInput placeholder="Name" value={jobCustomerName} onChangeText={setJobCustomerName} />
          <FormInput placeholder="Phone" value={jobCustomerPhone} onChangeText={setJobCustomerPhone} keyboardType="phone-pad" />
          <FormInput
            placeholder="Email"
            value={jobCustomerEmail}
            onChangeText={setJobCustomerEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {(jobCustomerPhone || jobCustomerEmail) ? (
            <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(1.5) }}>
              {jobCustomerPhone ? <QuickAction label="Call" tone="primary" onPress={handleCallCustomer} /> : null}
              {jobCustomerPhone ? <QuickAction label="Text" tone="primary" onPress={handleTextCustomer} /> : null}
              {jobCustomerEmail ? <QuickAction label="Email" tone="muted" onPress={handleEmailCustomer} /> : null}
            </View>
          ) : null}
        </SurfaceCard>

        <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase', marginBottom: spacing(1) }}>
            Jobsite
          </Text>
          <FormInput placeholder="Address line 1" value={jobAddressLine1} onChangeText={setJobAddressLine1} />
          <FormInput placeholder="Address line 2" value={jobAddressLine2} onChangeText={setJobAddressLine2} />
          <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1.5), rowGap: spacing(1.5) }}>
            <FormInput placeholder="City" value={jobCity} onChangeText={setJobCity} style={[{ flex:1, minWidth: '48%', marginBottom: 0 }]} />
            <FormInput
              placeholder="State"
              value={jobStateCode}
              onChangeText={setJobStateCode}
              autoCapitalize="characters"
              style={[{ flexBasis: '20%', minWidth: 80, marginBottom: 0 }]}
            />
            <FormInput
              placeholder="ZIP"
              value={jobZip}
              onChangeText={setJobZip}
              keyboardType="numeric"
              style={[{ flexBasis: '28%', minWidth: 120, marginBottom: 0 }]}
            />
          </View>
        <View style={{ marginTop: spacing(1.5) }}>
          <QuickAction label="Open in Maps" tone="primary" onPress={handleOpenJobsiteMap} />
        </View>
      </SurfaceCard>

      {(canAssignTech || assignedTechId || assignedTechName) ? (
        <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase', marginBottom: spacing(1) }}>
            Assigned technician
          </Text>
          {canAssignTech ? (
            team.length ? (
              <>
                <TechSelector
                  team={team}
                  value={assignedTechId}
                  onSelect={handleAssignTech}
                  allowClear
                  label="Tap to assign"
                />
                {assigningTech ? (
                  <Text style={{ color: palette.muted, marginTop: spacing(1) }}>Updating assignment...</Text>
                ) : null}
              </>
            ) : (
              <Text style={{ color: palette.muted }}>
                Invite teammates from Team Management to assign jobs.
              </Text>
            )
          ) : (
            <Text style={{ color: palette.text }}>
              {assignedTechName ? assignedTechName : 'Unassigned'}
            </Text>
          )}
        </SurfaceCard>
      ) : null}

      <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
        <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase' }}>Attachments</Text>
        <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>Store site photos, permits, and approvals for the crew.</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(1.5) }}>
          <QuickAction
              label={uploadingAttachment ? 'Uploading...' : 'Add photo'}
              tone={uploadingAttachment ? 'muted' : 'primary'}
              onPress={uploadingAttachment ? undefined : handleUploadAttachment}
            />
            <QuickAction label="Refresh" tone="muted" onPress={loadAttachments} />
          </View>
          {loadingAttachments ? (
            <View style={{ alignItems:'center', paddingVertical: spacing(2) }}>
              <ActivityIndicator color={palette.primary} />
              <Text style={{ color: palette.muted, marginTop: spacing(1) }}>Syncing attachments...</Text>
            </View>
          ) : jobAttachments.length === 0 ? (
            <Text style={{ color: palette.muted, marginTop: spacing(1.5) }}>No attachments yet.</Text>
          ) : (
            jobAttachments.map(att => {
              const url = att?.fileUrl || '';
              const isImage = typeof url === 'string' && /\.(png|jpe?g|gif|webp)$/i.test(url);
              return (
                <View
                  key={att.id}
                  style={{
                    borderWidth: 1,
                    borderColor: palette.border,
                    borderRadius: 12,
                    marginTop: spacing(1.5),
                    overflow: 'hidden',
                    backgroundColor: palette.surface,
                  }}
                >
                  {isImage && url ? (
                    <TouchableOpacity onPress={() => url ? Linking.openURL(url) : null} activeOpacity={0.85}>
                      <Image source={{ uri: url }} style={{ height: 180, width: '100%' }} resizeMode="cover" />
                    </TouchableOpacity>
                  ) : null}
                  <View style={{ padding: spacing(1.5) }}>
                    <Text style={{ color: palette.text, fontWeight:'600' }}>{att.caption || 'Attachment'}</Text>
                    <Text style={{ color: palette.muted, fontSize: typography.small, marginTop: spacing(0.5) }}>
                      {(att.uploader?.fullName || att.uploader?.email || 'Uploaded')} {att.createdAt ? `• ${new Date(att.createdAt).toLocaleString()}` : ''}
                    </Text>
                    <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(1.5) }}>
                      {url ? <QuickAction label="Open" tone="muted" onPress={() => Linking.openURL(url)} /> : null}
                      <QuickAction label="Delete" tone="danger" onPress={() => handleDeleteAttachment(att.id)} />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </SurfaceCard>

        <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase' }}>Activity log</Text>
          <Text style={{ color: palette.muted, marginTop: spacing(0.5), marginBottom: spacing(1.5) }}>Capture approvals, client updates, and job milestones.</Text>
          <TextInput
            multiline
            placeholder="Add a note for the team"
            placeholderTextColor={palette.muted}
            value={newActivityNote}
            onChangeText={setNewActivityNote}
            style={[formInputBaseStyle, { minHeight: 96, textAlignVertical: 'top' }]}
          />
          <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(1) }}>
            <QuickAction
              label={addingActivity ? 'Saving...' : 'Add entry'}
              tone={addingActivity ? 'muted' : 'primary'}
              onPress={addingActivity ? undefined : addActivityEntry}
            />
            <QuickAction label="Refresh" tone="muted" onPress={loadJob} />
          </View>
          {activityItems.length === 0 ? (
            <Text style={{ color: palette.muted, marginTop: spacing(1.5) }}>No log entries yet.</Text>
          ) : (
            activityItems.map((entry, idx) => (
              <View
                key={`${entry.createdAt || idx}-${idx}`}
                style={{
                  marginTop: spacing(1.5),
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: palette.border,
                  paddingTop: idx === 0 ? 0 : spacing(1.5),
                }}
              >
                <Text style={{ color: palette.text, fontWeight:'600' }}>{entry.note}</Text>
                <Text style={{ color: palette.muted, fontSize: typography.small, marginTop: spacing(0.5) }}>
                  {(entry.author || 'Team')} {entry.createdAt ? `• ${new Date(entry.createdAt).toLocaleString()}` : ''}
                </Text>
              </View>
            ))
          )}
        </SurfaceCard>

        {canManageChangeOrders ? (
          <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
            <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase', marginBottom: spacing(1) }}>
              New change order
            </Text>
            <FormInput placeholder="Title" value={title} onChangeText={setTitle} />
            <FormInput placeholder="Amount $" value={amountDelta} onChangeText={setAmountDelta} keyboardType="decimal-pad" />
            <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop: spacing(2) }}>
              <TouchableOpacity
                onPress={addCO}
                activeOpacity={0.85}
                style={{ backgroundColor: palette.primary, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5), borderRadius: 12 }}
              >
                <Text style={{ color:'#fff', fontWeight:'700' }}>Add change order</Text>
              </TouchableOpacity>
            </View>
          </SurfaceCard>
        ) : null}

        <View style={{ marginBottom: spacing(3) }}>
          <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginBottom: spacing(1.5) }}>Change orders</Text>
          {changeOrders.length === 0 ? (
            <SurfaceCard>
              <Text style={{ color: palette.muted }}>No change orders yet.</Text>
            </SurfaceCard>
          ) : changeOrders.map(item => {
            const statusKey = (item.status || 'PENDING').toUpperCase();
            const statusTone = (() => {
              if (statusKey === 'APPROVED') return { bg: '#dcfce7', fg: palette.success, label: 'Approved' };
              if (statusKey === 'REJECTED') return { bg: '#fee2e2', fg: palette.danger, label: 'Rejected' };
              return { bg: '#e0f3f0', fg: palette.primaryStrong, label: 'Pending' };
            })();
            const amountLabel = formatCurrency(item.amountDelta || 0);
            return (
              <SurfaceCard key={item.id} style={{ marginBottom: spacing(1.5), padding: spacing(2.5) }}>
                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                  <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600' }}>{item.title}</Text>
                  <View style={{ backgroundColor: statusTone.bg, borderRadius: 999, paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.5) }}>
                    <Text style={{ color: statusTone.fg, fontWeight:'600', fontSize: typography.small }}>{statusTone.label}</Text>
                  </View>
                </View>
                <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>{amountLabel}</Text>
                {canManageChangeOrders ? (
                  <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(1.5) }}>
                    <QuickAction
                      label="Approve"
                      tone="success"
                      onPress={async ()=>{ await api(`/change-orders/${item.id}`,'PATCH',{ status:'APPROVED' }, token); loadCO(); }}
                    />
                    <QuickAction
                      label="Reject"
                      tone="danger"
                      onPress={async ()=>{ await api(`/change-orders/${item.id}`,'PATCH',{ status:'REJECTED' }, token); loadCO(); }}
                    />
                  </View>
                ) : null}
              </SurfaceCard>
            );
          })}
        </View>

        <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginBottom: spacing(1.5) }}>Tasks</Text>
        <JobTasks jobId={jobId} />

        <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginTop: spacing(3), marginBottom: spacing(1.5) }}>Schedule</Text>
        <JobSchedule jobId={jobId} />
      </ScrollView>
    </SafeAreaView>
  );
}

function JobTasks({ jobId }){
  const { token } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const load = async()=> {
    try {
      const data = await api(`/tasks?jobId=${jobId}`,'GET',null,token);
      setTasks(data);
      db.transaction(tx => {
        tx.executeSql('DELETE FROM tasks_cache WHERE jobId=?', [jobId]);
        data.forEach(t => tx.executeSql('INSERT OR REPLACE INTO tasks_cache (id, jobId, title, status, dueDate) VALUES (?,?,?,?,?)', [t.id, jobId, t.title||'', t.status||'TODO', t.dueDate||'']));
      });
    } catch(e) {
      db.transaction(tx => tx.executeSql('SELECT id, jobId, title, status, dueDate FROM tasks_cache WHERE jobId=?', [jobId], (_, { rows }) => setTasks(rows._array || [])));
    }
  };
  useEffect(()=>{ load(); },[]);
  const add = async()=>{
    if(!title.trim()) return Alert.alert('Title required');
    await api('/tasks','POST',{ title, jobId, dueDate }, token);
    setTitle(''); setDueDate(''); load();
  };
  const done = async(id)=>{ await api(`/tasks/${id}`,'PATCH',{ status:'DONE' }, token); load(); };
  const remove = (id)=>{
    Alert.alert('Delete task', 'Remove this task?', [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async ()=>{
        try {
          await api(`/tasks/${id}`,'DELETE',null,token);
          load();
        } catch (e) {
          if (e?.status === 404) {
            load();
            Alert.alert('Already removed', 'Task was already deleted.');
          } else {
            Alert.alert('Error', e.message || 'Unable to delete task');
          }
        }
      } },
    ]);
  };
  return (
    <View>
      <SurfaceCard style={{ marginBottom: spacing(2) }}>
        <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600', marginBottom: spacing(1.5) }}>Add task</Text>
        <TextInput
          placeholder="Task title"
          placeholderTextColor={palette.muted}
          value={title}
          onChangeText={setTitle}
          style={{
            borderWidth:1,
            borderColor: palette.border,
            borderRadius: 12,
            padding: spacing(2),
            color: palette.text,
            backgroundColor: palette.surfaceMuted,
            marginBottom: spacing(1.5),
          }}
        />
        <DateInputField value={dueDate} onChange={setDueDate} placeholder="Due date (optional)" />
        <QuickAction label="Add task" onPress={add} />
      </SurfaceCard>

      {tasks.length === 0 ? (
        <SurfaceCard>
          <Text style={{ color: palette.muted }}>No tasks yet. Add one to start tracking progress.</Text>
        </SurfaceCard>
      ) : (
        tasks.map(t => (
          <SurfaceCard key={t.id} style={{ marginBottom: spacing(1.5) }}>
            <Text style={{ color: palette.text, fontWeight:'600', fontSize: typography.h2 - 2 }}>{t.title}</Text>
            <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>
              Status: {t.status || 'TODO'}{t.dueDate ? ` - Due ${formatDate(t.dueDate)}` : ''}
            </Text>
            <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(1.5) }}>
              {!isTaskCompleted(t.status) ? (
                <QuickAction label="Mark done" tone="success" onPress={() => done(t.id)} />
              ) : null}
              <QuickAction label="Delete" tone="danger" onPress={() => remove(t.id)} />
            </View>
          </SurfaceCard>
        ))
      )}
    </View>
  );
}

function JobSchedule({ jobId }){
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const load = async()=> {
    try {
      const data = await api(`/calendar?jobId=${jobId}`,'GET',null,token);
      setEvents(data);
      db.transaction(tx => {
        tx.executeSql('DELETE FROM calendar_cache WHERE jobId=?', [jobId]);
        data.forEach(ev => tx.executeSql('INSERT OR REPLACE INTO calendar_cache (id, jobId, title, startAt, endAt) VALUES (?,?,?,?,?)', [ev.id, jobId, ev.title||'', ev.startAt||'', ev.endAt||'']));
      });
    } catch(e) {
      db.transaction(tx => tx.executeSql('SELECT id, jobId, title, startAt, endAt FROM calendar_cache WHERE jobId=?', [jobId], (_, { rows }) => setEvents(rows._array || [])));
    }
  };
  useEffect(()=>{ load(); },[]);
  const add = async()=>{
    if(!title.trim() || !startAt) return Alert.alert('Title and start time required');
    await api('/calendar','POST',{ title, jobId, startAt, endAt }, token);
    setTitle(''); setStartAt(''); setEndAt(''); load();
  };
  const remove = (id)=>{
    Alert.alert('Delete event', 'Remove this schedule item?', [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async ()=>{
        try {
          await api(`/calendar/${id}`,'DELETE',null,token);
          load();
        } catch (e) {
          if (e?.status === 404) {
            load();
            Alert.alert('Already removed', 'Event was already deleted.');
          } else {
            Alert.alert('Error', e.message || 'Unable to delete event.');
          }
        }
      } },
    ]);
  };
  return (
    <View>
      <SurfaceCard style={{ marginBottom: spacing(2) }}>
        <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600', marginBottom: spacing(1.5) }}>Schedule event</Text>
        <TextInput
          placeholder="Event title"
          placeholderTextColor={palette.muted}
          value={title}
          onChangeText={setTitle}
          style={{
            borderWidth:1,
            borderColor: palette.border,
            borderRadius: 12,
            padding: spacing(2),
            color: palette.text,
            backgroundColor: palette.surfaceMuted,
            marginBottom: spacing(1.5),
          }}
        />
        <DateInputField
          value={startAt}
          onChange={(date) => {
            const existing = startAt || '';
            const timePartIndex = existing.indexOf('T');
            const timePart = timePartIndex > -1 ? existing.substring(timePartIndex) : 'T08:00:00';
            setStartAt(`${date}${timePart}`);
          }}
          placeholder="Start date"
        />
        <DateInputField
          value={endAt}
          onChange={(date) => {
            if (!date) {
              setEndAt('');
              return;
            }
            const existing = endAt || '';
            const timePartIndex = existing.indexOf('T');
            const timePart = timePartIndex > -1 ? existing.substring(timePartIndex) : 'T17:00:00';
            setEndAt(`${date}${timePart}`);
          }}
          placeholder="End date (optional)"
        />
        <QuickAction label="Add event" onPress={add} />
      </SurfaceCard>

      {events.length === 0 ? (
        <SurfaceCard>
          <Text style={{ color: palette.muted }}>No schedule entries yet.</Text>
        </SurfaceCard>
      ) : (
        events.map(ev => {
          const startLabel = ev.startAt ? `Starts ${formatDate(ev.startAt)}` : 'No start date';
          const endLabel = ev.endAt ? ` - Ends ${formatDate(ev.endAt)}` : '';
          return (
            <SurfaceCard key={ev.id} style={{ marginBottom: spacing(1.5) }}>
              <Text style={{ color: palette.text, fontWeight:'600', fontSize: typography.h2 - 2 }}>{ev.title}</Text>
              <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>
                {startLabel}{endLabel}
              </Text>
              <View style={{ flexDirection:'row', columnGap: spacing(1), marginTop: spacing(1.5) }}>
                <QuickAction label="Delete" tone="danger" onPress={()=>remove(ev.id)} />
              </View>
            </SurfaceCard>
          );
        })
      )}
    </View>
  );
}

// ---------- Leads / Estimates (with photo queue) ----------
async function processQueue(token){
  return new Promise(resolve => {
    db.transaction(tx => {
      tx.executeSql('SELECT * FROM queue', [], async (_, { rows }) => {
        const items = rows._array || [];
        for(const q of items){
          try{
            const payload = JSON.parse(q.payload);
            if(q.type === 'createLead'){ await api('/leads', 'POST', payload, token); }
            if(q.type === 'uploadPhoto'){ await api('/upload/image', 'POST', { dataUrl: payload.dataUrl }, token); }
            db.transaction(txx => txx.executeSql('DELETE FROM queue WHERE id=?', [q.id]));
          }catch(e){ /* keep for later */ }
        }
        resolve();
      });
    });
  });
}

function LeadsScreen({ navigation }){
  const { token } = useAuth();
  const [leads, setLeads] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [convertingId, setConvertingId] = useState(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/leads', 'GET', null, token);
      const filtered = data.filter(item => (item.status || '').toUpperCase() !== 'CONVERTED');
      setLeads(filtered);
      db.transaction(tx => {
        tx.executeSql && tx.executeSql('DELETE FROM leads_cache;');
        filtered.forEach(l => tx.executeSql && tx.executeSql(
          'INSERT OR REPLACE INTO leads_cache (id, description, status) VALUES (?,?,?)',
          [l.id, l.description || '', l.status || 'NEW']
        ));
      });
    } catch(e){
      db.transaction(tx =>
        tx.executeSql && tx.executeSql(
          'SELECT id, description, status FROM leads_cache',
          [],
          (_, { rows }) => {
            const fallback = (rows._array || []).filter(item => (item.status || '').toUpperCase() !== 'CONVERTED');
            setLeads(fallback);
          }
        )
      );
    }
    finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    fetchLeads();
  }, [fetchLeads]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLeads();
    setRefreshing(false);
  }, [fetchLeads]);

  const deleteLead = useCallback((lead) => {
    const title = deriveLeadTitle(lead);
    Alert.alert('Delete lead', `Remove "${title}"?`, [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async () => {
        try {
          await api(`/leads/${lead.id}`,'DELETE',null,token);
          setLeads(prev => prev.filter(l => Number(l.id) !== Number(lead.id)));
          db.transaction(tx => tx.executeSql && tx.executeSql('DELETE FROM leads_cache WHERE id=?', [lead.id]));
          Alert.alert('Deleted', 'Lead removed.');
          await fetchLeads();
        } catch(err) {
          if (err?.status === 404) {
            setLeads(prev => prev.filter(l => Number(l.id) !== Number(lead.id)));
            db.transaction(tx => tx.executeSql && tx.executeSql('DELETE FROM leads_cache WHERE id=?', [lead.id]));
            await fetchLeads();
            Alert.alert('Already removed', 'Lead was already deleted.');
          } else {
            Alert.alert('Error', err.message || 'Unable to delete lead');
          }
        }
      }}
    ]);
  }, [token, fetchLeads]);

  const convertLead = useCallback(async (lead) => {
    if (!lead?.id) return;
    const leadId = lead.id;
    setConvertingId(leadId);
    try {
      const job = await api(`/leads/${leadId}/convert`, 'POST', null, token);
      setLeads(prev => prev.filter(item => Number(item.id) !== Number(leadId)));
      db.transaction(tx =>
        tx.executeSql && tx.executeSql('DELETE FROM leads_cache WHERE id=?', [leadId])
      );
      if (job?.id) {
        navigation.navigate('JobDetail', { jobId: job.id });
      } else {
        Alert.alert('Converted', 'Lead converted to a job.');
        navigation.navigate('Jobs');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to convert lead.');
    } finally {
      setConvertingId(null);
    }
  }, [token, navigation]);

  const newLeadsCount = leads.filter(l => (l.status || '').toUpperCase() === 'NEW').length;

  const renderLeadCard = (lead) => {
    const customer = lead.Customer || {};
    const title = deriveLeadTitle(lead);
    const subtitle = customer.name && customer.name.trim() && customer.name.trim() !== title ? customer.name : null;
    const jobsite = lead.Jobsite || {};
    const addressParts = [
      jobsite.addressLine1,
      jobsite.addressLine2,
      [jobsite.city, jobsite.state].filter(Boolean).join(', '),
      jobsite.zip
    ].filter(Boolean);
    const address = addressParts.join(', ');
    const statusKey = (lead.status || 'NEW').toUpperCase();
    const tags = Array.isArray(lead.tags) ? lead.tags : [];
    return (
      <SurfaceCard key={lead.id}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
          <View>
            <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600' }}>{title}</Text>
            {subtitle ? <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>{subtitle}</Text> : null}
          </View>
          <StatusPill status={statusKey} />
        </View>
        {customer.phone ? <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>{customer.phone}</Text> : null}
        {customer.email ? <Text style={{ color: palette.muted }}>{customer.email}</Text> : null}
        {address ? <Text style={{ color: palette.muted, marginTop: spacing(1) }}>{address}</Text> : null}
        <Text numberOfLines={3} style={{ color: palette.text, marginTop: spacing(1.5) }}>{lead.description || 'No scope captured yet.'}</Text>
        {tags.length ? (
          <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(1) }}>
            {tags.map(tag => (
              <View key={`${lead.id}-${tag}`} style={{ backgroundColor: '#e0f3f0', borderRadius: 999, paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.5) }}>
                <Text style={{ color: palette.primaryStrong, fontWeight:'600', fontSize: typography.small }}>{`#${tag}`}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(2) }}>
          <QuickAction label="Open" onPress={() => navigation.navigate('EstimateEditor', { leadId: lead.id })} />
          {(statusKey !== 'CONVERTED') ? (
            <QuickAction
              label={convertingId === lead.id ? 'Converting...' : 'Convert'}
              tone="success"
              onPress={convertingId === lead.id ? undefined : () => convertLead(lead)}
            />
          ) : (
            <QuickAction
              label="View job"
              tone="muted"
              onPress={() => navigation.navigate('Jobs')}
            />
          )}
          <QuickAction label="Delete" tone="danger" onPress={() => deleteLead(lead)} />
        </View>
      </SurfaceCard>
    );
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.background }}>
      <FlatList
        data={leads}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing(3) }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: spacing(2) }}>
              <View>
                <Text style={{ color: palette.ink, fontSize: typography.h1, fontWeight:'700' }}>Lead pipeline</Text>
                <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>Reliable intake for crews who close every job.</Text>
              </View>
              <QuickAction tone="primary" label="New lead" onPress={() => navigation.navigate('NewLead')} />
            </View>
            <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(2), rowGap: spacing(2) }}>
              <View style={{ flexBasis:'48%', minWidth: 160 }}>
                <SummaryCard title="Total" value={leads.length} subtitle={`${newLeadsCount} new`} tone="info" />
              </View>
              <View style={{ flexBasis:'48%', minWidth: 160 }}>
                <SummaryCard title="Outstanding" value={newLeadsCount} subtitle="Require follow up" tone="warning" />
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => renderLeadCard(item)}
        ListEmptyComponent={
          loading ? (
            <SurfaceCard style={{ alignItems:'center', paddingVertical: spacing(4) }}>
              <ActivityIndicator color={palette.primary} />
              <Text style={{ color: palette.muted, marginTop: spacing(1) }}>Loading leads...</Text>
            </SurfaceCard>
          ) : (
            <SurfaceCard>
              <Text style={{ color: palette.muted }}>No leads yet. Capture a lead to get started.</Text>
            </SurfaceCard>
          )
        }
      />
    </SafeAreaView>
  );
}
function NewLeadScreen({ navigation }){
  const { token } = useAuth();
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('NEW');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [zip, setZip] = useState('');
  const [leadTags, setLeadTags] = useState([]);
  const [tagSuggestions, setTagSuggestions] = useState(defaultTagSeeds);
  const [showCustomerSection, setShowCustomerSection] = useState(false);
  const [showJobsiteSection, setShowJobsiteSection] = useState(false);
  const statuses = ['NEW','CONTACTED','ESTIMATING','CONVERTED','CLOSED_LOST'];
  useEffect(() => {
    (async () => {
      try {
        const [leadsData, jobsData] = await Promise.all([
          api('/leads','GET',null,token),
          api('/jobs','GET',null,token),
        ]);
        const library = new Set(defaultTagSeeds);
        if (Array.isArray(leadsData)) {
          leadsData.forEach(lead => {
            (Array.isArray(lead.tags) ? lead.tags : []).forEach(tag => library.add(String(tag)));
          });
        }
        if (Array.isArray(jobsData)) {
          jobsData.forEach(job => {
            (Array.isArray(job.tags) ? job.tags : []).forEach(tag => library.add(String(tag)));
          });
        }
        setTagSuggestions(Array.from(library));
      } catch {}
    })();
  }, [token]);

  const buildPayload = () => {
    const customer = [customerName, customerPhone, customerEmail].some(v => v && v.trim())
      ? {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          email: customerEmail.trim(),
        }
      : null;
    const jobsite = [addressLine1, addressLine2, city, stateCode, zip].some(v => v && v.trim())
      ? {
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim(),
          city: city.trim(),
          state: stateCode.trim(),
          zip: zip.trim(),
        }
      : null;
    return {
      description,
      status,
      customer,
      jobsite,
      tags: Array.isArray(leadTags) ? leadTags.filter(Boolean) : [],
    };
  };

  const createLeadOnline = async () => {
    const payload = buildPayload();
    const created = await api('/leads', 'POST', payload, token);
    navigation.replace('EstimateEditor', { leadId: created.id });
    const title = deriveLeadTitle(created);
    Alert.alert('Lead created', `"${title}" is ready to estimate.`);
  };

  const queueLead = () => {
    const payload = buildPayload();
    db.transaction(tx => tx.executeSql('INSERT INTO queue (type, payload) VALUES (?,?)', ['createLead', JSON.stringify(payload)]));
    Alert.alert('Saved offline', 'We will submit this lead when you reconnect.');
    navigation.goBack();
  };

  const submit = async () => {
    if(!description.trim()){
      Alert.alert('Missing scope', 'Please describe the job or scope of work.');
      return;
    }
    try {
      await createLeadOnline();
    } catch(e){
      queueLead();
    }
  };

  const chipStyle = (active) => ({
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: active ? palette.primary : palette.border,
    backgroundColor: active ? '#d9f2ed' : palette.surface,
  });

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.background }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(6) }}>
        <SurfaceCard style={{ marginBottom: spacing(3) }}>
          <Text style={{ color: palette.text, fontSize: typography.h1, fontWeight:'700', marginBottom: spacing(2) }}>New lead</Text>
          <Text style={{ color: palette.muted, fontWeight:'600', marginBottom: spacing(1) }}>Scope</Text>
          <TextInput
            placeholder="Describe the job..."
            placeholderTextColor={palette.muted}
            value={description}
            onChangeText={setDescription}
            multiline
            style={{
              borderWidth: 1,
              borderColor: palette.border,
              borderRadius: 12,
              padding: spacing(2),
              minHeight: 120,
              color: palette.text,
              backgroundColor: palette.surfaceMuted,
              textAlignVertical: 'top',
            }}
          />
          <Text style={{ color: palette.muted, fontWeight:'600', marginTop: spacing(2), marginBottom: spacing(1) }}>Status</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1) }}>
            {statuses.map(s => {
              const active = status === s;
              return (
                <TouchableOpacity key={s} onPress={() => setStatus(s)} activeOpacity={0.85} style={chipStyle(active)}>
                  <Text style={{ color: active ? palette.primaryStrong : palette.muted, fontWeight:'600', fontSize: typography.small }}>{s.replace('_',' ')}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ color: palette.muted, fontWeight:'600', marginTop: spacing(2), marginBottom: spacing(0.75) }}>Tags</Text>
          <TagInput value={leadTags} onChange={setLeadTags} placeholder="Add tags (e.g. Roof, Urgent)" suggestions={tagSuggestions} />
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: spacing(3) }}>
            <QuickAction label="Save offline" tone="muted" onPress={queueLead} />
            <TouchableOpacity
              onPress={submit}
              activeOpacity={0.85}
              style={{ backgroundColor: palette.primary, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: 12 }}
            >
              <Text style={{ color:'#fff', fontWeight:'700' }}>Create lead</Text>
            </TouchableOpacity>
          </View>
        </SurfaceCard>

        <SurfaceCard style={{ marginBottom: spacing(3) }}>
          <TouchableOpacity
            onPress={() => setShowCustomerSection(v => !v)}
            style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}
            activeOpacity={0.8}
          >
            <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600' }}>Customer details</Text>
            <Text style={{ color: palette.primary, fontWeight:'600' }}>{showCustomerSection ? 'Hide' : 'Add'}</Text>
          </TouchableOpacity>
          {showCustomerSection ? (
            <View style={{ marginTop: spacing(2) }}>
              <TextInput
                placeholder="Name"
                placeholderTextColor={palette.muted}
                value={customerName}
                onChangeText={setCustomerName}
                style={{
                  borderWidth: 1,
                  borderColor: palette.border,
                  borderRadius: 12,
                  padding: spacing(2),
                  color: palette.text,
                  backgroundColor: palette.surfaceMuted,
                  marginBottom: spacing(1.5),
                }}
              />
              <TextInput
                placeholder="Phone"
                placeholderTextColor={palette.muted}
                keyboardType="phone-pad"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                style={{
                  borderWidth: 1,
                  borderColor: palette.border,
                  borderRadius: 12,
                  padding: spacing(2),
                  color: palette.text,
                  backgroundColor: palette.surfaceMuted,
                  marginBottom: spacing(1.5),
                }}
              />
              <TextInput
                placeholder="Email"
                placeholderTextColor={palette.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={customerEmail}
                onChangeText={setCustomerEmail}
                style={{
                  borderWidth: 1,
                  borderColor: palette.border,
                  borderRadius: 12,
                  padding: spacing(2),
                  color: palette.text,
                  backgroundColor: palette.surfaceMuted,
                }}
              />
            </View>
          ) : (
            <Text style={{ color: palette.muted, marginTop: spacing(1.5) }}>Add contact details to help follow up faster.</Text>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <TouchableOpacity
            onPress={() => setShowJobsiteSection(v => !v)}
            style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}
            activeOpacity={0.8}
          >
            <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600' }}>Jobsite address</Text>
            <Text style={{ color: palette.primary, fontWeight:'600' }}>{showJobsiteSection ? 'Hide' : 'Add'}</Text>
          </TouchableOpacity>
          {showJobsiteSection ? (
            <View style={{ marginTop: spacing(2) }}>
              <TextInput
                placeholder="Address line 1"
                placeholderTextColor={palette.muted}
                value={addressLine1}
                onChangeText={setAddressLine1}
                style={{
                  borderWidth: 1,
                  borderColor: palette.border,
                  borderRadius: 12,
                  padding: spacing(2),
                  color: palette.text,
                  backgroundColor: palette.surfaceMuted,
                  marginBottom: spacing(1.5),
                }}
              />
              <TextInput
                placeholder="Address line 2"
                placeholderTextColor={palette.muted}
                value={addressLine2}
                onChangeText={setAddressLine2}
                style={{
                  borderWidth: 1,
                  borderColor: palette.border,
                  borderRadius: 12,
                  padding: spacing(2),
                  color: palette.text,
                  backgroundColor: palette.surfaceMuted,
                  marginBottom: spacing(1.5),
                }}
              />
              <View style={{ flexDirection:'row', columnGap: spacing(1.5) }}>
                <View style={{ flex:1 }}>
                  <TextInput
                    placeholder="City"
                    placeholderTextColor={palette.muted}
                    value={city}
                    onChangeText={setCity}
                    style={{
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 12,
                      padding: spacing(2),
                      color: palette.text,
                      backgroundColor: palette.surfaceMuted,
                      marginBottom: spacing(1.5),
                    }}
                  />
                </View>
                <View style={{ width: 80 }}>
                  <TextInput
                    placeholder="State"
                    placeholderTextColor={palette.muted}
                    value={stateCode}
                    onChangeText={setStateCode}
                    style={{
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 12,
                      padding: spacing(2),
                      color: palette.text,
                      backgroundColor: palette.surfaceMuted,
                      marginBottom: spacing(1.5),
                    }}
                  />
                </View>
                <View style={{ width: 100 }}>
                  <TextInput
                    placeholder="ZIP"
                    placeholderTextColor={palette.muted}
                    value={zip}
                    onChangeText={setZip}
                    style={{
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 12,
                      padding: spacing(2),
                      color: palette.text,
                      backgroundColor: palette.surfaceMuted,
                      marginBottom: spacing(1.5),
                    }}
                  />
                </View>
              </View>
            </View>
          ) : (
            <Text style={{ color: palette.muted, marginTop: spacing(1.5) }}>Add a jobsite to keep crews aligned.</Text>
          )}
        </SurfaceCard>
      </ScrollView>
    </SafeAreaView>
  );
}
function EstimateEditorScreen({ route, navigation }){
  const { token, user } = useAuth();
  const { leadId } = route.params || {};
  const [estimateId, setEstimateId] = useState(null);
  const [items, setItems] = useState([]);
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('0');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [subtotal, setSubtotal] = useState(0);
  const [taxRate, setTaxRate] = useState('7');
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);
  const [leadDetails, setLeadDetails] = useState(null);
  const [leadStatus, setLeadStatus] = useState('NEW');
  const [leadScope, setLeadScope] = useState('');
  const [leadCustomerName, setLeadCustomerName] = useState('');
  const [leadCustomerPhone, setLeadCustomerPhone] = useState('');
  const [leadCustomerEmail, setLeadCustomerEmail] = useState('');
  const [leadAddressLine1, setLeadAddressLine1] = useState('');
  const [leadAddressLine2, setLeadAddressLine2] = useState('');
  const [leadCity, setLeadCity] = useState('');
  const [leadStateCode, setLeadStateCode] = useState('');
  const [leadZip, setLeadZip] = useState('');
  const leadStatuses = ['NEW','CONTACTED','ESTIMATING','CONVERTED','CLOSED_LOST'];

  const loadLead = useCallback(async () => {
    if (!leadId) return;
    try {
      const data = await api(`/leads/${leadId}`,'GET',null,token);
      setLeadDetails(data);
      setLeadStatus(data.status || 'NEW');
      setLeadScope(data.description || '');
      const customer = data.Customer || {};
      const jobsite = data.Jobsite || {};
      setLeadCustomerName(customer.name || '');
      setLeadCustomerPhone(customer.phone || '');
      setLeadCustomerEmail(customer.email || '');
      setLeadAddressLine1(jobsite.addressLine1 || '');
      setLeadAddressLine2(jobsite.addressLine2 || '');
      setLeadCity(jobsite.city || '');
      setLeadStateCode(jobsite.state || '');
      setLeadZip(jobsite.zip || '');
    } catch(e) { }
  }, [leadId, token]);

  useEffect(() => {
    loadLead();
  }, [loadLead]);

  const createEstimate = async () => {
    const est = await api('/estimates', 'POST', {
      leadId,
      customerId: leadDetails?.customerId ?? null,
      jobsiteId: leadDetails?.jobsiteId ?? null,
      subtotal: 0,
      taxRate: parseFloat(taxRate) || 0,
      total: 0
    }, token);
    setEstimateId(est.id);
    return est;
  };

  const ensureEstimate = useCallback(async () => {
    if (estimateId) return estimateId;
    const created = await createEstimate();
    setEstimateId(created.id);
    return created.id;
  }, [estimateId, createEstimate]);

  useEffect(() => {
    const rate = parseFloat(taxRate) || 0;
    const newSubtotal = items.reduce((sum, item) => sum + (parseFloat(item.qty || 0) * parseFloat(item.unitPrice || 0)), 0);
    const newTax = newSubtotal * (rate / 100);
    setSubtotal(newSubtotal);
    setTax(newTax);
    setTotal(newSubtotal + newTax);
  }, [items, taxRate]);

  const addItem = async () => {
    if (!desc.trim()) {
      Alert.alert('Line item', 'Please add a description.');
      return;
    }
    try {
      const targetId = await ensureEstimate();
      const payload = {
        description: desc.trim(),
        qty: parseFloat(qty) || 1,
        unitPrice: parseFloat(price) || 0,
      };
      const item = await api(`/estimates/${targetId}/items`, 'POST', payload, token);
      setItems(prev => [item, ...prev]);
      setDesc('');
      setQty('1');
      setPrice('0');
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to add line item');
    }
  };

  const saveLeadDetails = async () => {
    if (!leadId) return;
    const customerPayload = [leadCustomerName, leadCustomerPhone, leadCustomerEmail].some(v => v && v.trim()) ? {
      name: leadCustomerName.trim(),
      phone: leadCustomerPhone.trim(),
      email: leadCustomerEmail.trim(),
    } : null;
    const jobsitePayload = [leadAddressLine1, leadAddressLine2, leadCity, leadStateCode, leadZip].some(v => v && v.trim()) ? {
      addressLine1: leadAddressLine1.trim(),
      addressLine2: leadAddressLine2.trim(),
      city: leadCity.trim(),
      state: leadStateCode.trim(),
      zip: leadZip.trim(),
    } : null;
    try {
      await api(`/leads/${leadId}`,'PATCH',{
        description: leadScope,
        status: leadStatus,
        customer: customerPayload,
        jobsite: jobsitePayload,
      }, token);
      Alert.alert('Saved', 'Lead details updated.');
      navigation.navigate('Tabs', { screen: 'Leads' });
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to save lead details');
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 0.6,
    });
    if (!result.canceled && result.assets?.length) {
      setPhotoUrl(result.assets[0].uri);
    }
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.background }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(6) }}>
        <SurfaceCard style={{ marginBottom: spacing(3) }}>
          <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginBottom: spacing(1.5) }}>Lead summary</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1.5), marginBottom: spacing(2) }}>
            {leadStatuses.map(s => {
              const selected = leadStatus === s;
              return (
                <QuickAction
                  key={s}
                  label={s.replace('_',' ')}
                  tone={selected ? 'primary' : 'muted'}
                  onPress={() => setLeadStatus(s)}
                />
              );
            })}
          </View>
          <TextInput
            placeholder="Scope / project notes"
            placeholderTextColor={palette.muted}
            value={leadScope}
            onChangeText={setLeadScope}
            multiline
            style={{
              borderWidth:1,
              borderColor: palette.border,
              borderRadius: 12,
              padding: spacing(2),
              minHeight: 120,
              color: palette.text,
              backgroundColor: palette.surfaceMuted,
              textAlignVertical: 'top',
            }}
          />
          <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop: spacing(2) }}>
            <QuickAction label="Save lead" onPress={saveLeadDetails} />
          </View>
        </SurfaceCard>

        <SurfaceCard style={{ marginBottom: spacing(3) }}>
          <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginBottom: spacing(1.5) }}>Line items</Text>
          <TextInput
            placeholder="Describe the work or material"
            placeholderTextColor={palette.muted}
            value={desc}
            onChangeText={setDesc}
            style={{
              borderWidth:1,
              borderColor: palette.border,
              borderRadius: 12,
              padding: spacing(2),
              color: palette.text,
              backgroundColor: palette.surfaceMuted,
              marginBottom: spacing(1.5),
            }}
          />
          <View style={{ flexDirection:'column', columnGap: spacing(1.5), marginBottom: spacing(1.5) }}>
            <TextInput
              placeholder="Qty"
              placeholderTextColor={palette.muted}
              // value={qty}
              onChangeText={setQty}
              keyboardType="numeric"
              style={{
                flex:1,
                borderWidth:1,
                borderColor: palette.border,
                borderRadius: 12,
                padding: spacing(2),
                marginBottom: spacing(1.5),
                color: palette.text,
                backgroundColor: palette.surfaceMuted,
              }}
            />
            <TextInput
              placeholder="Unit price"
              placeholderTextColor={palette.muted}
              // value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              style={{
                flex:1,
                borderWidth:1,
                borderColor: palette.border,
                borderRadius: 12,
                padding: spacing(2),
                marginBottom: spacing(1.5),
                color: palette.text,
                backgroundColor: palette.surfaceMuted,
              }}
            />
            <QuickAction label="Add" onPress={addItem} />
          </View>
          {items.length === 0 ? (
            <Text style={{ color: palette.muted }}>No line items yet.</Text>
          ) : (
            items.map((item, idx) => (
              <SurfaceCard key={item.id || idx} style={{ marginBottom: spacing(1.5) }}>
                <Text style={{ color: palette.text, fontWeight:'600' }}>{item.description}</Text>
                <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>
                  Qty {item.qty} x ${parseFloat(item.unitPrice || 0).toFixed(2)} = {(parseFloat(item.qty || 0) * parseFloat(item.unitPrice || 0)).toFixed(2)}
                </Text>
              </SurfaceCard>
            ))
          )}
          <View style={{ marginTop: spacing(2), borderTopWidth:1, borderTopColor: palette.border, paddingTop: spacing(2) }}>
            <Text style={{ color: palette.muted }}>Tax rate (%)</Text>
            <TextInput
              value={String(taxRate)}
              onChangeText={setTaxRate}
              keyboardType="numeric"
              placeholderTextColor={palette.muted}
              style={{
                marginTop: spacing(1),
                borderWidth:1,
                borderColor: palette.border,
                borderRadius: 12,
                padding: spacing(2),
                color: palette.text,
                backgroundColor: palette.surfaceMuted,
              }}
            />
            <View style={{ marginTop: spacing(2) }}>
              <Text style={{ color: palette.text }}>Subtotal: ${subtotal.toFixed(2)}</Text>
              <Text style={{ color: palette.text }}>Tax: ${tax.toFixed(2)}</Text>
              <Text style={{ color: palette.text, fontWeight:'700' }}>Total: ${total.toFixed(2)}</Text>
            </View>
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginBottom: spacing(1.5) }}>Attachments & notes</Text>
          <TextInput
            placeholder="Internal notes"
            placeholderTextColor={palette.muted}
            value={notes}
            onChangeText={setNotes}
            multiline
            style={{
              borderWidth:1,
              borderColor: palette.border,
              borderRadius: 12,
              padding: spacing(2),
              minHeight: 100,
              color: palette.text,
              backgroundColor: palette.surfaceMuted,
              textAlignVertical: 'top',
            }}
          />
          <View style={{ flexDirection:'row', columnGap: spacing(1.5), marginTop: spacing(1.5) }}>
            <QuickAction label="Add photo" onPress={pickPhoto} />
          </View>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={{ height: 160, borderRadius: 12, marginTop: spacing(2) }} />
          ) : null}
        </SurfaceCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function ScheduleScreen({ navigation }){
  const { token } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const loadQueueCount = useCallback(() => {
    db.transaction(tx => tx.executeSql('SELECT COUNT(*) as c FROM queue', [], (_, { rows }) => setQueueCount((rows._array?.[0]?.c)||0)));
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api('/jobs','GET',null,token);
      setJobs(data);
      db.transaction(tx => {
        tx.executeSql('DELETE FROM jobs_cache;');
        data.forEach(j => tx.executeSql('INSERT OR REPLACE INTO jobs_cache (id, name, status, startDate, endDate, notes) VALUES (?,?,?,?,?,?)', [j.id, j.name||'', j.status||'SCHEDULED', j.startDate||'', j.endDate||'', j.notes||'']));
      });
    } catch(e) {
      db.transaction(tx => tx.executeSql('SELECT id, name, status, startDate, endDate, notes FROM jobs_cache', [], (_, { rows }) => setJobs(rows._array || [])));
    }
  }, [token]);

  useEffect(() => {
    load();
    loadQueueCount();
  }, [load, loadQueueCount]);

  const filters = [
    { key:'ALL', label:'All' },
    { key:'TODAY', label:'Today' },
    { key:'WEEK', label:'This week' },
  ];

  const inRange = useCallback((dateValue) => {
    if (filter === 'ALL') return true;
    if (!dateValue) return false;
    const today = new Date();
    const dt = new Date(dateValue);
    if (Number.isNaN(dt.getTime())) return false;
    if (filter === 'TODAY') {
      return dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate();
    }
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(today.getDate() - today.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return dt >= start && dt <= end;
  }, [filter]);

  const filteredJobs = useMemo(() => (
    jobs
      .filter(job => inRange(job.startDate))
      .sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0))
  ), [jobs, inRange]);
  const openJobInMaps = useCallback((job) => {
    if (!job) return;
    const jobsite = job.Jobsite || {};
    const addressParts = [
      jobsite.addressLine1,
      jobsite.addressLine2,
      [jobsite.city, jobsite.state].filter(Boolean).join(' '),
      jobsite.zip,
    ].filter(part => part && String(part).trim());
    if (!addressParts.length) {
      Alert.alert('Missing address', 'Add a jobsite address to open navigation.');
      return;
    }
    const address = addressParts.join(', ');
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
  }, []);
  const optimizeRoute = useCallback(() => {
    if (!filteredJobs.length) {
      Alert.alert('No jobs', 'Apply filters or add jobs before optimizing a route.');
      return;
    }
    const addresses = filteredJobs
      .map(job => {
        const site = job.Jobsite || {};
        const parts = [
          site.addressLine1,
          site.addressLine2,
          [site.city, site.state].filter(Boolean).join(' '),
          site.zip,
        ].filter(part => part && String(part).trim());
        return parts.length ? parts.join(', ') : null;
      })
      .filter(Boolean);
    if (!addresses.length) {
      Alert.alert('Missing addresses', 'Add jobsite addresses to build a route.');
      return;
    }
    if (addresses.length === 1) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`);
      return;
    }
    const origin = addresses[0];
    const destination = addresses[addresses.length - 1];
    const waypointsRaw = addresses.slice(1, -1);
    const MAX_WAYPOINTS = 23; // Google Maps supports up to 25 stops including origin and destination.
    if (waypointsRaw.length > MAX_WAYPOINTS) {
      Alert.alert('Too many stops', `Google Maps can optimize up to ${MAX_WAYPOINTS + 2} stops at once. Narrow your job filters and try again.`);
      return;
    }
    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    if (waypointsRaw.length) {
      const encodedWaypoints = waypointsRaw.map(addr => encodeURIComponent(addr));
      url += `&waypoints=optimize:true|${encodedWaypoints.join('|')}`;
    }
    Linking.openURL(url);
  }, [filteredJobs]);
  const techSummary = useMemo(() => {
    const buckets = {};
    filteredJobs.forEach(job => {
      const tech = job?.assignedTech;
      const key = tech?.fullName || tech?.email || 'Unassigned';
      buckets[key] = (buckets[key] || 0) + 1;
    });
    return Object.entries(buckets);
  }, [filteredJobs]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await processQueue(token);
      await load();
      loadQueueCount();
    } finally {
      setSyncing(false);
    }
  }, [token, load, loadQueueCount]);

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.background }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(6) }}>
        <Text style={{ color: palette.text, fontSize: typography.h1, fontWeight:'700', marginBottom: spacing(2) }}>Schedule</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1.5), marginBottom: spacing(2) }}>
          {filters.map(option => (
            <QuickAction
              key={option.key}
              label={option.label}
              tone={filter === option.key ? 'primary' : 'muted'}
              onPress={() => setFilter(option.key)}
            />
          ))}
        </View>
        <SurfaceCard style={{ marginBottom: spacing(3), flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
          <View>
            <Text style={{ color: palette.text, fontWeight:'600' }}>Offline queue</Text>
            <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>{queueCount} items waiting to sync</Text>
          </View>
          <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1) }}>
            <QuickAction label={syncing ? 'Syncing...' : 'Sync now'} tone={syncing ? 'muted' : 'primary'} onPress={syncing ? undefined : handleSync} />
            <QuickAction label="Optimize route" tone="muted" onPress={optimizeRoute} />
          </View>
        </SurfaceCard>
        {techSummary.length ? (
          <SurfaceCard style={{ marginBottom: spacing(3) }}>
            <Text style={{ color: palette.text, fontWeight:'600', marginBottom: spacing(1) }}>Technician availability</Text>
            {techSummary.map(([name, count]) => (
              <View key={name} style={{ flexDirection:'row', justifyContent:'space-between', marginTop: spacing(0.5) }}>
                <Text style={{ color: palette.muted }}>{name}</Text>
                <Text style={{ color: palette.text }}>{count} job{count === 1 ? '' : 's'}</Text>
              </View>
            ))}
          </SurfaceCard>
        ) : null}

        {filteredJobs.length === 0 ? (
          <SurfaceCard>
            <Text style={{ color: palette.muted }}>No jobs {filter !== 'ALL' ? 'in this range' : 'scheduled yet'}. Convert a lead or create a job to populate your schedule.</Text>
          </SurfaceCard>
        ) : (
          filteredJobs.map(job => {
            const jobsite = job.Jobsite || {};
            const addressParts = [
              jobsite.addressLine1,
              jobsite.addressLine2,
              [jobsite.city, jobsite.state].filter(Boolean).join(', '),
              jobsite.zip,
            ].filter(Boolean);
            const address = addressParts.join(', ');
            const startLabel = job.startDate ? `Starts ${formatDate(job.startDate)}` : 'No start date';
            const endLabel = job.endDate ? ` - Due ${formatDate(job.endDate)}` : '';
            const assignedTech = job.assignedTech;
            return (
              <SurfaceCard key={job.id} style={{ marginBottom: spacing(2) }}>
                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                  <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'600' }}>{job.name || `Job #${job.id}`}</Text>
                  <StatusPill status={job.status || 'SCHEDULED'} />
                </View>
                <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>
                  {startLabel}{endLabel}
                </Text>
                {address ? <Text style={{ color: palette.muted, marginTop: spacing(1) }}>{address}</Text> : null}
                {assignedTech ? (
                  <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>
                    Assigned to {assignedTech.fullName || assignedTech.email || 'Tech'}
                  </Text>
                ) : null}
                {job.notes ? <Text style={{ color: palette.muted, marginTop: spacing(1) }}>{job.notes}</Text> : null}
                <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(2) }}>
                  {address ? <QuickAction label="Map" tone="muted" onPress={() => openJobInMaps(job)} /> : null}
                  <QuickAction label="Open job" onPress={() => navigation.navigate('JobDetail', { jobId: job.id })} />
                  <QuickAction label="View tasks" onPress={() => navigation.navigate('JobDetail', { jobId: job.id, tab: 'tasks' })} tone="muted" />
                </View>
              </SurfaceCard>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
function ProfileScreen({ navigation }){
  const { setToken, user } = useAuth();
  const isAdmin = (user?.role || '').toUpperCase() === 'ADMIN';
  return (
    <SafeAreaView style={{ flex:1, backgroundColor: palette.background }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(6) }}>
        <View style={{ marginBottom: spacing(2) }}>
          <Text style={{ color: palette.ink, fontSize: typography.h1, fontWeight:'700' }}>Profile</Text>
          <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>Keep your access secure and your team aligned.</Text>
        </View>
        <SurfaceCard style={{ marginBottom: spacing(3) }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, textTransform:'uppercase', fontWeight:'600' }}>Account</Text>
          <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700', marginTop: spacing(1) }}>{user?.name || user?.fullName || 'Team member'}</Text>
          <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>{user?.email || 'No email on file'}</Text>
          <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>Role: {user?.role || 'TECH'}</Text>
        </SurfaceCard>

        <SurfaceCard>
          <Text style={{ color: palette.muted, fontSize: typography.small, textTransform:'uppercase', fontWeight:'600', marginBottom: spacing(1.5) }}>Actions</Text>
          {isAdmin ? (
            <View style={{ marginBottom: spacing(1.5) }}>
              <QuickAction label="Manage users" onPress={() => navigation.navigate('UsersAdmin')} />
            </View>
          ) : null}
          <QuickAction label="Sign out" tone="danger" onPress={() => setToken(null)} />
        </SurfaceCard>
      </ScrollView>
    </SafeAreaView>
  );
}
const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function TabsNav(){
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toUpperCase() === 'ADMIN';
  const { width } = useWindowDimensions();
  const isCompact = Platform.OS !== 'web' ? true : width < 768;
  const hideTabs = isCompact;
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarStyle: { backgroundColor: palette.surface, display: hideTabs ? 'none' : 'flex' },
      }}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tabs.Screen name="Leads" component={LeadsScreen} />
      <Tabs.Screen name="Jobs" component={JobsKanbanScreen} options={{ title:'Jobs' }} />
      {isAdmin ? <Tabs.Screen name="Invoices" component={InvoicesScreen} /> : null}
      <Tabs.Screen name="Schedule" component={ScheduleScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title:"Profile" }} />
    </Tabs.Navigator>
  );
}

function MobileHeader({ currentRoute, onNavigate, isAdmin }){
  const [menuVisible, setMenuVisible] = useState(false);
  const activeRoute = useMemo(() => {
    if (currentRoute === 'JobDetail') return 'Jobs';
    return currentRoute;
  }, [currentRoute]);

  const menuItems = useMemo(() => {
    const items = [
      { label: 'Dashboard', route: 'Dashboard' },
      { label: 'Leads', route: 'Leads' },
      { label: 'Jobs', route: 'Jobs' },
    ];
    if (isAdmin) {
      items.push({ label: 'Invoices', route: 'Invoices' });
    }
    items.push(
      { label: 'Schedule', route: 'Schedule' },
      { label: 'Profile', route: 'Profile' },
    );
    if (isAdmin) {
      items.push({ label: 'Manage users', route: 'UsersAdmin' });
    }
    return items;
  }, [isAdmin]);

  const handleSelect = useCallback((route) => {
    setMenuVisible(false);
    onNavigate(route);
  }, [onNavigate]);

  return (
    <>
        <SafeAreaView style={{ backgroundColor: palette.surface }}>
          <View style={{ paddingHorizontal: spacing(2), paddingVertical: spacing(1.5), flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              accessibilityLabel="Open navigation menu"
              accessibilityRole="button"
              style={{ padding: spacing(1) }}
            >
              <View style={{ width: 24, height: 2, backgroundColor: palette.ink, borderRadius: 999, marginBottom: 4 }} />
              <View style={{ width: 24, height: 2, backgroundColor: palette.ink, borderRadius: 999, marginBottom: 4 }} />
              <View style={{ width: 24, height: 2, backgroundColor: palette.ink, borderRadius: 999 }} />
            </TouchableOpacity>
            <Text style={{ color: palette.ink, fontSize: typography.h1, fontWeight:'700' }}>Precision Tracker</Text>
            <View style={{ width: 24 }} />
          </View>
        </SafeAreaView>
      <Modal
        visible={menuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={{ flex:1, backgroundColor:'rgba(15,23,42,0.45)', justifyContent:'flex-start', padding: spacing(3) }}>
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: spacing(2.5) }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: spacing(2) }}>
              <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight:'700' }}>Navigate</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)} accessibilityRole="button" accessibilityLabel="Close menu">
                <Text style={{ color: palette.muted, fontWeight:'600' }}>Close</Text>
              </TouchableOpacity>
            </View>
            {menuItems.map(item => {
              const selected = activeRoute === item.route;
              return (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => handleSelect(item.route)}
                  activeOpacity={0.85}
                  style={{
                    paddingVertical: spacing(1.25),
                    paddingHorizontal: spacing(1.5),
                    borderRadius: 12,
                    backgroundColor: selected ? 'rgba(16,185,129,0.12)' : palette.surfaceMuted,
                    marginBottom: spacing(1),
                  }}
                >
                  <Text style={{ color: selected ? palette.primaryStrong : palette.text, fontWeight:'600', fontSize: typography.body }}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('admin@example.com');
  // If you kept the hardcoded backend login, default to test123:
  const [password, setPassword] = useState('test123');
  const [busy, setBusy] = useState(false);

  // <-- use the auth context to flip the app into "logged-in" mode
  const { setToken, setUser } = useAuth();

  async function login() {
    try {
      setBusy(true);
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Login failed');

      // Accept dev or real payload shape
      const tok = data.token || data.accessToken;
      if (!tok) throw new Error('No token returned from server');

      // Store token/user in global auth state + persist
      const normalizedUser = data.user ? { ...data.user, role: normalizeRole(data.user.role) } : { email, role: 'ADMIN', name: 'Admin' };
      setToken(tok);
      setUser(normalizedUser);
      try {
        await SecureStore.setItemAsync('auth_token', tok);
        await SecureStore.setItemAsync('auth_user', JSON.stringify(normalizedUser));
      } catch {}

      // Optional: toast
        Alert.alert('Welcome back', 'Precision in every project.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing(3) }}>
        <SurfaceCard style={{ padding: spacing(3), borderRadius: 20 }}>
          <View style={{ width: spacing(5), height: spacing(5), borderRadius: 14, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: typography.h2 }}>PT</Text>
          </View>
          <Text style={{ color: palette.ink, fontSize: 30, fontWeight: '800', lineHeight: lineHeightFor(30) }}>Precision Tracker</Text>
          <Text style={{ color: palette.muted, marginTop: spacing(1), lineHeight: lineHeightFor(typography.body) }}>
            Precision in every project. Sign in to keep your crews aligned and closing work.
          </Text>
          <View style={{ marginTop: spacing(3) }}>
            <FormInput
              placeholder="Work email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <FormInput
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={login}
              activeOpacity={0.85}
              disabled={busy}
              style={{
                backgroundColor: palette.primary,
                paddingVertical: spacing(2),
                borderRadius: 12,
                alignItems: 'center',
                marginTop: spacing(1),
                opacity: busy ? 0.7 : 1,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: typography.body }}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Text>
            </TouchableOpacity>
            <Text style={{ color: palette.muted, fontSize: typography.small, marginTop: spacing(2) }}>
              Built for professionals who don’t miss details.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              accessibilityRole="button"
              style={{ marginTop: spacing(2), alignItems: 'center' }}
            >
              <Text style={{ color: palette.primaryStrong, fontWeight: '600' }}>Need an account? Register</Text>
            </TouchableOpacity>
          </View>
        </SurfaceCard>
      </View>
    </SafeAreaView>
  );
}

function RegisterScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      Alert.alert('Missing email', 'Enter your work email to create an account.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters so your account stays secure.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Double-check your password confirmation.');
      return;
    }
    try {
      setBusy(true);
      await api('/auth/register', 'POST', {
        email: trimmedEmail,
        password,
        fullName: fullName.trim() || undefined,
        role: 'ADMIN',
      });
      Alert.alert('Account created', 'Sign in with your new credentials.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to register. Try again or contact support.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing(3) }}>
        <SurfaceCard style={{ padding: spacing(3), borderRadius: 20 }}>
          <View style={{ width: spacing(5), height: spacing(5), borderRadius: 14, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(2) }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: typography.h2 }}>PT</Text>
          </View>
          <Text style={{ color: palette.ink, fontSize: 26, fontWeight: '800', lineHeight: lineHeightFor(26) }}>
            Create your workspace
          </Text>
          <Text style={{ color: palette.muted, marginTop: spacing(1), lineHeight: lineHeightFor(typography.body) }}>
            We’ll set up Precision Tracker so your crew can hit the ground running.
          </Text>

          <View style={{ marginTop: spacing(3) }}>
            <FormInput
              placeholder="Full name"
              value={fullName}
              onChangeText={setFullName}
            />
            <FormInput
              placeholder="Work email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <FormInput
              placeholder="Password (min 6 characters)"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <FormInput
              placeholder="Confirm password"
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
            />
            <TouchableOpacity
              onPress={submit}
              activeOpacity={0.85}
              disabled={busy}
              style={{
                backgroundColor: palette.primary,
                paddingVertical: spacing(2),
                borderRadius: 12,
                alignItems: 'center',
                marginTop: spacing(1),
                opacity: busy ? 0.7 : 1,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: typography.body }}>
                {busy ? 'Creating account…' : 'Register'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              style={{ marginTop: spacing(2), alignItems: 'center' }}
            >
              <Text style={{ color: palette.muted, fontWeight: '600' }}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </SurfaceCard>
      </ScrollView>
    </SafeAreaView>
  );
}


export default function App(){
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const navigationRef = useRef(null);
  const [currentRoute, setCurrentRoute] = useState('Dashboard');
  const { width } = useWindowDimensions();
  const isCompactLayout = Platform.OS !== 'web' ? true : width < 768;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
          const [tok, usr] = await Promise.all([
            SecureStore.getItemAsync('auth_token'),
            SecureStore.getItemAsync('auth_user')
        ]);
        if (mounted && tok) {
          setToken(tok);
          if (usr) {
            const parsed = JSON.parse(usr);
            parsed.role = normalizeRole(parsed.role);
            setUser(parsed);
          }
        }
      } catch {}
      finally { if (mounted) setBooting(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const authValue = {
    token,
    setToken: (t) => {
      setToken(t);
      if (!t) { try { SecureStore.deleteItemAsync('auth_token'); SecureStore.deleteItemAsync('auth_user'); } catch {} }
    },
    user,
    setUser
  };

  const updateCurrentRoute = useCallback(() => {
    if (!navigationRef.current) return;
    const current = navigationRef.current.getCurrentRoute();
    if (!current) return;
    let name = current.name;
    let state = current.state;
    while (state && typeof state.index === 'number' && state.routes && state.routes[state.index]) {
      const nested = state.routes[state.index];
      name = nested.name;
      state = nested.state;
    }
    if (name) setCurrentRoute(name);
  }, []);

  const handleNavigate = useCallback((routeName) => {
    if (!navigationRef.current) return;
    const tabRoutes = ['Dashboard','Leads','Jobs','Invoices','Schedule','Profile'];
    if (tabRoutes.includes(routeName)) {
      navigationRef.current.navigate('Tabs', { screen: routeName });
    } else {
      navigationRef.current.navigate(routeName);
    }
  }, []);

  if (booting) {
    return (
      <SafeAreaView style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
        <Text>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <AuthContext.Provider value={authValue}>
      <View style={{ flex:1, backgroundColor: palette.background }}>
        {isCompactLayout && token ? (
          <MobileHeader
            currentRoute={currentRoute}
            onNavigate={handleNavigate}
            isAdmin={(user?.role || '').toUpperCase() === 'ADMIN'}
          />
        ) : null}
        <View style={{ flex:1 }}>
            <NavigationContainer
              ref={navigationRef}
              onReady={updateCurrentRoute}
              onStateChange={updateCurrentRoute}
            >
              {!token ? (
                <Stack.Navigator>
                  <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
                  <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
                </Stack.Navigator>
              ) : (
                <Stack.Navigator>
                  <Stack.Screen name="Tabs" component={TabsNav} options={{ headerShown:false }} />
                <Stack.Screen name="NewLead" component={NewLeadScreen} options={{ title:'New Lead' }} />
                <Stack.Screen name="EstimateEditor" component={EstimateEditorScreen} options={{ title:'Estimate' }} />
                <Stack.Screen name="Signature" component={SignatureScreen} options={{ title:'Signature' }} />
                <Stack.Screen name="UsersAdmin" component={UsersAdminScreen} options={{ title:'Users (Admin)' }} />
                <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title:'Job' }} />
              </Stack.Navigator>
            )}
          </NavigationContainer>
        </View>
      </View>
    </AuthContext.Provider>
  );
}



































