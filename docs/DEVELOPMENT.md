# 开发说明

面向维护者，普通用户不需要读。

## 技术栈

- Host 与 Client 都是 ESM JavaScript；分析内核（`analyzer.js`）、出题内核（`drill.js`）、检索（`knowledge.js`）均为纯 JavaScript，无 Python 依赖；
- 面板由 `client.js` 注册到 DSH 的侧边栏与主页面槽位。

## 内容构建

- 知识点源文件：`content-src/`（维护者本地保留，不随仓库/包发布）；
- 明文合并后由 `scripts/encrypt-content.mjs` 生成 `core/data/knowledge.enc` 与 `papers.enc`；
- 加密仅为轻度保护，不能抵御逆向，发布时不要把它当作安全边界。

## 打包与发布

```bash
npm pack                       # 生成 tarball，用于本地试装
npm publish --access public    # 发布到 npm
```

- 发布前确认 `package.json` 版本号、`core/data` 内无明文知识库；
- 插件管理器对刚发布的版本有供应链发布龄期保护，必要时用 `bnu434@版本号` 指定安装。

## 客户端注意事项

- 面板可能因切换主视图而卸载，跨视图状态需要放在模块级 store 或 localStorage；
- 内容区需要独立滚动容器，否则长答案无法翻页；
- 在线 AI 生成走后台任务 + 轮询，避免阻塞其他标签。
