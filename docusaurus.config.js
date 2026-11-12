const { themes: prismThemes } = require("prism-react-renderer");

const config = {
  title: "Breeze Plugin Docs",
  tagline: "Plugin development handbook for third-party Breeze authors",
  url: "https://breeze-project-org.github.io",
  baseUrl: "/plugin-dev-docs/",
  organizationName: "breeze-project-org",
  projectName: "plugin-dev-docs",

  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw"
    }
  },

  i18n: {
    defaultLocale: "zh-CN",
    locales: ["zh-CN", "en"],
    localeConfigs: {
      "zh-CN": {
        label: "中文",
        htmlLang: "zh-CN"
      },
      en: {
        label: "English",
        htmlLang: "en-US"
      }
    }
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.js",
          showLastUpdateTime: true
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      }
    ]
  ],

  themeConfig: {
    navbar: {
      title: "Breeze Plugin Docs",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          label: "文档",
          position: "left"
        },
        {
          type: "localeDropdown",
          position: "right"
        },
        {
          href: "https://github.com/breeze-project-org/Breeze",
          label: "GitHub",
          position: "right"
        }
      ]
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "文档",
          items: [
            {
              label: "插件 API 契约",
              to: "/guide/plugin-api-contract"
            },
            {
              label: "调试与发布",
              to: "/guide/debug-and-release"
            }
          ]
        }
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Breeze contributors.`
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula
    }
  }
};

module.exports = config;
