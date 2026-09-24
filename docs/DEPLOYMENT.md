# 部署与分发

## 1. 开发环境

```powershell
npm install
npm run dev
```

`npm run dev` 会启动 Electron 并使用 Vite HMR，改渲染进程代码即时生效。

## 2. 指定资料库位置

优先级从高到低：

1. `STM32_RAG_DATA_ROOT` 环境变量。
2. `data-location.json` 指针（应用内迁移时写入）。
3. 用户文档目录下的 `STM32RAG知识库`。

自动化测试或 CI 建议显式指定，避免污染真实资料库：

```powershell
$env:STM32_RAG_DATA_ROOT = "$env:TEMP\stm32-rag-test"
npm run dev
```

## 3. 打包

```powershell
npm run dist:win
```

产物：`release/STM32 手册智能体-Setup-<version>.exe`。

打包配置见 `electron-builder.yml`：

- `files`：只打包 `out/**` 与 `package.json`。
- `extraResources`：只带 `resources/library-manifest.json`（空数组）。
- **不会打包 `resources/library/`**，即安装包里没有任何手册。

重新打包前记得先在应用里完全退出，否则文件可能被占用：

```powershell
Get-Process -Name "STM32 手册智能体" -ErrorAction SilentlyContinue | Stop-Process -Force
```

## 4. 安装与目录

| 内容 | 位置 |
|---|---|
| 程序 | `%LOCALAPPDATA%\Programs\manual-lens` |
| 桌面/开始菜单快捷方式 | 由安装程序创建，指向上面的目录 |
| 资料库 | 用户选择的位置，默认 `文档\STM32RAG知识库` |
| 位置指针 | `%APPDATA%\com.local.stm32rag\data-location.json` |

卸载不会删除资料库（`deleteAppDataOnUninstall: false`）。

## 5. 迁移资料库

应用内：知识库管理 → 设置存放位置 → 选文件夹 → 确认 → 自动复制并重启。

手动迁移：把整个资料库目录复制到新位置，然后编辑 `data-location.json`：

```json
{
  "version": 1,
  "dataRoot": "E:\\STM32RAG知识库",
  "updatedAt": 0
}
```

## 6. 分发注意事项

- 让使用者自备手册，不要随安装包分发厂商文档。
- 提醒使用者首次启动后导入自己的 PDF，并配置自己的模型地址与密钥。
- 若在企业内网分发，可提前在设置里填好内部 Base URL，但**不要**把密钥写进任何仓库文件。
- 安装包未签名时 Windows 会提示未知发布者，可自行购买代码签名证书后配置到
  `electron-builder.yml` 的 `win` 段。

## 7. 常见部署问题

**打包后界面仍然是旧的？**
`npm run build` 只更新 `out/`，安装版需要重新 `npm run dist:win` 并覆盖安装。

**换机器后提示找不到资料库？**
修改 `data-location.json` 指向新路径，或删除该文件让应用回落到默认目录后重新导入。

**模型调用失败？**
检查 Base URL 是否包含 `/v1`、密钥是否已保存、网络是否可达；
设置页的「测试聊天」「测试向量」会给出具体错误。
