// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs-ats.allfeat.org",
  integrations: [
    starlight({
      title: "ATS Widget",
      description:
        "Technical documentation for the Allfeat ATS Widget — integrate blockchain-based audio timestamping into your platform.",
      logo: {
        src: "./src/assets/logo-dark.png",
        replacesTitle: false,
      },
      favicon: "/favicon.svg",
      head: [
        {
          tag: "script",
          content: `if (!localStorage.getItem('starlight-theme')) { document.documentElement.dataset.theme = 'light'; }`,
        },
        {
          tag: "meta",
          attrs: { property: "og:image", content: "https://cdn.allfeat.org/assets/Logo%20Dark-512.png" },
        },
        {
          tag: "meta",
          attrs: { property: "og:site_name", content: "Allfeat ATS Widget Documentation" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary" },
        },
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#00b18c" },
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/Allfeat/ats-component",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/Allfeat/ats-component/edit/develop/docs/",
      },
      lastUpdated: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Quick Start", slug: "guides/quick-start" },
            { label: "Authentication", slug: "guides/authentication" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Events & Callbacks", slug: "guides/events" },
            { label: "Styling & Theming", slug: "guides/styling" },
            { label: "Update Mode", slug: "guides/update-mode" },
            { label: "Pricing & Credits", slug: "guides/pricing" },
            { label: "Error Handling", slug: "guides/error-handling" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Attributes & Methods", slug: "reference/attributes" },
            { label: "Events", slug: "reference/events" },
            { label: "CSS Variables", slug: "reference/css-variables" },
            { label: "Error Codes", slug: "reference/error-codes" },
          ],
        },
      ],
    }),
  ],
});
