import type { Metadata } from "next";
import { About } from "@/components/about";
import { SiteFooter, SiteHeader } from "@/components/site";
import { siteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "About the maker",
  description:
    "Todu is built by Nikhilvarma Kandula, a founder and AI engineer in Germany. What he has built, how he works, and what this repository proves.",
  alternates: { canonical: "/about" },
};

// Structured data so search and answer engines tie Todu to its maker.
const PERSON = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Nikhilvarma Kandula",
  alternateName: "Nikhil Varma Kandula",
  jobTitle: "Founder & AI engineer",
  url: "https://kandula.studio",
  email: "mailto:kandulanikhilvarma@gmail.com",
  address: { "@type": "PostalAddress", addressCountry: "DE" },
  alumniOf: {
    "@type": "CollegeOrUniversity",
    name: "Malla Reddy College of Engineering",
  },
  knowsLanguage: ["en", "te", "hi", "de"],
  sameAs: [
    "https://github.com/kandulanikhilvarma",
    "https://www.linkedin.com/in/nikhilvarmakandula",
    "https://orcid.org/0009-0000-1331-5771",
    "https://kandula.studio",
  ],
  owns: {
    "@type": "SoftwareApplication",
    name: "Todu",
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Android",
    url: siteUrl,
  },
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PERSON) }}
      />
      <SiteHeader />
      <div id="main">
        <About />
      </div>
      <SiteFooter />
    </>
  );
}
