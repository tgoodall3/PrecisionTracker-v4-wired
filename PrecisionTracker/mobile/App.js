
import React, { useEffect, useState, createContext, useContext, useRef, useCallback, useMemo } from 'react';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {Text, TextInput, Button, FlatList, TouchableOpacity, SafeAreaView, Alert, Image, ScrollView, RefreshControl, ActivityIndicator, Modal, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import Svg, { Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { Platform, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
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
    throw new Error(message);
  }

  return data;
}

// ---------- Design tokens ----------
const palette = {
  background: '#f4f6f8',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#5f6b7d',
  primary: '#2c8a7d',
  primaryStrong: '#1f6a60',
  success: '#219653',
  warning: '#f59e0b',
  danger: '#d14343',
  info: '#2563eb',
};

const spacing = (step = 1) => step * 8;

const typography = {
  h1: 24,
  h2: 18,
  body: 15,
  small: 12,
};

const floatingShadow = Platform.select({
  ios: { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2 },
  default: {},
});

const pillTone = {
  NEW: { fg: palette.info, bg: '#e6eeff', label: 'New' },
  CONTACTED: { fg: palette.primary, bg: '#e6f4f2', label: 'Contacted' },
  ESTIMATING: { fg: palette.warning, bg: '#fdf1d6', label: 'Estimating' },
  CONVERTED: { fg: palette.success, bg: '#e6f6ec', label: 'Converted' },
  CLOSED_LOST: { fg: palette.muted, bg: '#e2e8f0', label: 'Lost' },
  SCHEDULED: { fg: palette.primary, bg: '#e6f4f2', label: 'Scheduled' },
  IN_PROGRESS: { fg: palette.info, bg: '#e6eeff', label: 'In progress' },
  COMPLETE: { fg: palette.success, bg: '#e6f6ec', label: 'Complete' },
  DONE: { fg: palette.success, bg: '#e6f6ec', label: 'Complete' },
  ON_HOLD: { fg: palette.warning, bg: '#fdf1d6', label: 'On hold' },
  CANCELLED: { fg: palette.muted, bg: '#e2e8f0', label: 'Cancelled' },
  DRAFT: { fg: palette.muted, bg: '#e2e8f0', label: 'Draft' },
  SENT: { fg: palette.info, bg: '#e6eeff', label: 'Sent' },
  PART_PAID: { fg: palette.warning, bg: '#fdf1d6', label: 'Part paid' },
  PAID: { fg: palette.success, bg: '#e6f6ec', label: 'Paid' },
  VOID: { fg: palette.muted, bg: '#f1f5f9', label: 'Void' },
};

const toneMap = {
  primary: { fg: palette.primaryStrong, bg: '#e0f3f0' },
  success: { fg: palette.success, bg: '#e6f6ec' },
  warning: { fg: palette.warning, bg: '#fdf1d6' },
  danger: { fg: palette.danger, bg: '#fde4e4' },
  info: { fg: palette.info, bg: '#e6eeff' },
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
      <Text style={{ color: palette.muted, fontSize: typography.small, textTransform: 'uppercase', fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: colors.fg, fontSize: 28, fontWeight: '800', marginTop: spacing(0.5) }}>{value}</Text>
      {subtitle ? <Text style={{ color: palette.muted, fontSize: typography.small, marginTop: spacing(0.5) }}>{subtitle}</Text> : null}
    </SurfaceCard>
  );
}

