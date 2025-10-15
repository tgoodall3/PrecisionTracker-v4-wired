'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const dialect = queryInterface.sequelize.getDialect();

    const [[adminUser]] = await queryInterface.sequelize.query(
      "SELECT id FROM users WHERE email = 'admin@demo.io' LIMIT 1;"
    );
    const adminId = adminUser ? adminUser.id : null;

    const customers = [
      {
        id: 1001,
        name: 'Acme Landscaping',
        phone: '(555) 123-4567',
        email: 'office@acmelandscaping.example',
        billingAddress: '101 Main Street\nSpringfield, IL 62704',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 1002,
        name: 'Northwind Properties',
        phone: '(555) 987-6543',
        email: 'ops@northwind.example',
        billingAddress: '500 Market Ave\nChicago, IL 60601',
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('customers', customers, { ignoreDuplicates: true });

    const jobsites = [
      {
        id: 2001,
        customerId: 1001,
        addressLine1: '15 Oak Ridge',
        addressLine2: '',
        city: 'Springfield',
        state: 'IL',
        zip: '62704',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 2002,
        customerId: 1002,
        addressLine1: '900 Industrial Way',
        addressLine2: 'Suite 120',
        city: 'Chicago',
        state: 'IL',
        zip: '60601',
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('jobsites', jobsites, { ignoreDuplicates: true });

    const leads = [
      {
        id: 3001,
        customerId: 1001,
        jobsiteId: 2001,
        description: 'Landscape refresh with seasonal plantings and irrigation tune-up.',
        status: 'ESTIMATING',
        tags: JSON.stringify(['landscape', 'priority']),
        createdAt: now,
        updatedAt: now
      },
      {
        id: 3002,
        customerId: 1002,
        jobsiteId: 2002,
        description: 'Parking lot snow removal contract for Q1.',
        status: 'CONTACTED',
        tags: JSON.stringify(['snow', 'commercial']),
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('leads', leads, { ignoreDuplicates: true });

    const estimates = [
      {
        id: 4001,
        leadId: 3001,
        customerId: 1001,
        jobsiteId: 2001,
        subtotal: 3500.0,
        taxRate: 8.5,
        total: 3797.5,
        status: 'APPROVED',
        signatureDataUrl: null,
        signaturePngUrl: null,
        customerEmail: 'operations@acmelandscaping.example',
        customerPhone: '(555) 123-4567',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 4002,
        leadId: 3002,
        customerId: 1002,
        jobsiteId: 2002,
        subtotal: 1200.0,
        taxRate: 0,
        total: 1200.0,
        status: 'SENT',
        signatureDataUrl: null,
        signaturePngUrl: null,
        customerEmail: 'ops@northwind.example',
        customerPhone: '(555) 987-6543',
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('estimates', estimates, { ignoreDuplicates: true });

    const estimateItems = [
      {
        id: 5001,
        estimateId: 4001,
        description: 'Seasonal plant installation',
        qty: 1,
        unit: 'job',
        unitPrice: 2500.0,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 5002,
        estimateId: 4001,
        description: 'Irrigation tune-up',
        qty: 1,
        unit: 'job',
        unitPrice: 1000.0,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 5003,
        estimateId: 4002,
        description: 'Snow removal per push',
        qty: 12,
        unit: 'visit',
        unitPrice: 100.0,
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('estimate_items', estimateItems, { ignoreDuplicates: true });

    const jobs = [
      {
        id: 6001,
        estimateId: 4001,
        customerId: 1001,
        jobsiteId: 2001,
        name: 'Acme Spring Refresh',
        status: 'IN_PROGRESS',
        startDate: '2025-04-15',
        endDate: '2025-04-20',
        notes: 'Crew to arrive by 7am. Confirm plant delivery day before.',
        tags: JSON.stringify(['priority', 'spring']),
        activityLog: JSON.stringify([
          { at: now.toISOString(), message: 'Job created from estimate 4001.' }
        ]),
        assignedTo: adminId,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 6002,
        estimateId: 4002,
        customerId: 1002,
        jobsiteId: 2002,
        name: 'Northwind Snow Contract',
        status: 'SCHEDULED',
        startDate: '2025-01-05',
        endDate: '2025-03-30',
        notes: 'Monitor weather alerts; priority lot for plowing.',
        tags: JSON.stringify(['winter', 'contract']),
        activityLog: JSON.stringify([
          { at: now.toISOString(), message: 'Pending signature from client.' }
        ]),
        assignedTo: adminId,
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('jobs', jobs, { ignoreDuplicates: true });

    const tasks = [
      {
        id: 7001,
        jobId: 6001,
        title: 'Confirm plant delivery window',
        notes: 'Call supplier on Monday.',
        dueDate: '2025-04-13',
        status: 'DOING',
        assignedTo: adminId,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 7002,
        jobId: 6001,
        title: 'Inspect irrigation heads',
        notes: null,
        dueDate: '2025-04-18',
        status: 'TODO',
        assignedTo: adminId,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 7003,
        jobId: 6002,
        title: 'Prepare de-icing materials',
        notes: 'Stock salt at depot.',
        dueDate: '2024-12-30',
        status: 'TODO',
        assignedTo: adminId,
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('tasks', tasks, { ignoreDuplicates: true });

    const invoices = [
      {
        id: 8001,
        jobId: 6001,
        number: 'INV-1001',
        amount: 3797.5,
        status: 'SENT',
        issuedAt: '2025-04-21',
        dueAt: '2025-05-05',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 8002,
        jobId: 6002,
        number: 'INV-1002',
        amount: 1200.0,
        status: 'DRAFT',
        issuedAt: null,
        dueAt: null,
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('invoices', invoices, { ignoreDuplicates: true });

    const payments = [
      {
        id: 9001,
        invoiceId: 8001,
        amount: 1500.0,
        method: 'CARD',
        receivedAt: '2025-04-25',
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('payments', payments, { ignoreDuplicates: true });

    const changeOrders = [
      {
        id: 10001,
        jobId: 6001,
        title: 'Add mulch for flower beds',
        description: 'Client requested additional mulch coverage.',
        amountDelta: 250.0,
        status: 'APPROVED',
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('change_orders', changeOrders, { ignoreDuplicates: true });

    const calendarEvents = [
      {
        id: 11001,
        title: 'Crew kickoff',
        startAt: new Date('2025-04-15T07:00:00Z'),
        endAt: new Date('2025-04-15T09:00:00Z'),
        jobId: 6001,
        assigneeId: adminId,
        notes: 'Meet at jobsite for briefing.',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 11002,
        title: 'Snow readiness drill',
        startAt: new Date('2024-12-28T13:00:00Z'),
        endAt: new Date('2024-12-28T15:00:00Z'),
        jobId: 6002,
        assigneeId: adminId,
        notes: 'Test plow and salter.',
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('calendar_events', calendarEvents, { ignoreDuplicates: true });

    const attachments = [
      {
        id: 12001,
        entityType: 'JOB',
        entityId: 6001,
        fileUrl: 'https://example-cdn.local/jobs/6001/before-photo.jpg',
        caption: 'Before photo',
        uploadedBy: adminId,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 12002,
        entityType: 'LEAD',
        entityId: 3002,
        fileUrl: 'https://example-cdn.local/leads/3002/site-map.pdf',
        caption: 'Site map PDF',
        uploadedBy: adminId,
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('attachments', attachments, { ignoreDuplicates: true });

    const reminders = [
      {
        id: 13001,
        jobId: 6001,
        userId: adminId,
        channel: 'EMAIL',
        template: 'POST_JOB_FOLLOWUP',
        payload: JSON.stringify({ jobName: 'Acme Spring Refresh' }),
        scheduledFor: new Date('2025-04-22T15:00:00Z'),
        status: 'PENDING',
        lastError: null,
        createdAt: now,
        updatedAt: now
      }
    ];

    await queryInterface.bulkInsert('reminders', reminders, { ignoreDuplicates: true });

    if (dialect === 'postgres') {
      const sequences = [
        ['customers', 'id'],
        ['jobsites', 'id'],
        ['leads', 'id'],
        ['estimates', 'id'],
        ['estimate_items', 'id'],
        ['jobs', 'id'],
        ['tasks', 'id'],
        ['invoices', 'id'],
        ['payments', 'id'],
        ['change_orders', 'id'],
        ['calendar_events', 'id'],
        ['attachments', 'id'],
        ['reminders', 'id']
      ];

      for (const [table, column] of sequences) {
        await queryInterface.sequelize.query(
          `SELECT setval(pg_get_serial_sequence('"${table}"','${column}'), (SELECT MAX("${column}") FROM "${table}"))`
        );
      }
    }
  },

  async down(queryInterface) {
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
      'customers'
    ];

    for (const table of tables) {
      await queryInterface.bulkDelete(table, null, { truncate: true, cascade: true, restartIdentity: true });
    }
  }
};
