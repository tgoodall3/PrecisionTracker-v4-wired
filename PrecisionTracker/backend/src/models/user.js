export default (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    fullName: DataTypes.STRING,
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('ADMIN','ESTIMATOR','SUPERVISOR','TECH'), defaultValue: 'TECH' },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, { tableName: 'users' });
  return User;
};
