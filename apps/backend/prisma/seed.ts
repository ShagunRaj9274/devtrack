/**
 * Demo data for local development. Safe to re-run: it wipes DevTrack tables first.
 * Every demo account uses the password below.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActivityType,
  IssuePriority,
  IssueStatus,
  IssueType,
  NotificationType,
  PrismaClient,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const DEMO_PASSWORD = 'Password123';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number, hour = 10) => {
  const d = new Date(Date.now() - n * DAY);
  d.setHours(hour, (n * 7) % 60, 0, 0);
  return d;
};
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

const USERS = [
  {
    key: 'admin',
    email: 'admin@devtrack.dev',
    username: 'admin',
    name: 'Alex Morgan',
    role: Role.ADMIN,
    avatarColor: '#364FC7',
  },
  {
    key: 'priya',
    email: 'priya@devtrack.dev',
    username: 'priya',
    name: 'Priya Sharma',
    role: Role.PROJECT_MANAGER,
    avatarColor: '#0C8599',
  },
  {
    key: 'marco',
    email: 'marco@devtrack.dev',
    username: 'marco',
    name: 'Marco Rossi',
    role: Role.DEVELOPER,
    avatarColor: '#E8590C',
  },
  {
    key: 'sara',
    email: 'sara@devtrack.dev',
    username: 'sara',
    name: 'Sara Kim',
    role: Role.DEVELOPER,
    avatarColor: '#9C36B5',
  },
  {
    key: 'dev',
    email: 'dev@devtrack.dev',
    username: 'dev',
    name: 'Daniel Okafor',
    role: Role.DEVELOPER,
    avatarColor: '#2B8A3E',
  },
  {
    key: 'viewer',
    email: 'viewer@devtrack.dev',
    username: 'viewer',
    name: 'Vera Lindqvist',
    role: Role.VIEWER,
    avatarColor: '#868E96',
  },
] as const;
type UserKey = (typeof USERS)[number]['key'];

interface SeedIssue {
  title: string;
  description: string;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  assignee: UserKey | null;
  reporter: UserKey;
  labels: string[];
  createdDaysAgo: number;
  dueInDays?: number;
  comments?: { author: UserKey; body: string; daysAgo: number }[];
}

const WEB_ISSUES: SeedIssue[] = [
  {
    title: 'Login form accepts empty password on Safari',
    description:
      'On Safari 17 the client-side validation is skipped when autofill is used. The API rejects it, but the user sees a generic error instead of the field message.\n\nSteps:\n1. Open /login in Safari\n2. Autofill email only\n3. Press Enter',
    type: IssueType.BUG,
    status: IssueStatus.IN_PROGRESS,
    priority: IssuePriority.HIGH,
    assignee: 'marco',
    reporter: 'sara',
    labels: ['frontend', 'auth'],
    createdDaysAgo: 6,
    dueInDays: 2,
    comments: [
      {
        author: 'marco',
        body: 'Reproduced. Safari fires `change` after `submit` with autofill, so our validation runs too late.',
        daysAgo: 5,
      },
      {
        author: 'priya',
        body: '@marco can we get this into the Friday release? Support has three tickets about it.',
        daysAgo: 4,
      },
      { author: 'marco', body: 'Yes, fix is small. PR up by tomorrow.', daysAgo: 4 },
    ],
  },
  {
    title: 'Dark mode for the dashboard',
    description:
      'Respect the OS color scheme and add a manual toggle in settings. Charts need a dark palette too.',
    type: IssueType.FEATURE,
    status: IssueStatus.TODO,
    priority: IssuePriority.MEDIUM,
    assignee: 'sara',
    reporter: 'priya',
    labels: ['frontend', 'ux'],
    createdDaysAgo: 12,
    dueInDays: 14,
  },
  {
    title: 'Checkout page crashes when cart has 50+ items',
    description:
      'Stack trace points to the price-summary component re-rendering on every item. Customers with large B2B orders are blocked.',
    type: IssueType.BUG,
    status: IssueStatus.IN_REVIEW,
    priority: IssuePriority.CRITICAL,
    assignee: 'dev',
    reporter: 'priya',
    labels: ['frontend', 'performance'],
    createdDaysAgo: 3,
    dueInDays: 1,
    comments: [
      {
        author: 'dev',
        body: 'Memoized the summary and virtualized the list. 200 items now render in ~40ms. Ready for review.',
        daysAgo: 1,
      },
    ],
  },
  {
    title: 'Migrate image uploads to signed S3 URLs',
    description:
      'Uploads currently stream through the API server. Switch to pre-signed PUT URLs to reduce load.',
    type: IssueType.IMPROVEMENT,
    status: IssueStatus.TODO,
    priority: IssuePriority.HIGH,
    assignee: 'marco',
    reporter: 'admin',
    labels: ['backend', 'performance'],
    createdDaysAgo: 9,
    dueInDays: -2,
  },
  {
    title: 'Add rate limiting to the public search endpoint',
    description: 'We saw scraping traffic last week. Limit to 60 req/min per IP.',
    type: IssueType.TASK,
    status: IssueStatus.DONE,
    priority: IssuePriority.HIGH,
    assignee: 'dev',
    reporter: 'priya',
    labels: ['backend', 'security'],
    createdDaysAgo: 13,
  },
  {
    title: 'Password reset emails land in spam',
    description: 'SPF record is missing the new mail provider include. DKIM looks fine.',
    type: IssueType.BUG,
    status: IssueStatus.DONE,
    priority: IssuePriority.MEDIUM,
    assignee: 'marco',
    reporter: 'sara',
    labels: ['auth'],
    createdDaysAgo: 11,
  },
  {
    title: 'Keyboard shortcuts for the issue board',
    description:
      'j/k to move between cards, Enter to open, c to create. Show a cheat sheet on "?".',
    type: IssueType.FEATURE,
    status: IssueStatus.TODO,
    priority: IssuePriority.LOW,
    assignee: null,
    reporter: 'sara',
    labels: ['frontend', 'ux'],
    createdDaysAgo: 8,
  },
  {
    title: 'Write onboarding checklist for new customers',
    description:
      'Short checklist shown after signup: create project, invite team, create first issue.',
    type: IssueType.TASK,
    status: IssueStatus.IN_PROGRESS,
    priority: IssuePriority.MEDIUM,
    assignee: 'sara',
    reporter: 'priya',
    labels: ['ux'],
    createdDaysAgo: 5,
    dueInDays: 5,
  },
  {
    title: 'Product list API returns duplicates across pages',
    description: 'Ordering by `updatedAt` alone is not stable. Add the id as a tie-breaker.',
    type: IssueType.BUG,
    status: IssueStatus.DONE,
    priority: IssuePriority.HIGH,
    assignee: 'dev',
    reporter: 'marco',
    labels: ['backend'],
    createdDaysAgo: 10,
  },
  {
    title: 'Lazy-load below-the-fold images on the landing page',
    description: 'LCP is 3.1s on mobile. Lazy loading plus AVIF should get us under 2.5s.',
    type: IssueType.IMPROVEMENT,
    status: IssueStatus.IN_REVIEW,
    priority: IssuePriority.MEDIUM,
    assignee: 'sara',
    reporter: 'admin',
    labels: ['frontend', 'performance'],
    createdDaysAgo: 4,
  },
  {
    title: 'Session expires while filling long forms',
    description:
      'Users lose their draft when the access token expires. Refresh silently before submitting.',
    type: IssueType.BUG,
    status: IssueStatus.TODO,
    priority: IssuePriority.HIGH,
    assignee: null,
    reporter: 'sara',
    labels: ['auth', 'frontend'],
    createdDaysAgo: 2,
  },
  {
    title: 'Audit npm dependencies for known vulnerabilities',
    description: 'Run npm audit, upgrade what we can, document accepted risks for the rest.',
    type: IssueType.TASK,
    status: IssueStatus.DONE,
    priority: IssuePriority.MEDIUM,
    assignee: 'marco',
    reporter: 'priya',
    labels: ['security'],
    createdDaysAgo: 7,
  },
];

const MOBILE_ISSUES: SeedIssue[] = [
  {
    title: 'Push notifications not delivered on Android 14',
    description:
      'Notification permission is never requested on Android 13+. Need POST_NOTIFICATIONS runtime prompt.',
    type: IssueType.BUG,
    status: IssueStatus.IN_PROGRESS,
    priority: IssuePriority.CRITICAL,
    assignee: 'dev',
    reporter: 'priya',
    labels: ['android'],
    createdDaysAgo: 4,
    dueInDays: 1,
    comments: [
      {
        author: 'priya',
        body: 'This affects roughly 40% of our Android users. Top priority this sprint.',
        daysAgo: 3,
      },
      {
        author: 'dev',
        body: 'Permission flow added; testing on Pixel 8 and Galaxy S23 now.',
        daysAgo: 1,
      },
    ],
  },
  {
    title: 'Offline mode for viewing orders',
    description: 'Cache the last 50 orders so the list works without network.',
    type: IssueType.FEATURE,
    status: IssueStatus.TODO,
    priority: IssuePriority.MEDIUM,
    assignee: 'sara',
    reporter: 'priya',
    labels: ['ios', 'android'],
    createdDaysAgo: 10,
    dueInDays: 21,
  },
  {
    title: 'Reduce app bundle size below 30 MB',
    description: 'Current iOS build is 41 MB. Candidates: unused fonts, duplicated lottie files.',
    type: IssueType.IMPROVEMENT,
    status: IssueStatus.TODO,
    priority: IssuePriority.LOW,
    assignee: null,
    reporter: 'dev',
    labels: ['ios'],
    createdDaysAgo: 9,
  },
  {
    title: 'Biometric login on iOS',
    description: 'Face ID / Touch ID unlock using the keychain-stored refresh token.',
    type: IssueType.FEATURE,
    status: IssueStatus.IN_REVIEW,
    priority: IssuePriority.HIGH,
    assignee: 'sara',
    reporter: 'priya',
    labels: ['ios'],
    createdDaysAgo: 12,
    dueInDays: 3,
  },
  {
    title: 'Set up crash reporting',
    description: 'Wire up crash reporting with source maps for both platforms.',
    type: IssueType.TASK,
    status: IssueStatus.DONE,
    priority: IssuePriority.HIGH,
    assignee: 'dev',
    reporter: 'admin',
    labels: ['ios', 'android'],
    createdDaysAgo: 13,
  },
  {
    title: 'Tapping a notification opens the wrong screen',
    description: 'Deep link payload uses the old route names.',
    type: IssueType.BUG,
    status: IssueStatus.DONE,
    priority: IssuePriority.MEDIUM,
    assignee: 'sara',
    reporter: 'dev',
    labels: ['android'],
    createdDaysAgo: 8,
  },
];

async function reset() {
  await prisma.notification.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.issueLabel.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.label.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

async function seedProject(
  users: Record<UserKey, { id: string; name: string; role: Role }>,
  project: { name: string; key: string; description: string; owner: UserKey; members: UserKey[] },
  labels: { name: string; color: string }[],
  issues: SeedIssue[],
) {
  const created = await prisma.project.create({
    data: {
      name: project.name,
      key: project.key,
      description: project.description,
      ownerId: users[project.owner].id,
      issueCounter: issues.length,
      createdAt: daysAgo(15),
      members: {
        create: project.members.map((m, i) => ({ userId: users[m].id, joinedAt: daysAgo(15 - i) })),
      },
      labels: { create: labels },
    },
    include: { labels: true },
  });
  const labelId = (name: string) => created.labels.find((l) => l.name === name)!.id;

  for (const [index, seed] of issues.entries()) {
    // Demo data must respect the same rules as the API: viewers never act on issues.
    const actors = [seed.reporter, seed.assignee, ...(seed.comments ?? []).map((c) => c.author)];
    for (const key of actors) {
      if (key && users[key].role === Role.VIEWER) {
        throw new Error(
          `Seed issue "${seed.title}" uses viewer "${key}" as reporter/assignee/commenter`,
        );
      }
    }
    const createdAt = daysAgo(seed.createdDaysAgo);
    const issue = await prisma.issue.create({
      data: {
        projectId: created.id,
        number: index + 1,
        title: seed.title,
        description: seed.description,
        type: seed.type,
        status: seed.status,
        priority: seed.priority,
        assigneeId: seed.assignee ? users[seed.assignee].id : null,
        reporterId: users[seed.reporter].id,
        dueDate: seed.dueInDays !== undefined ? daysAhead(seed.dueInDays) : null,
        createdAt,
        labels: { create: seed.labels.map((l) => ({ labelId: labelId(l) })) },
      },
    });

    // A plausible history so the timeline and "completed" trend chart have data.
    const history: { type: ActivityType; actor: UserKey; at: Date; meta?: object }[] = [
      { type: ActivityType.ISSUE_CREATED, actor: seed.reporter, at: createdAt },
    ];
    if (seed.assignee) {
      history.push({
        type: ActivityType.ASSIGNEE_CHANGED,
        actor: project.owner,
        at: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
        meta: { from: null, to: { id: users[seed.assignee].id, name: users[seed.assignee].name } },
      });
    }
    const path: IssueStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
    const steps = path.indexOf(seed.status);
    for (let s = 1; s <= steps; s++) {
      const at = new Date(createdAt.getTime() + (s * seed.createdDaysAgo * DAY) / (steps + 1));
      history.push({
        type: ActivityType.STATUS_CHANGED,
        actor: seed.assignee ?? seed.reporter,
        at,
        meta: { from: path[s - 1], to: path[s] },
      });
    }
    for (const c of seed.comments ?? []) {
      const comment = await prisma.comment.create({
        data: {
          issueId: issue.id,
          authorId: users[c.author].id,
          body: c.body,
          createdAt: daysAgo(c.daysAgo, 15),
        },
      });
      history.push({
        type: ActivityType.COMMENT_ADDED,
        actor: c.author,
        at: comment.createdAt,
        meta: { commentId: comment.id },
      });
    }
    await prisma.activity.createMany({
      data: history.map((h) => ({
        issueId: issue.id,
        projectId: created.id,
        actorId: users[h.actor].id,
        type: h.type,
        meta: h.meta,
        createdAt: h.at,
      })),
    });
  }
  return created;
}

async function main() {
  // Containers seed on every start with SEED_ONLY_IF_EMPTY=true: never wipe real data.
  if (process.env.SEED_ONLY_IF_EMPTY === 'true' && (await prisma.user.count()) > 0) {
    console.log('Database already has users; skipping demo seed.');
    return;
  }
  console.log('Seeding DevTrack demo data...');
  await reset();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = {} as Record<UserKey, { id: string; name: string; role: Role }>;
  for (const u of USERS) {
    const { key, ...data } = u;
    users[key] = await prisma.user.create({
      data: { ...data, passwordHash, createdAt: daysAgo(20) },
      select: { id: true, name: true, role: true },
    });
  }

  const web = await seedProject(
    users,
    {
      name: 'Web Storefront',
      key: 'WEB',
      description: 'Customer-facing web shop: catalog, cart, checkout and accounts.',
      owner: 'priya',
      members: ['priya', 'marco', 'sara', 'dev', 'viewer'],
    },
    [
      { name: 'frontend', color: '#1C7ED6' },
      { name: 'backend', color: '#2F9E44' },
      { name: 'auth', color: '#E8590C' },
      { name: 'performance', color: '#F08C00' },
      { name: 'security', color: '#C92A2A' },
      { name: 'ux', color: '#AE3EC9' },
    ],
    WEB_ISSUES,
  );

  const mobile = await seedProject(
    users,
    {
      name: 'Mobile App',
      key: 'MOB',
      description: 'iOS and Android companion app for order tracking and notifications.',
      owner: 'priya',
      members: ['priya', 'sara', 'dev'],
    },
    [
      { name: 'ios', color: '#495057' },
      { name: 'android', color: '#37B24D' },
    ],
    MOBILE_ISSUES,
  );

  // A small internal project owned by the admin, to show project-level visibility.
  await prisma.project.create({
    data: {
      name: 'Internal Tools',
      key: 'OPS',
      description: 'Deployment scripts, CI and on-call tooling.',
      status: 'ON_HOLD',
      ownerId: users.admin.id,
      members: { create: [{ userId: users.admin.id }, { userId: users.marco.id }] },
    },
  });

  const issueByTitle = async (title: string) =>
    prisma.issue.findFirstOrThrow({ where: { title }, include: { project: true } });
  const loginBug = await issueByTitle(WEB_ISSUES[0].title);
  const checkout = await issueByTitle(WEB_ISSUES[2].title);
  const push = await issueByTitle(MOBILE_ISSUES[0].title);

  await prisma.notification.createMany({
    data: [
      {
        recipientId: users.marco.id,
        actorId: users.priya.id,
        type: NotificationType.MENTIONED,
        title: 'Priya Sharma mentioned you on WEB-1',
        body: WEB_ISSUES[0].comments![1].body,
        issueId: loginBug.id,
        projectId: web.id,
        createdAt: daysAgo(4, 16),
      },
      {
        recipientId: users.dev.id,
        actorId: users.priya.id,
        type: NotificationType.ISSUE_ASSIGNED,
        title: 'Priya Sharma assigned you WEB-3',
        body: checkout.title,
        issueId: checkout.id,
        projectId: web.id,
        createdAt: daysAgo(3, 11),
      },
      {
        recipientId: users.dev.id,
        actorId: users.priya.id,
        type: NotificationType.COMMENT_ADDED,
        title: 'Priya Sharma commented on MOB-1',
        body: MOBILE_ISSUES[0].comments![0].body,
        issueId: push.id,
        projectId: mobile.id,
        createdAt: daysAgo(3, 15),
      },
      {
        recipientId: users.dev.id,
        actorId: users.priya.id,
        type: NotificationType.PROJECT_ADDED,
        title: 'Priya Sharma added you to Mobile App',
        body: 'You now have access to the MOB project.',
        projectId: mobile.id,
        createdAt: daysAgo(14, 9),
        readAt: daysAgo(14, 10),
      },
      {
        recipientId: users.sara.id,
        actorId: users.marco.id,
        type: NotificationType.COMMENT_ADDED,
        title: 'Marco Rossi commented on WEB-1',
        body: WEB_ISSUES[0].comments![0].body,
        issueId: loginBug.id,
        projectId: web.id,
        createdAt: daysAgo(5, 15),
      },
      {
        recipientId: users.priya.id,
        actorId: users.dev.id,
        type: NotificationType.COMMENT_ADDED,
        title: 'Daniel Okafor commented on WEB-3',
        body: WEB_ISSUES[2].comments![0].body,
        issueId: checkout.id,
        projectId: web.id,
        createdAt: daysAgo(1, 15),
      },
    ],
  });

  console.log(
    `Done. ${USERS.length} users, 3 projects, ${WEB_ISSUES.length + MOBILE_ISSUES.length} issues.`,
  );
  console.log(`Log in with any of: ${USERS.map((u) => u.email).join(', ')} / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
