export default (sequelize, DataTypes) => {
  const Task = sequelize.define('Task', {
    jobId: DataTypes.INTEGER,
    title: { type: DataTypes.STRING, allowNull: false },
    notes: DataTypes.TEXT,
    dueDate: DataTypes.DATEONLY,
    status: { type: DataTypes.ENUM('TODO','DOING','BLOCKED','DONE'), defaultValue: 'TODO' },
    assignedTo: DataTypes.INTEGER
  }, { tableName: 'tasks' });
  return Task;
};
