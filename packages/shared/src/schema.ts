// The fixed form schema for a boiler maintenance job. Hardcoded on purpose:
// the brief scopes out a form builder.

export type FieldType = 'text' | 'number' | 'time' | 'date' | 'boolean' | 'select' | 'multiselect';

export type SectionKey = 'header' | 'appliance' | 'measurements' | 'conclusion' | 'job';

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  section: SectionKey;
  type: FieldType;
  unit?: string;
  options?: Option[];
  /** Can't be cleared, only changed. */
  required?: boolean;
  /** One line for the LLM so it maps speech to the right field. */
  hint: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  type: Exclude<FieldType, 'multiselect' | 'boolean'>;
  required: boolean;
  options?: Option[];
}

export interface LineGroupDef {
  key: string;
  label: string;
  columns: ColumnDef[];
  hint: string;
}

const opts = (...values: string[]): Option[] =>
  values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' ') }));

export const FIELDS: FieldDef[] = [
  { key: 'priority', label: 'Priority', section: 'header', type: 'select', required: true, options: opts('low', 'medium', 'high'), hint: 'Urgency of the job or its follow-up.' },
  { key: 'tags', label: 'Tags', section: 'header', type: 'multiselect', options: opts('warranty', 'follow-up', 'parts-needed'), hint: 'Labels on the job. Urgency is not a tag: "urgent" means priority high.' },

  { key: 'brand', label: 'Brand', section: 'appliance', type: 'text', hint: 'Boiler manufacturer, e.g. Vaillant, Viessmann, Bosch.' },
  { key: 'model', label: 'Model', section: 'appliance', type: 'text', hint: 'Boiler model name.' },
  { key: 'yearBuilt', label: 'Year built', section: 'appliance', type: 'number', hint: 'Four digit year the appliance was built.' },
  { key: 'serialNumber', label: 'Serial number', section: 'appliance', type: 'text', hint: 'Serial / fabrication number, digits and letters only.' },
  { key: 'ratedOutputKw', label: 'Rated output', section: 'appliance', type: 'number', unit: 'kW', hint: 'Nominal power in kilowatt.' },
  { key: 'fuel', label: 'Fuel', section: 'appliance', type: 'select', options: opts('gas', 'oil', 'pellets', 'wood'), hint: 'Fuel type of the appliance.' },

  { key: 'coPpm', label: 'CO', section: 'measurements', type: 'number', unit: 'ppm', hint: 'Carbon monoxide reading in ppm.' },
  { key: 'co2Percent', label: 'CO₂', section: 'measurements', type: 'number', unit: '%', hint: 'Carbon dioxide reading in percent.' },
  { key: 'flueGasTempC', label: 'Flue gas temp', section: 'measurements', type: 'number', unit: '°C', hint: 'Flue gas temperature in degrees Celsius.' },
  { key: 'efficiencyPercent', label: 'Efficiency', section: 'measurements', type: 'number', unit: '%', hint: 'Combustion efficiency in percent.' },

  { key: 'status', label: 'Status', section: 'conclusion', type: 'select', options: [
    { value: 'ok', label: 'OK' },
    { value: 'defects', label: 'Defects' },
    { value: 'unsafe', label: 'Unsafe' },
  ], hint: 'Overall verdict on the appliance: ok, defects found, or unsafe (taken out of service).' },
  { key: 'nextMaintenanceBefore', label: 'Next maintenance before', section: 'conclusion', type: 'date', hint: 'Deadline for the next maintenance, ISO date YYYY-MM-DD.' },
  { key: 'remarks', label: 'Remarks', section: 'conclusion', type: 'text', hint: 'Free text remarks, defects and measures. Keep the technician\'s words, cleaned up.' },

  { key: 'arrivalTime', label: 'Arrival time', section: 'job', type: 'time', hint: 'Time the technician arrived, 24h HH:MM.' },
  { key: 'endTime', label: 'End time', section: 'job', type: 'time', hint: 'Time the work ended, 24h HH:MM.' },
  { key: 'jobComplete', label: 'Job complete', section: 'job', type: 'boolean', hint: 'Whether the job is fully done.' },
];

export const LINE_GROUPS: LineGroupDef[] = [
  {
    key: 'materials',
    label: 'Materials used',
    hint: 'Materials and parts the technician used.',
    columns: [
      { key: 'material', label: 'Material', type: 'text', required: true },
      { key: 'quantity', label: 'Quantity', type: 'number', required: true },
      { key: 'unit', label: 'Unit', type: 'select', required: true, options: ['pcs', 'm', 'l', 'kg'].map((u) => ({ value: u, label: u })) },
    ],
  },
];

export const SECTIONS: { key: Exclude<SectionKey, 'header'>; label: string }[] = [
  { key: 'appliance', label: 'Appliance' },
  { key: 'measurements', label: 'Measurements' },
  { key: 'conclusion', label: 'Conclusion' },
  { key: 'job', label: 'Job' },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));
export const GROUP_BY_KEY = new Map(LINE_GROUPS.map((g) => [g.key, g]));

export const APPLIANCE_KEYS = FIELDS.filter((f) => f.section === 'appliance').map((f) => f.key);
