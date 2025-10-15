'use strict';

const bcrypt = require('bcryptjs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const passwordHash = await bcrypt.hash('admin123!', 10);

    await queryInterface.bulkInsert(
      'users',
      [
        {
          fullName: 'Demo Admin',
          email: 'admin@demo.io',
          passwordHash,
          role: 'ADMIN',
          active: true,
          pushToken: null,
          createdAt: now,
          updatedAt: now
        }
      ],
      {
        ignoreDuplicates: true
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: 'admin@demo.io' });
  }
};
