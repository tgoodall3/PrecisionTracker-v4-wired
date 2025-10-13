
export default (sequelize, DataTypes) => {
  const CalendarEvent = sequelize.define('CalendarEvent', {
    title: { type: DataTypes.STRING, allowNull: false },
    startAt: DataTypes.DATE,
    endAt: DataTypes.DATE,
    jobId: DataTypes.INTEGER,
    assigneeId: DataTypes.INTEGER,
    notes: DataTypes.TEXT
  }, { tableName: 'calendar_events' });
  return CalendarEvent;
};
