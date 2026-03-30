export const airtableSchema = {
  operations: {
    tables: {
      clients: "Clients",
      clientProfiles: "Client Profiles",
      clientLessonSummaries: "Client Lesson Summaries",
      lessons: "Lessons",
      clientExternals: "Client Externals",
      providerAccounts: "Provider Accounts",
      cardExternals: "Card Externals",
      orders: "Orders",
      orderItems: "Order Items",
      orderExternals: "Order Externals",
      invoices: "Invoices",
      invoiceExternals: "Invoice Externals",
      organizationIntegrations: "Organization Integrations",
      webhookEvents: "Webhook Events",
      webhookDeliveries: "Webhook Deliveries",
    },
    fields: {
      clientProfiles: {
        clientLink: "Client",
        lessonSummaryLink: "Client Lesson Summary",
      },
      clientLessonSummaries: {
        profileLink: "Client Profile",
        lastLessonAt: "Last Lesson At",
        nextLessonAt: "Next Lesson At",
        completedLessonCount: "Completed Lesson Count",
        canceledLessonCount: "Canceled Lesson Count",
        noShowLessonCount: "No Show Lesson Count",
        scheduledFutureLessonCount: "Scheduled Future Lesson Count",
        lastLessonStatus: "Last Lesson Status",
        lastRefreshedAt: "Last Refreshed At",
        needsRefresh: "Sync Requested",
        syncStatus: "Sync Status",
        syncError: "Sync Error",
      },
      lessons: {
        profileLink: "Client Profile",
        status: "Status",
        startAt: "Start At",
      },
    },
  },
  core: {
    tables: {
      leadIntakes: "Lead Intakes",
      leadAttributions: "Lead Attributions",
      campaigns: "Campaigns",
    },
  },
} as const;
