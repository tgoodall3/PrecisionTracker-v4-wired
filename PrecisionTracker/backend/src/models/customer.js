export default (sequelize, DataTypes) => {
  const Customer = sequelize.define('Customer', {
    name: { type: DataTypes.STRING, allowNull: false },
    phone: DataTypes.STRING,
    email: DataTypes.STRING,
    billingAddress: DataTypes.TEXT
  }, { tableName: 'customers' });
  return Customer;
};
