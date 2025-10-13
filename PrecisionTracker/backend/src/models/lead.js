export default (sequelize, DataTypes) => {
  const Lead = sequelize.define('Lead', {
    customerId: DataTypes.INTEGER,
    jobsiteId: DataTypes.INTEGER,
    description: DataTypes.TEXT,
    status: { type: DataTypes.ENUM('NEW','CONTACTED','ESTIMATING','CLOSED_LOST','CONVERTED'), defaultValue: 'NEW' }
  }, { tableName: 'leads' });
  return Lead;
};
