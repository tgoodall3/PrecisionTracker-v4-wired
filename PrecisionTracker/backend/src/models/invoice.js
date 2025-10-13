export default (sequelize, DataTypes) => {
  const Invoice = sequelize.define('Invoice', {
    jobId: DataTypes.INTEGER,
    number: { type: DataTypes.STRING, unique: true },
    amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    status: { type: DataTypes.ENUM('DRAFT','SENT','PART_PAID','PAID','VOID'), defaultValue: 'DRAFT' },
    issuedAt: DataTypes.DATEONLY,
    dueAt: DataTypes.DATEONLY
  }, { tableName: 'invoices' });
  return Invoice;
};
