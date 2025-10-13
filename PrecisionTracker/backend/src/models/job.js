const toStringArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(item => (item == null ? '' : String(item).trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const toActivityArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [];
};

export default (sequelize, DataTypes) => {
  const Job = sequelize.define('Job', {
    estimateId: DataTypes.INTEGER,
    customerId: DataTypes.INTEGER,
    jobsiteId: DataTypes.INTEGER,
    name: DataTypes.STRING,
    status: {
      type: DataTypes.ENUM('NEW','SCHEDULED','IN_PROGRESS','ON_HOLD','DONE','COMPLETED','PAID','CLOSED'),
      defaultValue: 'SCHEDULED',
    },
    startDate: DataTypes.DATEONLY,
    endDate: DataTypes.DATEONLY,
    notes: DataTypes.TEXT,
    tags: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue('tags');
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return toStringArray(parsed);
        } catch (e) {
          return toStringArray(raw);
        }
      },
      set(value) {
        const normalized = toStringArray(value);
        this.setDataValue('tags', normalized.length ? JSON.stringify(normalized) : null);
      },
    },
    activityLog: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue('activityLog');
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return toActivityArray(parsed);
        } catch (e) {
          return [];
        }
      },
      set(value) {
        const normalized = toActivityArray(value);
        this.setDataValue('activityLog', normalized.length ? JSON.stringify(normalized) : null);
      },
    },
    assignedTo: DataTypes.INTEGER,
  }, { tableName: 'jobs' });
  return Job;
};
