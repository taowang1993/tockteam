<p align="center">
  <strong>简体中文</strong> ·
  <a href="./README.en.md">English</a>
</p>

<div align="center">
  <img src="./assets/dsh-whale.png" width="136" alt="TockTeam whale">
  <h1>TockTeam</h1>
  <p><strong>一套 DSH runtime，多种可独立安装的交互方式。</strong></p>
</div>

<p align="center">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-12%2B-111111?logo=apple&logoColor=white">
  <img alt="Linux" src="https://img.shields.io/badge/Linux-x64-FCC624?logo=linux&logoColor=black">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-x64-0078D6?logo=windows&logoColor=white">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-34a853">
</p>

<p align="center">
  <img src="./assets/tockteam-desktop-overview.png" alt="TockTeam Desktop" width="100%">
</p>

TockTeam 把 DeepSeek Harness、Node.js 和本地能力打包成可安装的 Desktop、
Web 与 TUI 发行版。模型仍运行在云端；TockTeam 负责 Workspace、终端、
Git Review、浏览器、窗口集成和插件生命周期。

## 下载与安装

从 [GitHub Releases](https://github.com/taowang1993/tockteam/releases/latest)
选择需要的发行形态：

| 发行形态 | 包含内容 | 适合场景 |
| --- | --- | --- |
| 完整版 | **TockTeam Desktop**、Web、TUI、Node runtime 和内置插件 | 本地开发工作台 |
| Web-only | **TockTeam Web**、Node runtime 和内置 Web 插件，不含 Electron | 轻量安装、浏览器或远程使用 |
| TUI-only | **TockTeam TUI**、Node runtime 和终端插件，不含 Electron | 纯终端环境 |

完整版目前提供 macOS 的 DMG/ZIP 和 Linux 的 AppImage/deb；暂不发布
Windows 构件。macOS 打开 DMG 后，将 **TockTeam Desktop** 拖入 Applications；
Linux 可直接运行 AppImage，或用 `apt` 安装 deb。

Web-only 包解压后即可启动：

```sh
tar -xzf tockteam-web-*.tar.gz
cd tockteam-web-*/
./bin/tockteam web
```

默认地址是 <http://127.0.0.1:3080>。

TUI-only 包同样解压即用：

```sh
tar -xzf tockteam-tui-*.tar.gz
cd tockteam-tui-*/
./bin/tockteam tui
```

### 安装统一命令

macOS 完整版可将应用内的启动器加入 `PATH`：

```sh
sudo ln -sf \
  "/Applications/TockTeam Desktop.app/Contents/Resources/bin/tockteam" \
  /usr/local/bin/tockteam
```

Web-only 与 TUI-only 包可直接运行 `./bin/tockteam`，也可以把它加入 `PATH`。

## 启动方式

```sh
tockteam desktop   # 启动 TockTeam Desktop
tockteam web       # 启动 TockTeam Web
tockteam tui       # 启动 TockTeam TUI
```

使用 `tockteam web --help` 或 `tockteam tui --help` 查看对应选项。

## 从源码运行

需要 Node.js、pnpm 和平台构建工具：

```sh
git submodule update --init --recursive
pnpm install
pnpm run build:dsh
pnpm run build
pnpm run stage:dsh
export PATH="$PWD/bin:$PATH"

tockteam desktop
tockteam web
tockteam tui
```

打包完整版使用对应平台的 `dist:mac`、`dist:linux` 或 `dist:win`；只打包
Web 使用 `pnpm run dist:web`；只打包 TUI 使用 `pnpm run dist:tui`。

<details>
<summary><strong>更多界面</strong></summary>

### 插件市场

![TockTeam 插件市场](./assets/tockteam-plugin-marketplace.png)

### TockTeam 皮肤

![TockTeam 跨界面皮肤](./assets/tockteam-desktop-skins.png)

</details>

## 文档

- [设计与插件边界](./docs/design.md)
- [安装、操作与排错](./docs/usage.md)

## 上游依赖

| 上游仓库 | TockTeam 中的用途 |
| --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-harness/deepseek-harness) | DSH runtime、会话与插件加载器 |
| [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) | **TockTeam TUI 的直接上游插件**，提供终端渲染、交互和命令体系 |
| [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | Git Review、文件与 PTY Host 能力 |

`dsh-TUI` 以固定提交的 Git submodule 存放在 `upstream/dsh-TUI`。
TockTeam 保留其上游实现与署名，并负责 `tockteam tui` 启动器、`~/.tockteam`
数据隔离、统一标题、跨端皮肤及发行打包。详细边界见设计文档。

## License

[MIT](./LICENSE)
