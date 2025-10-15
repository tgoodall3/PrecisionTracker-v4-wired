import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type UserRole = 'ADMIN' | 'ESTIMATOR' | 'SUPERVISOR' | 'TECH';

export interface UserAttributes {
  id: number;
  fullName: string | null;
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  pushToken: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserCreationAttributes = Optional<
  UserAttributes,
  'id' | 'fullName' | 'pushToken' | 'active' | 'createdAt' | 'updatedAt'
>;

export class User extends Model<UserAttributes, UserCreationAttributes> {
  declare id: number;
  declare fullName: string | null;
  declare email: string;
  declare passwordHash: string;
  declare role: UserRole;
  declare active: boolean;
  declare pushToken: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export const initUserModel = (sequelize: Sequelize): typeof User => {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      fullName: {
        type: DataTypes.STRING,
        allowNull: true
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false
      },
      role: {
        type: DataTypes.ENUM('ADMIN', 'ESTIMATOR', 'SUPERVISOR', 'TECH'),
        allowNull: false,
        defaultValue: 'TECH'
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      pushToken: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      tableName: 'users',
      sequelize
    }
  );

  return User;
};
