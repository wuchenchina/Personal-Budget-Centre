# AGENTS.md instructions for /Users/wuchen/Desktop/Wuchen/09_Projects/BudgetCentre

1. Always respond in Chinese-traditional.
2. The Ant Design's Dev Doc is the mcp "antd".
3. When you code about the Ant Design, you must read the antd doc first.
4. When you use the node, please use yarn first.
5. If the yarn need to enter or choose with human, you can use the npm instead.
6. Do not start the frontend dev server unless the user explicitly asks for it.

## 🎨 Taste-Skill Global Defaults
# 针对 bc.tool (AntD Admin) 的全局审美基线
- **DESIGN_VARIANCE: 5** (默认稍稳重，但允许一点变化)
- **MOTION_INTENSITY: 2** (后台系统尽量少动效，保性能)
- **VISUAL_DENSITY: 7** (后台默认高密度，一屏多看数据)

## 🚫 Universal Bans (必须遵守)
- **NO EM-DASHES (`—`)**: 任何情况下禁止输出该字符，改用逗号或句号。
- **NO AI PURPLE**: 禁止默认蓝紫色渐变。
- **NO INTER FONT**: 使用系统原生字体栈。
- **AntD Constraints**: 修改样式必须使用 CSS Modules 或 styled-components，严禁全局污染 `.ant-*` 类名。

## 📱 Accessibility
- 所有文本必须符合 WCAG AA 对比度标准。
- 移动端禁止使用 `h-screen`，必须使用 `min-h-[100dvh]`。