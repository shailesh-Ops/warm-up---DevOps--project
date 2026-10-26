#!/bin/bash

MY_BACKUP_DIR='/my_linux_files/backup_files'


read -p "you want to add file (yes/no):" answer

if [ ! -d  "$MY_BACKUP_DIR" ]; then
    mkdir -p $MY_BACKUP_DIR 

    echo "backup directory is now to point $MY_BACKUP_DIR"

    if [[ '$answer' == 'yes' ]] && [[ '$answer' == 'no' ]] ; then
        echo "ok start (yes)"

    else 
        echo "stop yet you press(no)"
    fi

else 
    echo "backup bing...."

    fi 




