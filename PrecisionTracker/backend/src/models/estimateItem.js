export default (sequelize, DataTypes) => {
  const EstimateItem = sequelize.define('EstimateItem', {
    estimateId: DataTypes.INTEGER,
    description: { type: DataTypes.STRING, allowNull: false },
    qty: { type: DataTypes.DECIMAL(10,2), defaultValue: 1 },
    unit: DataTypes.STRING,
    unitPrice: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    lineTotal: { 
      type: DataTypes.VIRTUAL,
      get() { 
        const qty = parseFloat(this.getDataValue('qty') || 0);
        const price = parseFloat(this.getDataValue('unitPrice') || 0);
        return (qty * price).toFixed(2);
      }
    }
  }, { tableName: 'estimate_items' });
  return EstimateItem;
};
