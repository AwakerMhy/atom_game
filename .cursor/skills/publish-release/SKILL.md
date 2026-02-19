---
name: publish-release
description: Publishes a new version of Atom Game. Use when the user asks to publish a version, release, tag, or 发布版本. Updates version in config, optionally changelog, creates git tag, and can build a distributable.
---

# 发布版本 (Publish Release)

按以下步骤发布 Atom Game 新版本。

## 1. 确定版本号

- 语义化版本：`主版本.次版本.修订号`（如 `0.1.0`、`1.0.0`）。
- 当前版本定义在 **`src/config.py`** 的 `VERSION`。

## 2. 发布前检查

- [ ] 运行游戏确认无报错：`python main.py`
- [ ] 确认要发布的改动已提交（或先提交）

## 3. 更新版本并打标签

1. **修改版本号**  
   在 `src/config.py` 中把 `VERSION = "x.y.z"` 改为新版本号。

2. **（可选）更新 CHANGELOG**  
   若项目根目录有 `CHANGELOG.md`，在顶部添加新版本与本次变更说明。

3. **提交并打 tag**（项目为 Git 时）：
   ```bash
   git add src/config.py
   git commit -m "chore: release vX.Y.Z"
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   ```
   将 `X.Y.Z` 替换为实际版本号（与 `VERSION` 一致，tag 前可加 `v`）。

4. **推送**（若使用远程仓库）：
   ```bash
   git push && git push --tags
   ```

## 4. 可选：打包可执行文件

需要分发给无 Python 环境用户时，可用 PyInstaller 打包：

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "AtomGame" main.py
```

产出在 `dist/AtomGame.exe`（Windows）或对应平台可执行文件。依赖、资源路径若异常，需在 spec 或命令行中补充 `--add-data` 等。

## 版本号位置

- **唯一来源**：`src/config.py` 中的 `VERSION`。
- 若需要在窗口标题显示版本，在 `main.py` 设置窗口标题时使用：`pygame.display.set_caption(f"{TITLE} v{VERSION}")`，并从 `src.config` 导入 `VERSION`。
