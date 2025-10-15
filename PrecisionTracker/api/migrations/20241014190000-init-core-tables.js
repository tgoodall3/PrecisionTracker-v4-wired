'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('users', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      fullName: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING, allowNull: false },
      role: {
        type: DataTypes.ENUM('ADMIN', 'ESTIMATOR', 'SUPERVISOR', 'TECH'),
        allowNull: false,
        defaultValue: 'TECH'
      },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      pushToken: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('customers', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: true },
      billingAddress: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('jobsites', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      addressLine1: { type: DataTypes.STRING, allowNull: true },
      addressLine2: { type: DataTypes.STRING, allowNull: true },
      city: { type: DataTypes.STRING, allowNull: true },
      state: { type: DataTypes.STRING, allowNull: true },
      zip: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('leads', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'customers', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      jobsiteId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'jobsites', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('NEW', 'CONTACTED', 'ESTIMATING', 'CLOSED_LOST', 'CONVERTED'),
        allowNull: false,
        defaultValue: 'NEW'
      },
      tags: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('estimates', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      leadId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'leads', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'customers', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      jobsiteId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'jobsites', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      taxRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      total: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('DRAFT', 'SENT', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'DRAFT'
      },
      signatureDataUrl: { type: DataTypes.TEXT, allowNull: true },
      signaturePngUrl: { type: DataTypes.STRING, allowNull: true },
      customerEmail: { type: DataTypes.STRING, allowNull: true },
      customerPhone: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('estimate_items', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      estimateId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'estimates', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      description: { type: DataTypes.STRING, allowNull: false },
      qty: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1 },
      unit: { type: DataTypes.STRING, allowNull: true },
      unitPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('jobs', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      estimateId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'estimates', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'customers', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      jobsiteId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'jobsites', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      name: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM(
          'NEW',
          'SCHEDULED',
          'IN_PROGRESS',
          'ON_HOLD',
          'DONE',
          'COMPLETED',
          'PAID',
          'CLOSED'
        ),
        allowNull: false,
        defaultValue: 'SCHEDULED'
      },
      startDate: { type: DataTypes.DATEONLY, allowNull: true },
      endDate: { type: DataTypes.DATEONLY, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      tags: { type: DataTypes.TEXT, allowNull: true },
      activityLog: { type: DataTypes.TEXT, allowNull: true },
      assignedTo: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('tasks', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      jobId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      title: { type: DataTypes.STRING, allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      dueDate: { type: DataTypes.DATEONLY, allowNull: true },
      status: {
        type: DataTypes.ENUM('TODO', 'DOING', 'BLOCKED', 'DONE'),
        allowNull: false,
        defaultValue: 'TODO'
      },
      assignedTo: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('invoices', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      jobId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      number: { type: DataTypes.STRING, allowNull: true, unique: true },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      status: {
        type: DataTypes.ENUM('DRAFT', 'SENT', 'PART_PAID', 'PAID', 'VOID'),
        allowNull: false,
        defaultValue: 'DRAFT'
      },
      issuedAt: { type: DataTypes.DATEONLY, allowNull: true },
      dueAt: { type: DataTypes.DATEONLY, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('payments', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      invoiceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'invoices', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      method: {
        type: DataTypes.ENUM('CASH', 'CHECK', 'CARD', 'ACH', 'OTHER'),
        allowNull: false,
        defaultValue: 'OTHER'
      },
      receivedAt: { type: DataTypes.DATEONLY, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('change_orders', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      jobId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      amountDelta: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('calendar_events', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      title: { type: DataTypes.STRING, allowNull: false },
      startAt: { type: DataTypes.DATE, allowNull: true },
      endAt: { type: DataTypes.DATE, allowNull: true },
      jobId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      assigneeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('attachments', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      entityType: {
        type: DataTypes.ENUM('LEAD', 'ESTIMATE', 'JOB', 'TASK'),
        allowNull: false
      },
      entityId: { type: DataTypes.INTEGER, allowNull: false },
      fileUrl: { type: DataTypes.TEXT, allowNull: false },
      caption: { type: DataTypes.STRING, allowNull: true },
      uploadedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('reminders', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      jobId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'jobs', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      channel: {
        type: DataTypes.ENUM('EMAIL', 'SMS', 'PUSH'),
        allowNull: false,
        defaultValue: 'EMAIL'
      },
      template: { type: DataTypes.STRING, allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: true },
      scheduledFor: { type: DataTypes.DATE, allowNull: false },
      status: {
        type: DataTypes.ENUM('PENDING', 'SENT', 'CANCELLED', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      lastError: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    const indexPromises = [
      queryInterface.addIndex('users', ['updatedAt']),
      queryInterface.addIndex('customers', ['updatedAt']),
      queryInterface.addIndex('jobsites', ['customerId']),
      queryInterface.addIndex('jobsites', ['updatedAt']),
      queryInterface.addIndex('leads', ['customerId']),
      queryInterface.addIndex('leads', ['jobsiteId']),
      queryInterface.addIndex('leads', ['updatedAt']),
      queryInterface.addIndex('estimates', ['leadId']),
      queryInterface.addIndex('estimates', ['customerId']),
      queryInterface.addIndex('estimates', ['jobsiteId']),
      queryInterface.addIndex('estimates', ['updatedAt']),
      queryInterface.addIndex('estimate_items', ['estimateId']),
      queryInterface.addIndex('estimate_items', ['updatedAt']),
      queryInterface.addIndex('jobs', ['estimateId']),
      queryInterface.addIndex('jobs', ['customerId']),
      queryInterface.addIndex('jobs', ['jobsiteId']),
      queryInterface.addIndex('jobs', ['assignedTo']),
      queryInterface.addIndex('jobs', ['updatedAt']),
      queryInterface.addIndex('tasks', ['jobId']),
      queryInterface.addIndex('tasks', ['assignedTo']),
      queryInterface.addIndex('tasks', ['updatedAt']),
      queryInterface.addIndex('invoices', ['jobId']),
      queryInterface.addIndex('invoices', ['updatedAt']),
      queryInterface.addIndex('payments', ['invoiceId']),
      queryInterface.addIndex('payments', ['updatedAt']),
      queryInterface.addIndex('change_orders', ['jobId']),
      queryInterface.addIndex('change_orders', ['updatedAt']),
      queryInterface.addIndex('calendar_events', ['jobId']),
      queryInterface.addIndex('calendar_events', ['assigneeId']),
      queryInterface.addIndex('calendar_events', ['updatedAt']),
      queryInterface.addIndex('attachments', ['entityType', 'entityId']),
      queryInterface.addIndex('attachments', ['uploadedBy']),
      queryInterface.addIndex('attachments', ['updatedAt']),
      queryInterface.addIndex('reminders', ['jobId']),
      queryInterface.addIndex('reminders', ['userId']),
      queryInterface.addIndex('reminders', ['status']),
      queryInterface.addIndex('reminders', ['updatedAt'])
    ];

    await Promise.all(indexPromises);
  },

  async down(queryInterface) {
    const dropEnums = async (table, column, queryInterfaceInstance) => {
      if (queryInterfaceInstance.sequelize.options.dialect === 'postgres') {
        const enumName = `${table}_${column}_enum`;
        await queryInterfaceInstance.sequelize.query(`DROP TYPE IF EXISTS "${enumName}" CASCADE;`);
      }
    };

    const tables = [
      'reminders',
      'attachments',
      'calendar_events',
      'change_orders',
      'payments',
      'invoices',
      'tasks',
      'jobs',
      'estimate_items',
      'estimates',
      'leads',
      'jobsites',
      'customers',
      'users'
    ];

    for (const table of tables) {
      await queryInterface.dropTable(table);
    }

    await dropEnums('users', 'role', queryInterface);
    await dropEnums('leads', 'status', queryInterface);
    await dropEnums('estimates', 'status', queryInterface);
    await dropEnums('jobs', 'status', queryInterface);
    await dropEnums('tasks', 'status', queryInterface);
    await dropEnums('invoices', 'status', queryInterface);
    await dropEnums('payments', 'method', queryInterface);
    await dropEnums('change_orders', 'status', queryInterface);
    await dropEnums('attachments', 'entityType', queryInterface);
    await dropEnums('reminders', 'channel', queryInterface);
    await dropEnums('reminders', 'status', queryInterface);
  }
};
