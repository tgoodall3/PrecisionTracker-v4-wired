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

export default (sequelize, DataTypes) => {
  const Lead = sequelize.define('Lead', {
    customerId: DataTypes.INTEGER,
    jobsiteId: DataTypes.INTEGER,
    description: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('NEW','CONTACTED','ESTIMATING','CLOSED_LOST','CONVERTED'), defaultValue: 'NEW' },
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
  }, { tableName: 'leads' });
  return Lead;
};
