export default (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
    invoiceId: DataTypes.INTEGER,
    amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    method: { type: DataTypes.ENUM('CASH','CHECK','CARD','ACH','OTHER'), defaultValue: 'OTHER' },
    receivedAt: DataTypes.DATEONLY
  }, { tableName: 'payments' });
  return Payment;
};
