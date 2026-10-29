# Interactive Task Runner Setup (`just` + `fzf`)

This configuration enables a fuzzy-finding interactive menu for your `justfile` recipes. Instead of memorizing commands, simply running `just` will boot into a clean, searchable terminal menu.

---

## 🛠️ Prerequisites & Installation

Before running the configuration, you must install `just` and `fzf` (the fuzzy finder).

### 1. Install `just`
* **Ubuntu/Debian:** `sudo apt install just`
* **macOS:** `brew install just`
* **Arch Linux:** `sudo pacman -S just`

### 2. Install `fzf` (Essential)
The interactive menu will fail with an `exit status: 127` if `fzf` is missing.
* **Ubuntu/Debian:** `sudo apt update && sudo apt install fzf`
* **macOS:** `brew install fzf`
* **Arch Linux:** `sudo pacman -S fzf`

---

## 🚀 Setup Instructions

### Step 1: Configure your `justfile`
Add the following lines to the very top of the `justfile` in your project root directory:

```makefile
default:
    @just --choose
```

### Step 2: Apply the Environment Variables
Run the automation script to append the layout configurations to your shell profile (`~/.bashrc`).

```bash
chmod +x setup.sh
./setup.sh
```

### Step 3: Reload Your Terminal
For the changes to take effect in your current terminal session, load the updated configuration:

```bash
source ~/.bashrc
```

---

## ⚡ Usage

Once installed and configured, navigate to your project directory and execute:

```bash
just
```

**Controls inside the menu:**
* **`Type text`** to filter tasks instantly.
* **`Arrow Up / Down`** to navigate the list.
* **`Enter`** to execute the highlighted task.
* **`ESC` / `Ctrl + C`** to exit the menu without running anything.
