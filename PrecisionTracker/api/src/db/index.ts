import sequelize from './sequelize';
import { initUserModel, User } from './models/user';

let modelsInitialized = false;

const initializeModels = (): void => {
  if (modelsInitialized) {
    return;
  }

  initUserModel(sequelize);
  modelsInitialized = true;
};

initializeModels();

export { sequelize, initializeModels, User };
