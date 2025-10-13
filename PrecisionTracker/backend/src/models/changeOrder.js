
export default (sequelize, DataTypes) => {
  const ChangeOrder = sequelize.define('ChangeOrder', {
    jobId: DataTypes.INTEGER,
    title: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    amountDelta: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
    status: { type: DataTypes.ENUM('PENDING','APPROVED','REJECTED'), defaultValue: 'PENDING' }
  }, { tableName: 'change_orders' });
  return ChangeOrder;
};
