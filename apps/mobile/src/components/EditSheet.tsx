import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FIELD_BY_KEY,
  GROUP_BY_KEY,
  normalizeValue,
  type FieldDef,
  type FieldValue,
  type JobDetailDto,
  type LineValues,
} from '@formcast/shared';
import { addDays, isoDay } from '@/lib/date';
import { colors, fonts } from '@/lib/theme';
import { useDrafts, type Draft } from '@/voice/drafts';
import { Button, T } from './ui';

export type EditTarget = { kind: 'field'; fieldKey: string } | { kind: 'line'; lineId?: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const asText = (v: FieldValue | undefined) => (v === undefined || Array.isArray(v) || typeof v === 'boolean' ? '' : String(v));

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceOn]}
    >
      <T style={[styles.choiceText, selected && { color: '#FFFFFF' }]}>{label}</T>
    </Pressable>
  );
}

function FieldEditor({ def, job, draft, jobId, onDone }: { def: FieldDef; job: JobDetailDto; draft: Draft; jobId: string; onDone: () => void }) {
  const committed = def.key === 'priority' ? job.priority : def.key === 'tags' ? job.tags : job.values[def.key];
  const op = draft.pending.fieldOps.find((o) => o.fieldKey === def.key);
  const current = op ? (op.op === 'set' ? op.value : undefined) : committed;

  const [text, setText] = useState(asText(current));
  const [choice, setChoice] = useState<FieldValue | undefined>(current);
  const [error, setError] = useState<string | null>(null);
  const store = useDrafts.getState();
  const key = `field:${def.key}`;

  const apply = (value: FieldValue | undefined) => {
    if (value === undefined) {
      if (committed === undefined || def.key === 'priority') store.remove(jobId, key);
      else store.put(jobId, { op: 'clear', fieldKey: def.key });
    } else if (same(value, committed)) {
      store.remove(jobId, key);
    } else {
      store.put(jobId, { op: 'set', fieldKey: def.key, value });
    }
    onDone();
  };

  const save = () => {
    if (def.type === 'select' || def.type === 'boolean' || def.type === 'multiselect') return apply(choice);
    if (!text.trim()) return apply(undefined);
    const value = normalizeValue(def, text);
    if (value === undefined) {
      setError(
        def.type === 'time' ? 'Enter a time like 10:30.' : def.type === 'date' ? 'Enter a date like 2027-10-14.' : def.type === 'number' ? 'Enter a number.' : 'Enter a value.',
      );
      return;
    }
    apply(value);
  };

  const input = (props: Partial<React.ComponentProps<typeof TextInput>>) => (
    <View style={styles.inputRow}>
      <TextInput
        accessibilityLabel={def.label}
        style={[styles.input, props.multiline && styles.multiline]}
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(null);
        }}
        autoFocus
        // A return key type on a number pad makes RN add its own floating Done bar; the sheet already has one.
        returnKeyType={props.multiline || props.keyboardType === 'decimal-pad' ? undefined : 'done'}
        onSubmitEditing={props.multiline ? undefined : save}
        {...props}
      />
      {def.unit ? <T style={styles.unit}>{def.unit}</T> : null}
    </View>
  );

  return (
    <>
      {def.type === 'text' && input({ multiline: def.key === 'remarks', placeholder: def.key === 'remarks' ? 'What did you notice or fix?' : undefined })}
      {def.type === 'number' && input({ keyboardType: 'decimal-pad', placeholder: '0' })}
      {def.type === 'time' && (
        <>
          {input({ keyboardType: 'numbers-and-punctuation', placeholder: '10:30' })}
          <View style={styles.choices}>
            <Choice
              label="Now"
              selected={false}
              onPress={() => setText(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' }))}
            />
          </View>
        </>
      )}
      {def.type === 'date' && (
        <>
          {input({ keyboardType: 'numbers-and-punctuation', placeholder: 'YYYY-MM-DD' })}
          <View style={styles.choices}>
            <Choice label="In 1 year" selected={text === addDays(isoDay(), 365)} onPress={() => setText(addDays(isoDay(), 365))} />
            <Choice label="In 2 years" selected={text === addDays(isoDay(), 730)} onPress={() => setText(addDays(isoDay(), 730))} />
          </View>
        </>
      )}
      {def.type === 'boolean' && (
        <View style={styles.choices}>
          <Choice label="Yes" selected={choice === true} onPress={() => setChoice(true)} />
          <Choice label="No" selected={choice === false} onPress={() => setChoice(false)} />
        </View>
      )}
      {def.type === 'select' && (
        <View style={styles.choices}>
          {def.options?.map((o) => (
            <Choice key={o.value} label={o.label} selected={choice === o.value} onPress={() => setChoice(o.value)} />
          ))}
        </View>
      )}
      {def.type === 'multiselect' && (
        <View style={styles.choices}>
          {def.options?.map((o) => {
            const list = (choice as string[] | undefined) ?? [];
            const on = list.includes(o.value);
            return (
              <Choice
                key={o.value}
                label={o.value}
                selected={on}
                onPress={() => setChoice(on ? list.filter((v) => v !== o.value) : [...list, o.value])}
              />
            );
          })}
        </View>
      )}
      {error ? <T style={styles.error}>{error}</T> : null}
      <View style={styles.actions}>
        {def.key !== 'priority' && (current !== undefined || def.type === 'multiselect') ? (
          <Button title="Clear" variant="quiet" onPress={() => apply(def.type === 'multiselect' ? [] : undefined)} style={{ flex: 1 }} />
        ) : null}
        <Button title="Done" onPress={save} style={{ flex: 2 }} />
      </View>
    </>
  );
}

function LineEditor({ lineId, job, draft, jobId, onDone }: { lineId?: string; job: JobDetailDto; draft: Draft; jobId: string; onDone: () => void }) {
  const group = GROUP_BY_KEY.get('materials')!;
  const committed = job.lines.find((l) => l.id === lineId);
  const op = draft.pending.lineOps.find((o) => o.lineId === lineId);
  const start: LineValues = { ...(committed?.values ?? {}), ...(op?.values ?? {}) };

  const [material, setMaterial] = useState(String(start.material ?? ''));
  const [quantity, setQuantity] = useState(start.quantity !== undefined ? String(start.quantity) : '');
  const [unit, setUnit] = useState<string | undefined>(start.unit as string | undefined);
  const [error, setError] = useState<string | null>(null);
  const store = useDrafts.getState();
  const col = (k: string) => group.columns.find((c) => c.key === k)!;

  const save = () => {
    const values: LineValues = {};
    const m = normalizeValue(col('material'), material);
    const q = normalizeValue(col('quantity'), quantity);
    if (m === undefined) return setError('Enter what you used.');
    if (q === undefined) return setError('Enter a quantity.');
    if (!unit) return setError('Pick a unit.');
    values.material = m as string;
    values.quantity = q as number;
    values.unit = unit;

    if (committed) {
      const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => !same(committed.values[k], v)));
      if (!Object.keys(changed).length) store.remove(jobId, `line:${committed.id}`);
      else store.put(jobId, { op: 'update', groupKey: 'materials', lineId: committed.id, values: changed });
    } else {
      store.put(jobId, { op: 'create', groupKey: 'materials', lineId: lineId ?? `tmp_${Date.now()}`, values });
    }
    onDone();
  };

  const remove = () => {
    if (committed) store.put(jobId, { op: 'delete', groupKey: 'materials', lineId: committed.id });
    else if (lineId) store.remove(jobId, `line:${lineId}`);
    onDone();
  };

  return (
    <>
      <T style={styles.label}>Material</T>
      <TextInput accessibilityLabel="Material" style={styles.input} value={material} onChangeText={(t) => (setMaterial(t), setError(null))} placeholder="Cable" autoFocus={!lineId} />
      <T style={styles.label}>Quantity</T>
      <TextInput accessibilityLabel="Quantity" style={styles.input} value={quantity} onChangeText={(t) => (setQuantity(t), setError(null))} keyboardType="decimal-pad" placeholder="12" />
      <View style={styles.choices}>
        {col('unit').options?.map((o) => (
          <Choice key={o.value} label={o.label} selected={unit === o.value} onPress={() => (setUnit(o.value), setError(null))} />
        ))}
      </View>
      {error ? <T style={styles.error}>{error}</T> : null}
      <View style={styles.actions}>
        {lineId ? <Button title="Remove" variant="danger" onPress={remove} style={{ flex: 1 }} /> : null}
        <Button title={lineId ? 'Done' : 'Add'} onPress={save} style={{ flex: 2 }} />
      </View>
    </>
  );
}

