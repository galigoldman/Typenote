import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Typenote',
  description:
    'How Typenote and the Typenote Moodle Sync browser extension collect, use, and protect your data.',
};

const LAST_UPDATED = '2026-05-21';
const CONTACT_EMAIL = 'galigold2002@gmail.com';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Last updated: {LAST_UPDATED}
      </p>

      <Section title="1. Overview">
        <p>
          Typenote is a note-taking and study tool for students. This policy
          covers both the web app at this domain and the{' '}
          <em>Typenote Moodle Sync</em> Chrome extension. We collect the minimum
          data needed to make the product work, and we never sell it.
        </p>
      </Section>

      <Section title="2. What the web app collects">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Account information.</strong> Email address and an
            authentication identifier from Supabase Auth (or Google, if you sign
            in with Google).
          </li>
          <li>
            <strong>Content you create.</strong> Notes, documents, drawings,
            folders, courses, and files you upload. This is the substance of the
            product and is stored in our database and file storage.
          </li>
          <li>
            <strong>AI conversation history.</strong> Messages you send to the
            in-app AI tutor, and the AI&apos;s responses. Stored so you can
            return to a conversation later.
          </li>
          <li>
            <strong>Product analytics.</strong> Anonymous session recordings and
            event data (e.g. &ldquo;document created&rdquo;, &ldquo;PDF
            exported&rdquo;) via PostHog. We do not record note contents, email
            addresses, or other personal data in analytics events.
          </li>
        </ul>
      </Section>

      <Section title="3. What the Chrome extension collects">
        <p>
          The <em>Typenote Moodle Sync</em> extension only runs when you
          explicitly click its icon on a Moodle course page. When you do, it:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>
            Reads the structure of the current Moodle course page (section
            titles, file links, document links).
          </li>
          <li>
            Uses the Moodle session cookie of <em>that same Moodle origin</em>{' '}
            to download the linked files. The cookie is never sent anywhere
            except back to Moodle.
          </li>
          <li>
            Sends the downloaded files and the course structure to your Typenote
            account so they appear in your dashboard.
          </li>
          <li>
            Stores a Typenote session token in <code>chrome.storage</code> so
            you don&apos;t have to re-authenticate on every sync.
          </li>
        </ul>
        <p className="mt-3">
          The extension does <strong>not</strong> read or store your Moodle
          username or password, does <strong>not</strong> run in the background,
          and does <strong>not</strong> interact with any site other than Moodle
          and Typenote.
        </p>
      </Section>

      <Section title="4. Where your data is stored">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Supabase</strong> — primary database (PostgreSQL),
            authentication, and file storage. Hosted in the United States.
          </li>
          <li>
            <strong>Vercel</strong> — hosts the Typenote web app.
          </li>
          <li>
            <strong>Google Gemini API</strong> — answers AI chat messages and
            generates math notation. Messages you send to the AI tutor are
            transmitted to Google for processing. Google does not use this data
            to train its models when accessed via the API.
          </li>
          <li>
            <strong>PostHog</strong> — product analytics, session replay, and
            error tracking. Hosted in the United States.
          </li>
        </ul>
      </Section>

      <Section title="5. What we do NOT do">
        <ul className="list-disc space-y-2 pl-6">
          <li>We do not sell your personal information.</li>
          <li>
            We do not use your note content, AI conversations, or imported
            course materials for advertising or to train any AI model of our
            own.
          </li>
          <li>
            We do not share your data with third parties outside the service
            providers listed above.
          </li>
        </ul>
      </Section>

      <Section title="6. Your rights">
        <p>
          You can export or delete your data at any time by emailing us at{' '}
          <a
            className="text-primary underline"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          . If you delete your Typenote account, all associated notes, files,
          and AI conversation history are permanently removed within 30 days.
        </p>
        <p className="mt-3">
          To stop the extension from accessing a Moodle site, revoke its host
          permission from <code>chrome://extensions</code> → Typenote Moodle
          Sync → Details → Site access.
        </p>
      </Section>

      <Section title="7. Children's privacy">
        <p>
          Typenote is intended for users aged 13 and older. We do not knowingly
          collect data from children under 13. If you believe a child has
          provided us with personal information, contact us and we will delete
          it.
        </p>
      </Section>

      <Section title="8. Changes to this policy">
        <p>
          If we materially change how data is collected or used, we will update
          the &ldquo;Last updated&rdquo; date at the top of this page and, where
          required, notify you in the app.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>
          Questions about this policy?{' '}
          <a
            className="text-primary underline"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="text-foreground/90 mt-3 space-y-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}
