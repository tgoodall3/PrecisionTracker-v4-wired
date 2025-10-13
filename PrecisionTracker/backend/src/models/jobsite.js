export default (sequelize, DataTypes) => {
  const Jobsite = sequelize.define('Jobsite', {
    customerId: DataTypes.INTEGER,
    addressLine1: DataTypes.STRING,
    addressLine2: DataTypes.STRING,
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    zip: DataTypes.STRING
  }, { tableName: 'jobsites' });
  return Jobsite;
};
