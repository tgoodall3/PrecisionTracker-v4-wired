export default (sequelize, DataTypes) => {
  const Job = sequelize.define('Job', {
    estimateId: DataTypes.INTEGER,
    customerId: DataTypes.INTEGER,
    jobsiteId: DataTypes.INTEGER,
    name: DataTypes.STRING,
    status: { type: DataTypes.ENUM('SCHEDULED','IN_PROGRESS','ON_HOLD','DONE','CLOSED'), defaultValue: 'SCHEDULED' },
    startDate: DataTypes.DATEONLY,
    endDate: DataTypes.DATEONLY,
    notes: DataTypes.TEXT,
    assignedTo: DataTypes.INTEGER
  }, { tableName: 'jobs' });
  return Job;
};
