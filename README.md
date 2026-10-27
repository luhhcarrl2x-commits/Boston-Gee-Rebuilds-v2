# Custom Recovery Builder

<p align="center">
  <img src="https://img.shields.io/badge/Custom%20Recovery%20Builder-000000?style=for-the-badge&logo=android&logoColor=00FF88&labelColor=111111" alt="Title" width="620">
</p>

<p align="center">
  <strong>The Ultimate • Fastest • Most Flexible</strong><br>
  <strong>Custom Recovery Building Platform</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Android-10%20to%2016-3DDC84?style=for-the-badge&logo=android" alt="Android">
  <img src="https://img.shields.io/badge/Powered%20by-AWS%20EC2-FF9900?style=for-the-badge&logo=amazonaws" alt="AWS">
</p>

---

## ⚡ Introduction

**No device tree uploading needed.**  
Just paste the Recovery Tree Git URL and get your custom recovery built privately with Telegram notifications.

---

## ✨ Key Features

- ⚡ **Blazing Fast Builds** on high-end AWS EC2 servers
- 🔒 **100% Private Builds** — Only you can access them
- 📲 **Instant Telegram Notifications**
- 🔗 **URL Based** — Paste any Recovery or Device Tree Git link
- 🌍 Full support for TWRP, OrangeFox, PitchBlack, SHRP, OmniROM & any custom fork
- 🧩 Android 10 to 16 supported

---

## 🚀 How to Build

1. Go to the **Actions** tab
2. Select **"Custom Recovery Builder"** workflow
3. Click **"Run workflow"**
4. Fill the parameters:

| Parameter               | Description                                | Example |
|-------------------------|--------------------------------------------|---------|
| Device Codename         | Device codename                            | `whyred` |
| Recovery Type           | Recovery type                              | `twrp` |
| Android Version         | Target Android version                     | `14` |
| Recovery Tree URL       | Full Git URL of the tree                   | `https://github.com/TeamWin/android_device_xiaomi_whyred` |
| Manifest Branch         | Branch name (optional)                     | `twrp-14.1` |
| Telegram Chat ID        | Your Telegram Chat ID                      | `123456789` |

---

## 🛠 Supported Recoveries

- TWRP (Official & Custom)
- OrangeFox Recovery
- PitchBlack Recovery
- SHRP (SkyHawk Recovery Project)
- OmniROM Recovery
- Any Custom / Legacy Tree

---

## 📊 Tech Stack

| Component            | Technology                  |
|----------------------|-----------------------------|
| Automation           | GitHub Actions              |
| Build Servers        | AWS EC2 High Performance    |
| Acceleration         | CCache + Optimizations      |
| Storage              | Private Amazon S3           |
| Notifications        | Telegram Bot                |

---

## 🧪 Local Launcher Dashboard

This repository also ships a small dashboard (`launcher/`) for driving the workflow
from a browser: it lists recent runs, shows each run's artifacts and dispatches new
builds with the same inputs as the Actions form. It is a development tool — the
build itself still runs on GitHub's runners.

```bash
docker compose -f docker-compose.base44.yml up -d --build
# then open http://localhost:3000
```

Connect it to GitHub by setting a `GITHUB_TOKEN` secret with Actions read/write
access to this repository. Without a token the dashboard still loads and shows a
notice instead of the run list.

---

**Ready to build your recovery?**

<p align="center">
  <a href="https://github.com/Il103/Custom-Recovery-Builder/actions">
    <strong>🚀 START BUILDING NOW →</strong>
  </a>
</p>

---

**Made by BERU (Youssef)** ❤️
