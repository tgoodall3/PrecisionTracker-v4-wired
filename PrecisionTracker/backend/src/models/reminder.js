export default (sequelize, DataTypes) => {
  const Reminder = sequelize.define('Reminder', {
    jobId: { type: DataTypes.INTEGER, allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    channel: { type: DataTypes.ENUM('EMAIL', 'SMS', 'PUSH'), allowNull: false, defaultValue: 'EMAIL' },
    template: { type: DataTypes.STRING, allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: true },
    scheduledFor: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.ENUM('PENDING', 'SENT', 'CANCELLED', 'FAILED'), defaultValue: 'PENDING' },
    lastError: { type: DataTypes.TEXT, allowNull: true }
  }, { tableName: 'reminders' });
  return Reminder;
};
