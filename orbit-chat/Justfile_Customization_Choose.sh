#!/bin/bash

echo "========================================"
echo "    Install fzf (Fuzzy Finder)"
echo "========================================"
echo "1) Ubuntu / Debian / Linux Mint"
echo "2) Fedora / RHEL"
echo "3) Arch Linux"
echo "4) macOS (Homebrew)"
echo "========================================"

read -p "Choose your operating system (1-4): " CHOOSE

case $CHOOSE in
    1)
        echo "Installing on Ubuntu / Debian / Linux Mint..."
        sudo apt update && sudo apt install -y fzf
        ;;
    2)
        echo "Installing on Fedora / RHEL..."
        sudo dnf install -y fzf
        ;;
    3)
        echo "Installing on Arch Linux..."
        sudo pacman -Syu --noconfirm fzf
        ;;
    4)
        echo "Installing on macOS via Homebrew..."
        brew install fzf
        ;;
    *)
        echo "Invalid option. Please check online for installation instructions instructions."
        exit 1
        ;;
esac

# Safely reload shell configuration if it exists
if [ -f ~/.bashrc ]; then
    source ~/.bashrc
fi

echo "fzf installation completed successfully!"

# # -----------------------------------------------------------------------------------------------------------------------------------

echo ".................. JUSTFILE  ..............................."
echo "-------------JUST_CHOOSER environment variable or the --chooser flag"

    # full enisstial path 
VALUE_JUSTFILE="export JUST_CHOOSER='fzf --header \"⚡ Select Task\" --height 40% --layout reverse --border'"


if ! grep -Fxq "$VALUE_JUSTFILE"  ~/.bashrc; then
    echo "............add content on path.............>> ~/.bashrc <<"
    echo "$VALUE_JUSTFILE" | tee  ~/.bashrc
    echo "..................CONFIGURED..........................."
    cat ~/.bashrc | grep  -Fxq "$VALUE_JUSTFILE"



else
    echo "Configuration already mentioned in ~/.bashrc."

fi
echo "................................................................................. "