/** Bottom sheet to change a field or a material line by hand. */
export function EditSheet({ target, job, draft, jobId, onClose }: { target: EditTarget | null; job: JobDetailDto; draft: Draft; jobId: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<EditTarget | null>(target);
  useEffect(() => {
    if (target) setShown(target);
  }, [target]);
  if (!shown) return null;

  const title =
    shown.kind === 'field'
      ? FIELD_BY_KEY.get(shown.fieldKey)?.label ?? 'Edit'
      : shown.lineId
        ? 'Edit material'
        : 'Add material';

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose} onDismiss={() => setShown(null)}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <View style={styles.handle} />
          <T style={styles.title}>{title}</T>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
            {shown.kind === 'field' ? (
              <FieldEditor key={shown.fieldKey} def={FIELD_BY_KEY.get(shown.fieldKey)!} job={job} draft={draft} jobId={jobId} onDone={onClose} />
            ) : (
              <LineEditor key={shown.lineId ?? 'new'} lineId={shown.lineId} job={job} draft={draft} jobId={jobId} onDone={onClose} />
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22,24,26,0.48)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 20, gap: 14, maxHeight: '85%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5D8D3' },
  title: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.4 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 17, color: colors.ink },
  multiline: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  unit: { fontFamily: fonts.mono, fontSize: 15, color: colors.textMuted },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' },
  choiceOn: { backgroundColor: colors.ink },
  choiceText: { fontFamily: fonts.medium, fontSize: 15 },
  error: { color: colors.red, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
