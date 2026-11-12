const docs = [
  {
    type: "category",
    label: "开始",
    collapsed: false,
    items: [
      "home",
      "guide/quick-start",
      {
        type: "category",
        label: "运行时 API",
        collapsed: false,
        items: [
          "guide/runtime-api/runtime-api",
          "guide/runtime-api/core",
          "guide/runtime-api/crypto",
          "guide/runtime-api/time-and-intl",
          "guide/runtime-api/built-ins",
          "guide/runtime-api/html-and-patterns",
          "guide/runtime-api/network-fronting"
        ]
      },
      "guide/plugin-kit",
      "guide/runtime-and-structure"
    ]
  },
  {
    type: "category",
    label: "接口协议",
    collapsed: false,
    items: [
      "guide/plugin-api-contract",
      "guide/favorite-workflow"
    ]
  },
  {
    type: "category",
    label: "调试与交付",
    collapsed: false,
    items: ["guide/debug-and-release", "guide/checklist"]
  }
];

module.exports = { docs };
