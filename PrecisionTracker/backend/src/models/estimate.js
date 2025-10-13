export default (sequelize, DataTypes) => {
  const Estimate = sequelize.define('Estimate', {
    leadId: DataTypes.INTEGER,
    customerId: DataTypes.INTEGER,
    jobsiteId: DataTypes.INTEGER,
    subtotal: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
    taxRate: { type: DataTypes.DECIMAL(5,2), defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
    status: { type: DataTypes.ENUM('DRAFT','SENT','APPROVED','REJECTED'), defaultValue: 'DRAFT' },
    signatureDataUrl: { type: DataTypes.TEXT },
    signaturePngUrl: { type: DataTypes.STRING },
    customerEmail: DataTypes.STRING,
    customerPhone: DataTypes.STRING
  }, { tableName: 'estimates' });
  return Estimate;
};
