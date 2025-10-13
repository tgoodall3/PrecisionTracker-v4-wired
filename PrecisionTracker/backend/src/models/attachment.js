export default (sequelize, DataTypes) => {
  const Attachment = sequelize.define('Attachment', {
    entityType: { type: DataTypes.ENUM('LEAD','ESTIMATE','JOB','TASK'), allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: false },
    fileUrl: { type: DataTypes.TEXT, allowNull: false },
    caption: DataTypes.STRING,
    uploadedBy: DataTypes.INTEGER
  }, { tableName: 'attachments' });
  return Attachment;
};
