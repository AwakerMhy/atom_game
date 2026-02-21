# 发布到 GitHub Pages

## 1. 在 GitHub 启用 Pages

1. 打开仓库 **Settings** → **Pages**
2. 在 **Build and deployment** 里：
   - **Source** 选 **GitHub Actions**

保存后无需再选分支，部署由 workflow 完成。

## 2. 触发部署

- **自动**：推送到 `main` 或 `master` 分支后会自动构建并部署
- **手动**：在仓库 **Actions** 里选择 **Deploy to GitHub Pages**，点击 **Run workflow**

## 3. 访问网页

部署完成后，页面地址为：

```
https://<你的用户名>.github.io/<仓库名>/
```

例如仓库为 `myuser/atom_game`，则地址为：**https://myuser.github.io/atom_game/**

首次部署或更新后可能需要等 1–2 分钟才能打开。