function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(1.5) }}>
      <Text style={{ color: palette.text, fontSize: typography.h2, fontWeight: '700' }}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={{ paddingHorizontal: spacing(1), paddingVertical: spacing(0.5) }}>
          <Text style={{ color: palette.primary, fontWeight: '600', fontSize: typography.small }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function QuickAction({ label, onPress, tone = 'primary' }) {
  const toneStyles = (() => {
    switch (tone) {
      case 'danger':
        return { borderColor: '#fecdd3', backgroundColor: '#fee2e2', textColor: palette.danger };
      case 'success':
        return { borderColor: '#bbf7d0', backgroundColor: '#dcfce7', textColor: palette.success };
      case 'warning':
        return { borderColor: '#fde68a', backgroundColor: '#fef3c7', textColor: palette.warning };
      case 'muted':
        return { borderColor: palette.border, backgroundColor: palette.surface, textColor: palette.muted };
      default:
        return { borderColor: palette.border, backgroundColor: palette.surfaceMuted, textColor: palette.primary };
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
      <Text style={{ color: toneStyles.textColor, fontWeight: '600', fontSize: typography.small }}>{label}</Text>
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
          const shortLabel = displayName.length > 22 ? `${displayName.slice(0, 21)}…` : displayName;
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
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leads, setLeads] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

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
        setLeads(data);
        db.transaction(tx => {
          tx.executeSql && tx.executeSql('DELETE FROM leads_cache;');
          data.forEach(l =>
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
                const fallback = rows?._array || [];
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

  const topLeads = leads.slice(0, 3);
  const topJobs = jobs.slice(0, 3);
  const nextTasks = tasks.filter(t => !isTaskCompleted(t.status)).slice(0, 3);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing(2), paddingVertical: spacing(2), paddingBottom: spacing(5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
      >
        <Text style={{ color: palette.text, fontSize: typography.h1, fontWeight: '700', marginBottom: spacing(2) }}>Dashboard</Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <View style={{ flexBasis: '48%', marginBottom: spacing(2) }}>
            <SummaryCard
              title="Leads"
              value={leads.length}
              subtitle={`${newLeads} new to triage`}
              tone="info"
              onPress={() => navigation.navigate('Leads')}
            />
          </View>
          <View style={{ flexBasis: '48%', marginBottom: spacing(2) }}>
            <SummaryCard
              title="Jobs"
              value={jobs.length}
              subtitle={`${activeJobs} active`}
              tone="primary"
              onPress={() => navigation.navigate('Jobs')}
            />
          </View>
          <View style={{ flexBasis: '48%', marginBottom: spacing(2) }}>
            <SummaryCard
              title="Tasks"
              value={openTasks}
              subtitle={`Open of ${tasks.length}`}
              tone="warning"
              onPress={() => navigation.navigate('Jobs')}
            />
          </View>
          <View style={{ flexBasis: '48%', marginBottom: spacing(2) }}>
            <SummaryCard
              title="Invoices"
              value={formatCurrency(outstandingValue)}
              subtitle={`${overdueCount} overdue | ${formatCurrency(collectedValue)} collected`}
              tone="success"
              onPress={() => navigation.navigate('Invoices')}
            />
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
                  <QuickAction label="Convert" onPress={() => navigation.navigate('Jobs')} />
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
      <Button title="Save Signature" onPress={save} />
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
      await api('/users','POST', { email: trimmedEmail, fullName: trimmedName || undefined, role: normalizeRole(role) }, token);
      resetForm();
      await load();
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
          } catch (e) {
            Alert.alert('Error', e.message || 'Unable to delete invoice.');
          }
        }
      }
    ]);
  }, [token, load]);

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
function JobsKanbanScreen({ navigation }){
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
  const statusOrder = ['SCHEDULED','IN_PROGRESS','ON_HOLD','DONE','COMPLETE','CANCELLED'];

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
      status: 'SCHEDULED',
      startDate: newJobStartDate || null,
      endDate: newJobDueDate || null,
      notes: newJobNotes.trim() || null,
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

  const removeJob = async (id) => {
    Alert.alert('Delete Job', `Delete job #${id}?`, [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async () => {
        try {
          await api(`/jobs/${id}`,'DELETE',null,token);
          setJobs(prev => prev.filter(job => job.id !== id));
          db.transaction(tx => tx.executeSql && tx.executeSql('DELETE FROM jobs_cache WHERE id=?', [id]));
        } catch(e) {
          Alert.alert('Error', e.message || 'Unable to delete job');
        }
      } }
    ]);
  };

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
    return [...jobs].sort((a, b) => {
      const statusDiff = rank(a.status) - rank(b.status);
      if (statusDiff !== 0) return statusDiff;
      const startA = parseDateSafe(a.startDate);
      const startB = parseDateSafe(b.startDate);
      if (startA && startB) return startA - startB;
      if (startA) return -1;
      if (startB) return 1;
      return (b.id || 0) - (a.id || 0);
    });
  }, [jobs, statusOrder]);

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
    { label:'Pause', value:'ON_HOLD', tone:'warning' },
    { label:'Wrap up', value:'DONE', tone:'success' },
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

        {loading && !refreshing && jobs.length === 0 ? (
          <SurfaceCard style={{ alignItems:'center', paddingVertical: spacing(6), marginBottom: spacing(3) }}>
            <ActivityIndicator color={palette.primary} />
            <Text style={{ color: palette.muted, marginTop: spacing(1.5) }}>Loading jobs...</Text>
          </SurfaceCard>
        ) : null}

        {groupedJobs.length === 0 ? (
          <SurfaceCard>
            <Text style={{ color: palette.muted }}>No jobs yet. Convert a lead or add a job to get started.</Text>
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
                    {job.notes ? <Text style={{ color: palette.muted, marginTop: spacing(1) }} numberOfLines={3}>{job.notes}</Text> : null}
                    <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(2) }}>
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
  const [changeOrders, setCO] = useState([]);
  const [title, setTitle] = useState('');
  const [amountDelta, setAmountDelta] = useState('0');
  const roleKey = normalizeRole(user?.role);
  const canManageChangeOrders = ['ADMIN','SUPERVISOR','ESTIMATOR'].includes(roleKey);
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
    } catch(e) { }
  }, [jobId, token]);
  useEffect(()=>{ loadJob(); loadCO(); },[loadJob, loadCO]);
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
      loadJob();
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
          Alert.alert('Error', e.message || 'Unable to delete job');
        }
      }}
    ]);
  };
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
            style={{ minHeight: 112, textAlignVertical: 'top' }}
          />
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
        </SurfaceCard>

        <SurfaceCard style={{ padding: spacing(2.5), marginBottom: spacing(3) }}>
          <Text style={{ color: palette.muted, fontSize: typography.small, fontWeight:'700', textTransform:'uppercase', marginBottom: spacing(1) }}>
            Jobsite
          </Text>
          <FormInput placeholder="Address line 1" value={jobAddressLine1} onChangeText={setJobAddressLine1} />
          <FormInput placeholder="Address line 2" value={jobAddressLine2} onChangeText={setJobAddressLine2} />
          <View style={{ flexDirection:'row', columnGap: spacing(1.5) }}>
            <FormInput placeholder="City" value={jobCity} onChangeText={setJobCity} style={{ flex:1, marginBottom: 0 }} />
            <FormInput
              placeholder="State"
              value={jobStateCode}
              onChangeText={setJobStateCode}
              autoCapitalize="characters"
              style={{ width: 96, marginBottom: 0 }}
            />
            <FormInput
              placeholder="ZIP"
              value={jobZip}
              onChangeText={setJobZip}
              keyboardType="numeric"
              style={{ width: 112, marginBottom: 0 }}
            />
          </View>
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
      { text:'Delete', style:'destructive', onPress: async ()=>{ await api(`/tasks/${id}`,'DELETE',null,token); load(); } },
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
      { text:'Delete', style:'destructive', onPress: async ()=>{ await api(`/calendar/${id}`,'DELETE',null,token); load(); } },
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

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/leads', 'GET', null, token);
      setLeads(data);
      db.transaction(tx => {
        tx.executeSql && tx.executeSql('DELETE FROM leads_cache;');
        data.forEach(l => tx.executeSql && tx.executeSql(
          'INSERT OR REPLACE INTO leads_cache (id, description, status) VALUES (?,?,?)',
          [l.id, l.description || '', l.status || 'NEW']
        ));
      });
    } catch(e){
      db.transaction(tx =>
        tx.executeSql && tx.executeSql('SELECT id, description, status FROM leads_cache', [], (_, { rows }) => setLeads(rows._array || []))
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
          setLeads(prev => prev.filter(l => l.id !== lead.id));
          db.transaction(tx => tx.executeSql && tx.executeSql('DELETE FROM leads_cache WHERE id=?', [lead.id]));
        } catch(err) {
          Alert.alert('Error', err.message || 'Unable to delete lead');
        }
      }}
    ]);
  }, [token]);

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
        <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(2) }}>
          <QuickAction label="Open" onPress={() => navigation.navigate('EstimateEditor', { leadId: lead.id })} />
          <QuickAction label="Convert" tone="success" onPress={() => navigation.navigate('Jobs')} />
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
                <Text style={{ color: palette.text, fontSize: typography.h1, fontWeight:'700' }}>Leads</Text>
                <Text style={{ color: palette.muted, marginTop: spacing(0.5) }}>Keep the funnel moving</Text>
              </View>
              <QuickAction label="New lead" onPress={() => navigation.navigate('NewLead')} />
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
  const [showCustomerSection, setShowCustomerSection] = useState(false);
  const [showJobsiteSection, setShowJobsiteSection] = useState(false);
  const statuses = ['NEW','CONTACTED','ESTIMATING','CONVERTED','CLOSED_LOST'];

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
          <View style={{ flexDirection:'row', columnGap: spacing(1.5), marginBottom: spacing(1.5) }}>
            <TextInput
              placeholder="Qty"
              placeholderTextColor={palette.muted}
              value={qty}
              onChangeText={setQty}
              keyboardType="numeric"
              style={{
                flex:1,
                borderWidth:1,
                borderColor: palette.border,
                borderRadius: 12,
                padding: spacing(2),
                color: palette.text,
                backgroundColor: palette.surfaceMuted,
              }}
            />
            <TextInput
              placeholder="Unit price"
              placeholderTextColor={palette.muted}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              style={{
                flex:1,
                borderWidth:1,
                borderColor: palette.border,
                borderRadius: 12,
                padding: spacing(2),
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
          <QuickAction label={syncing ? 'Syncing...' : 'Sync now'} tone={syncing ? 'muted' : 'primary'} onPress={syncing ? undefined : handleSync} />
        </SurfaceCard>

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
                {job.notes ? <Text style={{ color: palette.muted, marginTop: spacing(1) }}>{job.notes}</Text> : null}
                <View style={{ flexDirection:'row', flexWrap:'wrap', columnGap: spacing(1), rowGap: spacing(1), marginTop: spacing(2) }}>
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
        <Text style={{ color: palette.text, fontSize: typography.h1, fontWeight:'700', marginBottom: spacing(2) }}>Profile</Text>
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
        tabBarStyle: { backgroundColor: '#fff', display: hideTabs ? 'none' : 'flex' },
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
      <SafeAreaView style={{ backgroundColor: '#0B0C10' }}>
        <View style={{ paddingHorizontal: spacing(2), paddingVertical: spacing(1.5), flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            accessibilityLabel="Open navigation menu"
            accessibilityRole="button"
            style={{ padding: spacing(1) }}
          >
            <View style={{ width: 24, height: 2, backgroundColor: '#fff', borderRadius: 999, marginBottom: 4 }} />
            <View style={{ width: 24, height: 2, backgroundColor: '#fff', borderRadius: 999, marginBottom: 4 }} />
            <View style={{ width: 24, height: 2, backgroundColor: '#fff', borderRadius: 999 }} />
          </TouchableOpacity>
          <Text style={{ color:'#fff', fontSize: typography.h1, fontWeight:'700' }}>Precision Tracker</Text>
          <View style={{ width: 24 }} />
        </View>
      </SafeAreaView>
      <Modal
        visible={menuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={{ flex:1, backgroundColor:'rgba(15,23,42,0.6)', justifyContent:'flex-start', padding: spacing(3) }}>
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
                    backgroundColor: selected ? '#d9f2ed' : palette.surfaceMuted,
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

function LoginScreen() {
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
      Alert.alert('Welcome', 'Logged in');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, marginBottom: 16 }}>PrecisionTracker</Text>
      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, padding: 12, marginBottom: 12 }}
      />
      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, padding: 12, marginBottom: 12 }}
      />
      <Button title={busy ? 'Signing in...' : 'Sign in'} onPress={login} disabled={busy} />
    </View>
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
                <Stack.Screen name="Login" component={LoginScreen} />
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



































