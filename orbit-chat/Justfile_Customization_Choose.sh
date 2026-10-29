#!/bin/bash
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