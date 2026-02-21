import PageContainer from '../../components/PageContainer'

export default function PrivacyPage() {
  return (
    <PageContainer className="bg-white text-slate-800">
      <section className="mx-auto max-w-4xl px-4 py-16 md:py-20">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-slate-600 mb-12">Last updated: January 2, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">Introduction</h2>
            <p className="text-slate-700 mb-4">
              Sguild Swim Instruction (&quot;we,&quot; &quot;us,&quot; &quot;our,&quot; or &quot;Company&quot;) operates the sguildswim.com website. This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Information Collection and Use</h2>
            <p className="text-slate-700 mb-4">We collect several different types of information for various purposes to provide and improve our Service to you.</p>
            
            <h3 className="text-xl font-semibold mt-6 mb-3">Types of Data Collected:</h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li><strong>Contact Information:</strong> Name, email address, phone number, physical address</li>
              <li><strong>Student Information:</strong> Age, swimming experience, goals, and medical information relevant to instruction</li>
              <li><strong>Payment Information:</strong> Payment method and transaction history (processed securely by third-party providers)</li>
              <li><strong>Usage Data:</strong> Browser type, IP address, pages visited, time and date of visit, and other diagnostic data</li>
              <li><strong>Communication Data:</strong> Records of correspondence with us via email, phone, or messaging</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Use of Data</h2>
            <p className="text-slate-700 mb-4">Sguild Swim Instruction uses the collected data for various purposes:</p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li>To provide and maintain our Service</li>
              <li>To notify you about changes to our Service</li>
              <li>To allow you to participate in interactive features of our Service when you choose to do so</li>
              <li>To provide customer support and respond to your inquiries</li>
              <li>To gather analysis and valuable information so that we can improve our Service</li>
              <li>To monitor the usage of our Service</li>
              <li>To detect, prevent, and address technical and security issues</li>
              <li>To schedule and manage swim lesson appointments</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Security of Data</h2>
            <p className="text-slate-700 mb-4">
              The security of your data is important to us but remember that no method of transmission over the Internet or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Changes to This Privacy Policy</h2>
            <p className="text-slate-700 mb-4">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date at the top of this Privacy Policy.
            </p>
            <p className="text-slate-700 mb-4">
              You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
            <p className="text-slate-700 mb-4">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-slate-700">
              <p><strong>Sguild Swim Instruction</strong></p>
              <p className="mt-2">Email: <a href="mailto:info@sguild.com" className="text-sky-600 hover:underline">info@sguild.com</a></p>
              <p>Website: <a href="https://www.sguildswim.com" className="text-sky-600 hover:underline">www.sguildswim.com</a></p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Additional Provisions</h2>
            
            <h3 className="text-lg font-semibold mt-6 mb-3">Cookies</h3>
            <p className="text-slate-700 mb-4">
              We may use cookies and similar tracking technologies to track activity on our Service and store certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">Third-Party Links</h3>
            <p className="text-slate-700 mb-4">
              Our Service may contain links to other sites that are not operated by us. This Privacy Policy does not apply to third-party websites, and we are not responsible for their privacy practices. We encourage you to review the privacy policy of any third-party site before providing your information.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">Children&apos;s Privacy</h3>
            <p className="text-slate-700 mb-4">
              Our Service does not address anyone under the age of 18. We do not knowingly collect personally identifiable information from children under 18. If we become aware that a child under 18 has provided us with Personal Data, we immediately delete such information from our servers.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">Your Rights</h3>
            <p className="text-slate-700 mb-4">
              Depending on your location, you may have certain rights regarding your Personal Data, including the right to access, update, or delete your information. To exercise these rights, please contact us using the information provided in the Contact Us section above.
            </p>
          </section>
        </div>
      </section>
    </PageContainer>
  )
}
